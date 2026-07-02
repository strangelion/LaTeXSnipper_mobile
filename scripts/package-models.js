#!/usr/bin/env node
// Package models into importable ZIP files for LaTeXSnipper.
// Usage: node scripts/package-models.js [--output dist-models]
//
// Package format follows HuggingFace ONNX + PaddleOCR conventions:
//   {category}/{variantId}/
//     model.onnx (or encoder.onnx + decoder.onnx)  — ONNX model weights
//     config.json                                   — model architecture & preprocessing config
//     tokenizer.json                                — [formula-rec] HuggingFace tokenizer vocab
//     ppocr_keys.txt                                — [text-rec] CTC decoding dictionary
//
// Generates:
//   dist-models/model-manifest.json
//   dist-models/latexsnipper-models-all.zip
//   dist-models/latexsnipper-{category}.zip

import { readFileSync, readdirSync, statSync, mkdirSync, writeFileSync, existsSync } from 'fs';
import { join, resolve } from 'path';
import { createHash } from 'crypto';
import zlib from 'zlib';

// ── Config ──

const ROOT = resolve(import.meta.dirname, '..');
const MODELS_DIR = join(ROOT, 'model-sources');
const OUTPUT_DIR = resolve(process.argv.includes('--output')
  ? process.argv[process.argv.indexOf('--output') + 1]
  : join(ROOT, 'dist-models'));

const VERSION = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf-8')).version;

// Category → { sourceDir, variantId, files, config }
// files: null = all files in source directory
// config: model config to generate as config.json (HuggingFace/PaddleOCR convention)
const CATEGORY_MAP = {
  'formula-det': {
    sourceDir: 'mathcraft-formula-det',
    variantId: 'yolov8-mfd',
    files: ['mathcraft-mfd.onnx'],
    config: {
      model_type: 'yolov8',
      model_family: 'YOLOv8 Math Formula Detection',
      license: 'Apache-2.0',
      input: {
        name: 'images',
        shape: [1, 3, 768, 768],
        dtype: 'float32',
        range: [0.0, 1.0],
      },
      output: {
        name: 'output0',
        shape: [1, 6, 8400],
        description: '[batch, 6, num_detections] — 6 = (x, y, w, h, confidence, class)',
      },
      preprocessing: {
        resize: { width: 768, height: 768, keep_ratio: true, pad_value: 114 },
        normalization: { mean: [0, 0, 0], std: [255, 255, 255] },
        color_format: 'BGR',
      },
      postprocessing: {
        type: 'yolo_nms',
        confidence_threshold: 0.25,
        iou_threshold: 0.45,
        max_detections: 100,
        apply_sigmoid: true,
        output_layout: 'row_major',
      },
    },
  },
  'formula-rec': {
    sourceDir: 'mathcraft-formula-rec',
    variantId: 'trocr-deit',
    files: null, // encoder.onnx, decoder.onnx, tokenizer.json, config.json
    config: {
      model_type: 'trocr',
      model_family: 'TrOCR (Transformer OCR) for LaTeX Formula Recognition',
      license: 'MIT',
      encoder: {
        input: {
          name: 'pixel_values',
          shape: [1, 3, 384, 384],
          dtype: 'float32',
          range: [-1.0, 1.0],
        },
        output: {
          name: 'last_hidden_state',
          shape: [1, 577, 384],
        },
      },
      decoder: {
        input_ids: { name: 'input_ids', dtype: 'int64' },
        encoder_hidden: { name: 'encoder_hidden_states' },
        output: { name: 'logits', shape: [1, -1, 50265] },
        max_length: 512,
        eos_token_id: 2,
        pad_token_id: 0,
      },
      preprocessing: {
        resize: { width: 384, height: 384, keep_ratio: true, pad_value: 0 },
        normalization: { mean: [0.5, 0.5, 0.5], std: [0.5, 0.5, 0.5] },
        color_format: 'RGB',
      },
      decoding: {
        type: 'beam_search',
        beam_width: 3,
        top_k: 5,
        tokenizer_file: 'tokenizer.json',
      },
    },
  },
  'text-det': {
    sourceDir: 'mathcraft-text-det',
    variantId: 'ppocrv5-mobile',
    files: null,
    config: {
      model_type: 'dbnet',
      model_family: 'PaddleOCRv5 Differentiable Binarization Text Detection',
      license: 'Apache-2.0',
      input: {
        name: 'x',
        shape: [1, 3, -1, -1], // dynamic H, W
        dtype: 'float32',
        range: [0.0, 1.0],
      },
      output: {
        name: 'save_infer_model/scale_0.tmp_1',
        shape: [1, 1, -1, -1],
        description: 'probability map for text regions',
      },
      preprocessing: {
        normalization: { mean: [0.485, 0.456, 0.406], std: [0.229, 0.224, 0.225] },
        color_format: 'RGB',
        divisible_by: 32,
      },
      postprocessing: {
        type: 'dbnet',
        threshold: 0.3,
        box_threshold: 0.5,
        max_candidates: 1000,
        unclip_ratio: 1.5,
      },
    },
  },
  'text-rec': {
    sourceDir: 'mathcraft-text-rec',
    variantId: 'ppocrv5-mobile',
    files: null, // ppocrv5_mobile_rec.onnx + ppocrv5_keys.txt
    config: {
      model_type: 'crnn_ctc',
      model_family: 'PaddleOCRv5 CRNN Text Recognition with CTC',
      license: 'Apache-2.0',
      input: {
        name: 'x',
        shape: [1, 3, 48, 320],
        dtype: 'float32',
        range: [0.0, 1.0],
      },
      output: {
        name: 'save_infer_model/scale_0.tmp_1',
        shape: [1, -1, 6637],
        description: '[batch, seq_len, vocab_size] CTC logits',
      },
      preprocessing: {
        resize: { height: 48, width: 320, keep_ratio: true, pad_value: 0 },
        normalization: { mean: [0.5, 0.5, 0.5], std: [0.5, 0.5, 0.5] },
        color_format: 'RGB',
      },
      decoding: {
        type: 'ctc_greedy',
        blank_id: 0,
        keys_file: 'ppocr_keys.txt',
      },
    },
  },
  // 'doc-ori' — bundled in APK, not distributed as downloadable package
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
      // Skip non-model files: .gitignore, .txt (non-dict), build artifacts
      if (entry.name === '.gitignore') continue;
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
  console.log(`Format: HuggingFace ONNX + PaddleOCR conventions`);
  console.log(`Models dir: ${MODELS_DIR}`);
  console.log(`Output dir: ${OUTPUT_DIR}`);
  console.log();

  mkdirSync(OUTPUT_DIR, { recursive: true });

  // Build manifest
  // baseUrl: GitHub raw URL for the directory containing ZIPs
  // baseUrl: Points to GitHub Release download directory for ZIP files.
  // Update this when creating a new release: .../releases/download/{tag}/
  const manifestBaseUrl = process.env.MODEL_BASE_URL || 'https://github.com/strangelion/LaTeXSnipper_mobile/releases/download/models-v1.3.0';
  const manifest = {
    sourceId: 'official',
    sourceLabel: 'LaTeXSnipper Official',
    version: VERSION,
    baseUrl: manifestBaseUrl,
    mirrors: [
      'https://gh.zwy.one/https://github.com/strangelion/LaTeXSnipper_mobile/releases/download/models-v1.3.0',
      'https://gh.xxooo.cf/https://github.com/strangelion/LaTeXSnipper_mobile/releases/download/models-v1.3.0',
    ],
    checksums: {}, // { filename: "sha256hex" } — filled after ZIPs are written
    categories: {},
  };

  const categoryFiles = {}; // category → [{ zipPath, sourcePath, filename, size }]
  let missingDictWarnings = [];

  for (const [category, config] of Object.entries(CATEGORY_MAP)) {
    const sourceDir = join(MODELS_DIR, config.sourceDir);
    const variantId = config.variantId;

    // Get files for this category
    let files;
    if (config.files) {
      files = config.files.map(f => {
        const fullPath = join(sourceDir, f);
        if (!existsSync(fullPath)) {
          console.error(`  ERROR: ${fullPath} not found!`);
          return null;
        }
        return { relPath: f, fullPath, size: statSync(fullPath).size };
      }).filter(Boolean);
    } else {
      files = getAllFiles(sourceDir);
    }

    // Validate decoder-critical files
    if (category === 'formula-rec') {
      if (!files.some(f => f.relPath === 'tokenizer.json')) {
        missingDictWarnings.push(`${category}: tokenizer.json missing — formula decoding will fail`);
      }
    }
    if (category === 'text-rec') {
      if (!files.some(f => f.relPath === 'ppocrv5_keys.txt' || f.relPath === 'ppocr_keys.txt')) {
        missingDictWarnings.push(`${category}: ppocr_keys.txt missing — text decoding will fail`);
      }
    }

    // Build ZIP paths: {category}/{variantId}/{filename}
    const zipFiles = files.map(f => ({
      zipPath: `${category}/${variantId}/${f.relPath}`,
      sourcePath: f.fullPath,
      filename: f.relPath,
      size: f.size,
    }));

    // Add config.json to ZIP (generated from CATEGORY_MAP config)
    if (config.config) {
      zipFiles.push({
        zipPath: `${category}/${variantId}/config.json`,
        sourcePath: null, // generated, not from disk
        filename: 'config.json',
        size: Buffer.byteLength(JSON.stringify(config.config, null, 2)),
        generated: true,
        data: JSON.stringify(config.config, null, 2),
      });
    }

    categoryFiles[category] = zipFiles;

    // Add to manifest
    const totalSize = zipFiles.reduce((s, f) => s + f.size, 0);
    manifest.categories[category] = {
      label: CAT_LABELS[category],
      required: false,
      default: variantId,
      variants: [{
        id: variantId,
        label: CAT_LABELS[category],
        modelType: config.config?.model_type || 'unknown',
        files: zipFiles.map(f => f.filename),
        sizeBytes: totalSize,
        zipFile: `latexsnipper-${category}.zip`,
      }],
    };

    console.log(`${category}: ${zipFiles.length} files, ${formatSize(totalSize)}`);
  }

  // Print warnings
  if (missingDictWarnings.length > 0) {
    console.error('\n  !! WARNINGS:');
    for (const w of missingDictWarnings) console.error(`     ${w}`);
    console.error();
  }

  // Create per-category ZIPs (each with a single-category manifest)
  for (const [category, files] of Object.entries(categoryFiles)) {
    const zip = new ZipWriter();
    const catManifest = {
      sourceId: `official-${category}`,
      sourceLabel: `LaTeXSnipper Official — ${CAT_LABELS[category]}`,
      version: VERSION,
      baseUrl: '',
      categories: { [category]: manifest.categories[category] },
    };
    zip.addFile('model-manifest.json', JSON.stringify(catManifest, null, 2));
    for (const f of files) {
      if (f.generated) {
        zip.addFile(f.zipPath, f.data);
      } else {
        zip.addFile(f.zipPath, readFileSync(f.sourcePath));
      }
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
      if (f.generated) {
        allZip.addFile(f.zipPath, f.data);
      } else {
        allZip.addFile(f.zipPath, readFileSync(f.sourcePath));
      }
    }
  }
  const allZipData = allZip.generate();
  const allZipPath = join(OUTPUT_DIR, 'latexsnipper-models-all.zip');
  writeFileSync(allZipPath, allZipData);
  console.log(`\nComplete package: ${formatSize(allZipData.length)}`);

  // Generate SHA256 checksums for all ZIP files
  const zipFiles = readdirSync(OUTPUT_DIR).filter(f => f.endsWith('.zip'));
  for (const zipFile of zipFiles) {
    const data = readFileSync(join(OUTPUT_DIR, zipFile));
    const hash = createHash('sha256').update(data).digest('hex');
    manifest.checksums[zipFile] = hash;
    console.log(`  ${zipFile}: sha256=${hash.substring(0, 16)}...`);
  }

  // Write manifest with checksums
  const manifestPath = join(OUTPUT_DIR, 'model-manifest.json');
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  console.log(`\nManifest: ${manifestPath}`);

  // Summary
  console.log('\nDone! Files:');
  const outputs = readdirSync(OUTPUT_DIR);
  for (const f of outputs) {
    const size = statSync(join(OUTPUT_DIR, f)).size;
    console.log(`  ${f} (${formatSize(size)})`);
  }
}

main();
