#!/usr/bin/env node
// Package models into importable ZIP files for LaTeXSnipper.
// Usage: node scripts/package-models.js [--output dist-models]
//
// Generates:
//   dist-models/model-manifest.json          — manifest for LaTeXSnipper-models repo
//   dist-models/latexsnipper-models-all.zip   — complete package (all categories)
//   dist-models/latexsnipper-formula-det.zip  — per-category packages
//   dist-models/latexsnipper-formula-rec.zip
//   dist-models/latexsnipper-text-det.zip
//   dist-models/latexsnipper-text-rec.zip
//   dist-models/latexsnipper-doc-ori.zip
//   dist-models/latexsnipper-region-det.zip

import { readFileSync, readdirSync, statSync, mkdirSync, writeFileSync, createWriteStream } from 'fs';
import { join, resolve, relative } from 'path';
import { createHash } from 'crypto';
import zlib from 'zlib';

// ── Config ──

const ROOT = resolve(import.meta.dirname, '..');
const MODELS_DIR = join(ROOT, 'public', 'models');
const OUTPUT_DIR = resolve(process.argv.includes('--output')
  ? process.argv[process.argv.indexOf('--output') + 1]
  : join(ROOT, 'dist-models'));

const VERSION = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf-8')).version;

// Category → { sourceDir, variantId, files }
// Maps logical categories to actual directory/file structure in public/models/
const CATEGORY_MAP = {
  'formula-det': {
    sourceDir: 'mathcraft-formula-det',
    variantId: 'mathcraft-mfd',
    files: null, // null = all .onnx files in directory
  },
  'formula-rec': {
    sourceDir: 'mathcraft-formula-rec',
    variantId: 'trocr-deit',
    files: null,
  },
  'text-det': {
    sourceDir: 'mathcraft-text-det',
    variantId: 'ppocrv5-mobile',
    files: null,
  },
  'text-rec': {
    sourceDir: 'mathcraft-text-rec',
    variantId: 'ppocrv5-mobile',
    files: null,
    // Include all files from text-rec dir (rec model + doc-ori + orientation + dict)
  },
  'doc-ori': {
    sourceDir: 'mathcraft-text-rec',
    variantId: 'pplcnet-doc-ori',
    files: ['pplcnet_doc_ori.onnx'],
  },
  // 'region-det' deprecated — chinese_detector.onnx remains bundled in APK as fallback
};

const CAT_LABELS = {
  'formula-det': 'Formula Detection',
  'formula-rec': 'Formula Recognition',
  'text-det': 'Text Detection',
  'text-rec': 'Text Recognition',
  'doc-ori': 'Document Orientation',
  'region-det': 'Region Classification',
};

// ── ZIP writer (minimal, no dependencies) ──

class ZipWriter {
  constructor() {
    this.entries = [];
  }

  addFile(name, data) {
    this.entries.push({ name, data: Buffer.from(data) });
  }

  addDirectory(dirPath, prefix = '') {
    const entries = readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dirPath, entry.name);
      const zipPath = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        this.addDirectory(fullPath, zipPath);
      } else if (entry.isFile()) {
        this.addFile(zipPath, readFileSync(fullPath));
      }
    }
  }

  generate() {
    const files = [];
    let offset = 0;

    // Local file headers + data
    for (const entry of this.entries) {
      const nameBuf = Buffer.from(entry.name, 'utf-8');
      const crc = crc32(entry.data);
      const compressed = zlib.deflateRawSync(entry.data);

      // Use compression only if it actually saves space
      const useCompress = compressed.length < entry.data.length;
      const storedData = useCompress ? compressed : entry.data;
      const method = useCompress ? 8 : 0; // 8=deflate, 0=stored

      const header = Buffer.alloc(30);
      header.writeUInt32LE(0x04034b50, 0);  // signature
      header.writeUInt16LE(20, 4);           // version needed
      header.writeUInt16LE(0, 6);            // flags
      header.writeUInt16LE(method, 8);       // compression method
      header.writeUInt32LE(crc, 14);         // crc32
      header.writeUInt32LE(storedData.length, 18);  // compressed size
      header.writeUInt32LE(entry.data.length, 22);  // uncompressed size
      header.writeUInt16LE(nameBuf.length, 26);     // filename length
      header.writeUInt16LE(0, 28);           // extra field length

      files.push({
        name: nameBuf,
        data: storedData,
        crc,
        method,
        compressedSize: storedData.length,
        uncompressedSize: entry.data.length,
        offset,
      });

      offset += header.length + nameBuf.length + storedData.length;
    }

    // Central directory
    const centralDir = [];
    for (const f of files) {
      const buf = Buffer.alloc(46 + f.name.length);
      buf.writeUInt32LE(0x02014b50, 0);     // signature
      buf.writeUInt16LE(20, 4);              // version made by
      buf.writeUInt16LE(20, 6);              // version needed
      buf.writeUInt16LE(0, 8);               // flags
      buf.writeUInt16LE(f.method, 10);       // compression method
      buf.writeUInt32LE(f.crc, 16);          // crc32
      buf.writeUInt32LE(f.compressedSize, 20);
      buf.writeUInt32LE(f.uncompressedSize, 24);
      buf.writeUInt16LE(f.name.length, 28);
      buf.writeUInt16LE(0, 30);              // extra length
      buf.writeUInt16LE(0, 32);              // comment length
      buf.writeUInt16LE(0, 34);              // disk number
      buf.writeUInt16LE(0, 36);              // internal attrs
      buf.writeUInt32LE(0, 38);              // external attrs
      buf.writeUInt32LE(f.offset, 42);       // local header offset
      f.name.copy(buf, 46);
      centralDir.push(buf);
    }

    const centralDirOffset = offset;
    const centralDirSize = centralDir.reduce((s, b) => s + b.length, 0);

    // End of central directory
    const eocd = Buffer.alloc(22);
    eocd.writeUInt32LE(0x06054b50, 0);
    eocd.writeUInt16LE(0, 4);                // disk number
    eocd.writeUInt16LE(0, 6);                // disk with cd
    eocd.writeUInt16LE(files.length, 8);     // entries on disk
    eocd.writeUInt16LE(files.length, 10);    // total entries
    eocd.writeUInt32LE(centralDirSize, 12);
    eocd.writeUInt32LE(centralDirOffset, 16);
    eocd.writeUInt16LE(0, 20);               // comment length

    // Assemble
    const parts = [];
    for (const f of files) {
      const header = Buffer.alloc(30);
      header.writeUInt32LE(0x04034b50, 0);
      header.writeUInt16LE(20, 4);
      header.writeUInt16LE(0, 6);
      header.writeUInt16LE(f.method, 8);
      header.writeUInt32LE(f.crc, 14);
      header.writeUInt32LE(f.compressedSize, 18);
      header.writeUInt32LE(f.uncompressedSize, 22);
      header.writeUInt16LE(f.name.length, 26);
      header.writeUInt16LE(0, 28);
      parts.push(header, f.name, f.data);
    }
    for (const buf of centralDir) parts.push(buf);
    parts.push(eocd);

    return Buffer.concat(parts);
  }
}

function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

// ── Helpers ──

function getAllFiles(dir, prefix = '') {
  const result = [];
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    const relPath = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      result.push(...getAllFiles(fullPath, relPath));
    } else if (entry.isFile()) {
      result.push({ relPath, fullPath, size: statSync(fullPath).size });
    }
  }
  return result;
}

function formatSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

// ── Main ──

function main() {
  console.log(`LaTeXSnipper Model Packager v${VERSION}`);
  console.log(`Models dir: ${MODELS_DIR}`);
  console.log(`Output dir: ${OUTPUT_DIR}`);
  console.log();

  mkdirSync(OUTPUT_DIR, { recursive: true });

  // Build manifest
  const manifest = {
    sourceId: 'official',
    sourceLabel: 'LaTeXSnipper Official',
    version: VERSION,
    baseUrl: '',
    categories: {},
  };

  const categoryFiles = {}; // category → [{ variantPath, sourcePath, filename, size }]

  for (const [category, config] of Object.entries(CATEGORY_MAP)) {
    const sourceDir = join(MODELS_DIR, config.sourceDir);
    const variantId = config.variantId;

    // Get files for this category
    let files;
    if (config.files) {
      // Specific files
      files = config.files.map(f => {
        const fullPath = join(sourceDir, f);
        const size = statSync(fullPath).size;
        return { relPath: f, fullPath, size };
      });
    } else {
      // All files in directory
      files = getAllFiles(sourceDir);
    }

    // Build ZIP paths: {category}/{variantId}/{filename}
    categoryFiles[category] = files.map(f => ({
      zipPath: `${category}/${variantId}/${f.relPath}`,
      sourcePath: f.fullPath,
      filename: f.relPath,
      size: f.size,
    }));

    // Add to manifest
    const totalSize = files.reduce((s, f) => s + f.size, 0);
    manifest.categories[category] = {
      label: CAT_LABELS[category],
      required: false,
      default: variantId,
      variants: [{
        id: variantId,
        label: CAT_LABELS[category],
        files: files.map(f => f.filename),
        sizeBytes: totalSize,
      }],
    };

    console.log(`${category}: ${files.length} files, ${formatSize(totalSize)}`);
  }

  // Write manifest
  const manifestPath = join(OUTPUT_DIR, 'model-manifest.json');
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  console.log(`\nManifest: ${manifestPath}`);

  // Create per-category ZIPs (each with a single-category manifest)
  for (const [category, files] of Object.entries(categoryFiles)) {
    const zip = new ZipWriter();
    // Per-category manifest: only this category, unique sourceId
    const catManifest = {
      sourceId: `official-${category}`,
      sourceLabel: `LaTeXSnipper Official — ${CAT_LABELS[category]}`,
      version: VERSION,
      baseUrl: '',
      categories: { [category]: manifest.categories[category] },
    };
    zip.addFile('model-manifest.json', JSON.stringify(catManifest, null, 2));
    for (const f of files) {
      zip.addFile(f.zipPath, readFileSync(f.sourcePath));
    }
    const zipData = zip.generate();
    const zipPath = join(OUTPUT_DIR, `latexsnipper-${category}.zip`);
    writeFileSync(zipPath, zipData);
    console.log(`  ${category}.zip: ${formatSize(zipData.length)}`);
  }

  // Create complete ZIP (all categories)
  const allZip = new ZipWriter();
  allZip.addFile('model-manifest.json', JSON.stringify(manifest, null, 2));
  for (const files of Object.values(categoryFiles)) {
    for (const f of files) {
      allZip.addFile(f.zipPath, readFileSync(f.sourcePath));
    }
  }
  const allZipData = allZip.generate();
  const allZipPath = join(OUTPUT_DIR, 'latexsnipper-models-all.zip');
  writeFileSync(allZipPath, allZipData);
  console.log(`\nComplete package: ${formatSize(allZipData.length)}`);

  // Summary
  console.log('\nDone! Files:');
  const outputs = readdirSync(OUTPUT_DIR);
  for (const f of outputs) {
    const size = statSync(join(OUTPUT_DIR, f)).size;
    console.log(`  ${f} (${formatSize(size)})`);
  }
}

main();
