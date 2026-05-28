// Region detection pipeline — classifies image into TEXT and FORMULA regions
// Uses a lightweight CNN (chinese_detector.onnx) for Chinese-text detection.
// Ported from test_region_detect.py

import { downloadWithProgress } from './ocr-engine.js';

const DET_BASE = '/models';
let detSession = null;

// ImageNet normalization stats (matches Python training)
const MEAN = [0.485, 0.456, 0.406];
const STD = [0.229, 0.224, 0.225];

// ── Model loading ──

export async function loadRegionDetectModel(onProgress) {
  const buf = await downloadWithProgress(
    DET_BASE + '/chinese_detector.onnx', '中文检测模型', onProgress
  );
  detSession = await ort.InferenceSession.create(buf, {
    executionProviders: ['wasm'],
    graphOptimizationLevel: 'all',
  });
}

export function isRegionDetReady() {
  return detSession !== null;
}

// ── Softmax ──

function softmax(logits) {
  const max = Math.max(...logits);
  const exp = logits.map(x => Math.exp(x - max));
  const sum = exp.reduce((a, b) => a + b, 0);
  return exp.map(x => x / sum);
}

// ── ImageData helpers ──

function getImageData(img) {
  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0);
  const imgData = ctx.getImageData(0, 0, w, h);
  return { pixels: imgData.data, width: w, height: h };
}

function getPixel(imageData, x, y) {
  const idx = (y * imageData.width + x) * 4;
  const p = imageData.pixels;
  return [p[idx], p[idx + 1], p[idx + 2]];
}

// ── Estimate background color from corners ──

function estimateBgColor(imageData) {
  const w = imageData.width;
  const h = imageData.height;
  const corners = [
    getPixel(imageData, 0, 0),
    getPixel(imageData, w - 1, 0),
    getPixel(imageData, 0, h - 1),
    getPixel(imageData, w - 1, h - 1),
    getPixel(imageData, Math.floor(w / 2), 0),
    getPixel(imageData, Math.floor(w / 2), h - 1),
    getPixel(imageData, 0, Math.floor(h / 2)),
    getPixel(imageData, w - 1, Math.floor(h / 2)),
  ];
  const sortedR = corners.map(c => c[0]).sort((a, b) => a - b);
  const sortedG = corners.map(c => c[1]).sort((a, b) => a - b);
  const sortedB = corners.map(c => c[2]).sort((a, b) => a - b);
  const medR = Math.round((sortedR[3] + sortedR[4]) / 2);
  const medG = Math.round((sortedG[3] + sortedG[4]) / 2);
  const medB = Math.round((sortedB[3] + sortedB[4]) / 2);
  return [medR, medG, medB];
}

// ── Stage 1: Find content blocks by pixel scanning ──

function findContentByPixels(imageData, bgTol) {
  const w = imageData.width;
  const h = imageData.height;
  const bg = estimateBgColor(imageData);
  bgTol = bgTol || 20;

  // Build content mask: pixel differs from bg
  const rowContent = new Uint8Array(h);
  for (let y = 0; y < h; y++) {
    let count = 0;
    for (let x = 0; x < w; x++) {
      const p = getPixel(imageData, x, y);
      const diff = Math.max(Math.abs(p[0] - bg[0]), Math.abs(p[1] - bg[1]), Math.abs(p[2] - bg[2]));
      if (diff > bgTol) count++;
    }
    rowContent[y] = count;
  }

  // Group rows with content into bands
  const minContentPixels = 5;
  const bands = [];
  let inBand = false;
  let bandStart = 0;
  for (let y = 0; y < h; y++) {
    if (rowContent[y] >= minContentPixels && !inBand) {
      bandStart = y;
      inBand = true;
    } else if (rowContent[y] < minContentPixels && inBand) {
      bands.push([bandStart, y - 1]);
      inBand = false;
    }
  }
  if (inBand) bands.push([bandStart, h - 1]);
  if (bands.length === 0) return [{ x: 0, y: 0, w, h }];

  // Column-continuity: bridge gaps crossed by tall thin symbols
  const maxSymbolGap = 100;

  // Precompute which rows have content (boolean mask for fast column scans)
  const hasContent = new Uint8Array(h * w);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = getPixel(imageData, x, y);
      const diff = Math.max(Math.abs(p[0] - bg[0]), Math.abs(p[1] - bg[1]), Math.abs(p[2] - bg[2]));
      if (diff > bgTol) hasContent[y * w + x] = 1;
    }
  }

  function continuousColsThroughGap(gapY1, gapY2) {
    if (gapY1 > gapY2) return 0;
    const gapH = gapY2 - gapY1 + 1;
    const needed = Math.max(1, Math.floor(gapH * 0.3));
    let colsCrossing = 0;
    for (let x = 0; x < w; x++) {
      let colContent = 0;
      for (let y = gapY1; y <= gapY2; y++) {
        if (hasContent[y * w + x]) colContent++;
      }
      if (colContent >= needed) colsCrossing++;
    }
    return colsCrossing;
  }

  function xOverlapRatio(y1a, y2a, y1b, y2b) {
    // Find x-extent of content in each band
    let ax1 = w, ax2 = 0;
    for (let y = y1a; y <= y2a; y++) {
      for (let x = 0; x < w; x++) {
        if (hasContent[y * w + x]) { ax1 = Math.min(ax1, x); ax2 = Math.max(ax2, x); }
      }
    }
    if (ax1 >= ax2) return 0;
    const aw = ax2 - ax1 + 1;

    let bx1 = w, bx2 = 0;
    for (let y = y1b; y <= y2b; y++) {
      for (let x = 0; x < w; x++) {
        if (hasContent[y * w + x]) { bx1 = Math.min(bx1, x); bx2 = Math.max(bx2, x); }
      }
    }
    if (bx1 >= bx2) return 0;
    const bw = bx2 - bx1 + 1;

    const ox1 = Math.max(ax1, bx1);
    const ox2 = Math.min(ax2, bx2);
    if (ox1 >= ox2) return 0;
    return (ox2 - ox1) / Math.min(aw, bw);
  }

  function isFragment(y1, y2) {
    let x1 = w, x2 = 0;
    for (let y = y1; y <= y2; y++) {
      for (let x = 0; x < w; x++) {
        if (hasContent[y * w + x]) { x1 = Math.min(x1, x); x2 = Math.max(x2, x); }
      }
    }
    const bw = x1 < x2 ? x2 - x1 + 1 : 1;
    return bw < 300 || (y2 - y1 + 1) < 20;
  }

  // Merge bands
  const mergedBands = [];
  let curStart = bands[0][0], curEnd = bands[0][1];
  for (let i = 1; i < bands.length; i++) {
    const [start, end] = bands[i];
    const gap = start - curEnd - 1;
    if (gap <= 0) {
      curEnd = Math.max(curEnd, end);
      continue;
    }
    if (gap > maxSymbolGap) {
      mergedBands.push([curStart, curEnd]);
      curStart = start; curEnd = end;
      continue;
    }
    const colsCross = continuousColsThroughGap(curEnd + 1, start - 1);
    const xOverlap = xOverlapRatio(curStart, curEnd, start, end);
    const prevIsFrag = isFragment(curStart, curEnd);
    const nextIsFrag = isFragment(start, end);

    if (xOverlap >= 0.3 && (prevIsFrag || nextIsFrag) && colsCross >= 2) {
      curEnd = end;
    } else if (colsCross >= 5) {
      curEnd = end;
    } else {
      mergedBands.push([curStart, curEnd]);
      curStart = start; curEnd = end;
    }
  }
  mergedBands.push([curStart, curEnd]);

  // Find horizontal bounds for each band
  const minWidth = 40, minHeight = 15;
  const blocks = [];
  for (const [y1, y2] of mergedBands) {
    let x1 = w, x2 = 0;
    for (let y = y1; y <= y2; y++) {
      for (let x = 0; x < w; x++) {
        if (hasContent[y * w + x]) { x1 = Math.min(x1, x); x2 = Math.max(x2, x); }
      }
    }
    if (x1 > x2) continue;
    const bw = x2 - x1 + 1;
    const bh = y2 - y1 + 1;
    if (bw >= minWidth && bh >= minHeight) {
      blocks.push({ x: x1, y: y1, w: bw, h: bh });
    }
  }

  // Sort by reading order
  blocks.sort((a, b) => a.y - b.y || a.x - b.x);

  // Merge overlapping blocks with column-continuity check
  const final = [];
  for (const blk of blocks) {
    let merged = false;
    if (final.length > 0) {
      const prev = final[final.length - 1];
      const vGap = blk.y - (prev.y + prev.h);
      if (vGap <= 0) {
        if (!(blk.x + blk.w < prev.x || prev.x + prev.w < blk.x)) {
          const nx = Math.min(prev.x, blk.x);
          const ny = Math.min(prev.y, blk.y);
          const nw = Math.max(prev.x + prev.w, blk.x + blk.w) - nx;
          const nh = Math.max(prev.y + prev.h, blk.y + blk.h) - ny;
          final[final.length - 1] = { x: nx, y: ny, w: nw, h: nh };
          merged = true;
        }
      } else if (vGap <= maxSymbolGap) {
        const colsCross = continuousColsThroughGap(prev.y + prev.h, blk.y - 1);
        const ox1 = Math.max(prev.x, blk.x);
        const ox2 = Math.min(prev.x + prev.w, blk.x + blk.w);
        const xOverlap = ox1 < ox2 ? (ox2 - ox1) / Math.min(prev.w, blk.w) : 0;
        const prevIsFrag = (prev.w < 300 || prev.h < 20);
        const nextIsFrag = (blk.w < 300 || blk.h < 20);
        if (xOverlap >= 0.3 && (prevIsFrag || nextIsFrag) && colsCross >= 2) {
          const nx = Math.min(prev.x, blk.x);
          const nw = Math.max(prev.x + prev.w, blk.x + blk.w) - nx;
          const nh = blk.y + blk.h - prev.y;
          final[final.length - 1] = { x: nx, y: prev.y, w: nw, h: nh };
          merged = true;
        }
      }
    }
    if (!merged) final.push(blk);
  }

  if (final.length === 0) return [{ x: 0, y: 0, w, h }];
  return final;
}

// ── Stage 1.5: Split blocks into lines ──

function splitBlockIntoLines(imageData, block, bgColor, bgTol) {
  bgTol = bgTol || 20;
  const w = imageData.width;
  const { x: bx, y: by, w: bw, h: bh } = block;

  // Row content count
  const rowContent = new Uint16Array(bh);
  for (let y = 0; y < bh; y++) {
    let count = 0;
    for (let x = 0; x < bw; x++) {
      const p = getPixel(imageData, bx + x, by + y);
      const diff = Math.max(
        Math.abs(p[0] - bgColor[0]),
        Math.abs(p[1] - bgColor[1]),
        Math.abs(p[2] - bgColor[2])
      );
      if (diff > bgTol) count++;
    }
    rowContent[y] = count;
  }

  const threshold = 8;
  const effectiveMinGap = bh > 100 ? 7 : 12;

  // Find gaps (empty row segments)
  const gaps = [];
  let inGap = false;
  let gapStart = 0;
  for (let y = 0; y < bh; y++) {
    if (rowContent[y] < threshold && !inGap) {
      gapStart = y; inGap = true;
    } else if (rowContent[y] >= threshold && inGap) {
      if (y - gapStart >= effectiveMinGap) gaps.push([gapStart, y]);
      inGap = false;
    }
  }
  if (inGap && bh - gapStart >= effectiveMinGap) gaps.push([gapStart, bh]);
  if (gaps.length === 0) return [{ x: bx, y: by, w: bw, h: bh }];

  // Build content mask for column-continuity check
  const contentMask = new Uint8Array(bw * bh);
  for (let y = 0; y < bh; y++) {
    for (let x = 0; x < bw; x++) {
      const p = getPixel(imageData, bx + x, by + y);
      const diff = Math.max(
        Math.abs(p[0] - bgColor[0]),
        Math.abs(p[1] - bgColor[1]),
        Math.abs(p[2] - bgColor[2])
      );
      contentMask[y * bw + x] = diff > bgTol ? 1 : 0;
    }
  }

  // Filter gaps: must have zero columns crossing
  const validGaps = [];
  for (const [gs, ge] of gaps) {
    const gapH = ge - gs;
    const needed = Math.max(1, Math.floor(gapH * 0.3));
    let colsCrossing = 0;
    for (let x = 0; x < bw; x++) {
      let colContent = 0;
      for (let gy = gs; gy < ge; gy++) {
        if (contentMask[gy * bw + x]) colContent++;
      }
      if (colContent >= needed) { colsCrossing++; break; }
    }
    if (colsCrossing === 0) validGaps.push([gs, ge]);
  }

  // Split at valid gaps
  const lines = [];
  let prevEnd = 0;
  for (const [gs, ge] of validGaps) {
    const lh = gs - prevEnd;
    if (lh >= 15) lines.push({ x: bx, y: by + prevEnd, w: bw, h: lh });
    prevEnd = ge;
  }
  if (prevEnd < bh) {
    const lh = bh - prevEnd;
    if (lh >= 15) lines.push({ x: bx, y: by + prevEnd, w: bw, h: lh });
  }
  return lines.length ? lines : [{ x: bx, y: by, w: bw, h: bh }];
}

// ── Stage 1.5b: Split lines into chunks at whitespace gaps ──

function splitLineIntoChunks(imageData, line, bgColor, bgTol) {
  bgTol = bgTol || 20;
  const minGap = 12;
  const { x: lx, y: ly, w: lw, h: lh } = line;

  // Display formulas (tall lines) → single chunk
  if (lh > 100) return [{ x: lx, y: ly, w: lw, h: lh }];

  // Column content count
  const colContent = new Uint16Array(lw);
  for (let x = 0; x < lw; x++) {
    let count = 0;
    for (let y = 0; y < lh; y++) {
      const p = getPixel(imageData, lx + x, ly + y);
      const diff = Math.max(
        Math.abs(p[0] - bgColor[0]),
        Math.abs(p[1] - bgColor[1]),
        Math.abs(p[2] - bgColor[2])
      );
      if (diff > bgTol) count++;
    }
    colContent[x] = count;
  }

  // A column is empty only if zero content pixels
  const emptyCols = colContent.map(c => c < 1);

  // Find vertical gaps
  const gaps = [];
  let inGap = false;
  let gapStart = 0;
  for (let x = 0; x < lw; x++) {
    if (emptyCols[x] && !inGap) { gapStart = x; inGap = true; }
    else if (!emptyCols[x] && inGap) {
      if (x - gapStart >= minGap) gaps.push([gapStart, x]);
      inGap = false;
    }
  }
  if (inGap && lw - gapStart >= minGap) gaps.push([gapStart, lw]);
  if (gaps.length === 0) return [{ x: lx, y: ly, w: lw, h: lh }];

  // Split at gaps (min chunk width = 20)
  const minChunkW = 20;
  const chunks = [];
  let prevEnd = 0;
  for (const [gs, ge] of gaps) {
    const cw = gs - prevEnd;
    if (cw >= minChunkW) chunks.push({ x: lx + prevEnd, y: ly, w: cw, h: lh });
    prevEnd = ge;
  }
  if (prevEnd < lw) {
    const cw = lw - prevEnd;
    if (cw >= minChunkW) chunks.push({ x: lx + prevEnd, y: ly, w: cw, h: lh });
  }
  return chunks.length ? chunks : [{ x: lx, y: ly, w: lw, h: lh }];
}

// ── Preprocess a 64x64 patch for ONNX inference ──

function preprocessPatch(canvas, sx, sy) {
  // Extract 64x64 region from canvas, normalize with ImageNet stats
  const patchCanvas = document.createElement('canvas');
  patchCanvas.width = 64;
  patchCanvas.height = 64;
  const ctx = patchCanvas.getContext('2d');
  ctx.drawImage(canvas, sx, sy, 64, 64, 0, 0, 64, 64);

  const pixels = ctx.getImageData(0, 0, 64, 64).data;
  const n = 64 * 64;
  const floatData = new Float32Array(3 * n);
  for (let i = 0; i < n; i++) {
    const p = i * 4;
    // Normalize: (pixel/255 - mean) / std  → CHW order for ONNX
    floatData[i] = ((pixels[p] / 255) - MEAN[0]) / STD[0];
    floatData[n + i] = ((pixels[p + 1] / 255) - MEAN[1]) / STD[1];
    floatData[2 * n + i] = ((pixels[p + 2] / 255) - MEAN[2]) / STD[2];
  }
  return floatData;
}

// ── Stage 2: Classify lines into TEXT/FORMULA regions ──

async function classifyRegions(img, linesAndChunks, bgColor) {
  const t0 = performance.now();
  const allRegions = [];
  const iw = img.naturalWidth || img.width;
  const ih = img.naturalHeight || img.height;

  // Main canvas for line extraction (full resolution)
  const mainCanvas = document.createElement('canvas');
  mainCanvas.width = iw;
  mainCanvas.height = ih;
  const mainCtx = mainCanvas.getContext('2d');
  mainCtx.drawImage(img, 0, 0);

  for (const [line, chunks] of linesAndChunks) {
    const { x: lx, y: ly, w: lw, h: lh } = line;

    // ── Display formula (h > 100): multi-strip per-x voting ──
    if (lh > 100 && chunks.length === 1) {
      const stripH = 64;
      const stripStride = 32;
      const scale = 64.0 / stripH;
      const step = 8;
      const numSteps = Math.max(1, Math.floor(lw / step));
      const posVotes = Array.from({ length: numSteps + 1 }, () => []);

      // Collect all patches across vertical strips
      const allPatches = [];
      const allMeta = [];

      for (let sy = 0; sy <= lh - stripH; sy += stripStride) {
        const stripCanvas = document.createElement('canvas');
        stripCanvas.width = lw;
        stripCanvas.height = stripH;
        const sctx = stripCanvas.getContext('2d');
        sctx.drawImage(mainCanvas, lx, ly + sy, lw, stripH, 0, 0, lw, stripH);

        const newW = Math.max(1, Math.round(lw * (64.0 / stripH)));
        const scaledCanvas = document.createElement('canvas');
        scaledCanvas.width = newW;
        scaledCanvas.height = 64;
        const scCtx = scaledCanvas.getContext('2d');
        scCtx.drawImage(stripCanvas, 0, 0, lw, stripH, 0, 0, newW, 64);

        for (let px = 0; px <= newW - 64; px += 32) {
          allPatches.push(preprocessPatch(scaledCanvas, px, 0));
          allMeta.push({ sy, px });
        }
      }

      // Fallback if no patches
      if (allPatches.length === 0) {
        const newW = Math.max(1, Math.round(lw * (64.0 / lh)));
        const lineCanvas = document.createElement('canvas');
        lineCanvas.width = newW;
        lineCanvas.height = 64;
        const lctx = lineCanvas.getContext('2d');
        lctx.drawImage(mainCanvas, lx, ly, lw, lh, 0, 0, newW, 64);

        if (newW < 64) {
          const padded = document.createElement('canvas');
          padded.width = 64; padded.height = 64;
          const pctx = padded.getContext('2d');
          pctx.fillStyle = '#ffffff';
          pctx.fillRect(0, 0, 64, 64);
          pctx.drawImage(lineCanvas, Math.floor((64 - newW) / 2), 0);
          allPatches.push(preprocessPatch(padded, 0, 0));
          allMeta.push({ sy: 0, px: 0 });
        } else {
          for (let px = 0; px <= newW - 64; px += 32) {
            allPatches.push(preprocessPatch(lineCanvas, px, 0));
            allMeta.push({ sy: 0, px });
          }
          if (allPatches.length === 0) {
            const px = Math.floor((newW - 64) / 2);
            allPatches.push(preprocessPatch(lineCanvas, px, 0));
            allMeta.push({ sy: 0, px });
          }
        }
      }

      // Run batch inference
      const chineseConfs = await runBatchInference(allPatches);

      // Per-x voting
      for (let i = 0; i < allMeta.length; i++) {
        const { sy, px } = allMeta[i];
        const cconf = chineseConfs[i];
        const origX1 = lx + Math.floor(px / scale);
        const origX2 = lx + Math.floor((px + 64) / scale);
        const i1 = Math.max(0, Math.floor((origX1 - lx) / step));
        const i2 = Math.min(numSteps, Math.floor((origX2 - lx) / step));
        for (let idx = i1; idx <= i2; idx++) {
          posVotes[idx].push(cconf);
        }
      }

      // Assign labels
      let posLabels = posVotes.map(votes => {
        if (votes.length === 0) return null;
        const avg = votes.reduce((a, b) => a + b, 0) / votes.length;
        return avg >= 0.25 ? 1 : 0;
      });

      // Fill null gaps
      for (let i = 0; i < posLabels.length; i++) {
        if (posLabels[i] === null) {
          let left = null;
          for (let j = i - 1; j >= 0; j--) { if (posLabels[j] !== null) { left = posLabels[j]; break; } }
          let right = null;
          for (let j = i + 1; j < posLabels.length; j++) { if (posLabels[j] !== null) { right = posLabels[j]; break; } }
          posLabels[i] = left !== null ? left : (right !== null ? right : 0);
        }
      }

      // Remove 1-step and 2-step label islands
      for (let pass = 0; pass < 2; pass++) {
        for (let i = 1; i < posLabels.length - 1; i++) {
          if (posLabels[i - 1] === posLabels[i + 1] && posLabels[i] !== posLabels[i - 1]) {
            posLabels[i] = posLabels[i - 1];
          }
        }
        for (let i = 1; i < posLabels.length - 2; i++) {
          if (posLabels[i - 1] === posLabels[i + 2]
              && posLabels[i] !== posLabels[i - 1]
              && posLabels[i + 1] !== posLabels[i - 1]) {
            posLabels[i] = posLabels[i - 1];
            posLabels[i + 1] = posLabels[i - 1];
          }
        }
      }

      // Build sub-regions
      let subStart = 0;
      for (let i = 1; i < posLabels.length; i++) {
        if (posLabels[i] !== posLabels[subStart]) {
          const sx = lx + subStart * step;
          const ex = lx + Math.min(lw, i * step);
          const subW = ex - sx;
          if (subW >= 20) allRegions.push({ x: sx, y: ly, w: subW, h: lh, label: posLabels[subStart] });
          subStart = i;
        }
      }
      const sx = lx + subStart * step;
      const ex = lx + lw;
      const subW = ex - sx;
      if (subW >= 20) allRegions.push({ x: sx, y: ly, w: subW, h: lh, label: posLabels[subStart] });
      continue;
    }

    // ── Tall-ish line (60-100px): half-split classification ──
    if (lh >= 60 && lh <= 100) {
      const midY = Math.floor(lh / 2);

      async function classifyHalf(yOffset, halfH) {
        const halfCanvas = document.createElement('canvas');
        halfCanvas.width = lw;
        halfCanvas.height = halfH;
        const hctx = halfCanvas.getContext('2d');
        hctx.drawImage(mainCanvas, lx, ly + yOffset, lw, halfH, 0, 0, lw, halfH);

        const scale = 64.0 / halfH;
        const newW = Math.max(1, Math.round(lw * scale));
        const scaledCanvas = document.createElement('canvas');
        scaledCanvas.width = newW;
        scaledCanvas.height = 64;
        const scCtx = scaledCanvas.getContext('2d');
        scCtx.drawImage(halfCanvas, 0, 0, lw, halfH, 0, 0, newW, 64);

        const patches = [];
        for (let px = 0; px <= newW - 64; px += 32) {
          patches.push(preprocessPatch(scaledCanvas, px, 0));
        }
        if (patches.length === 0) {
          if (newW < 64) {
            const padded = document.createElement('canvas');
            padded.width = 64; padded.height = 64;
            const pctx = padded.getContext('2d');
            pctx.fillStyle = '#ffffff';
            pctx.fillRect(0, 0, 64, 64);
            pctx.drawImage(scaledCanvas, Math.floor((64 - newW) / 2), 0);
            patches.push(preprocessPatch(padded, 0, 0));
          } else {
            const px = Math.floor((newW - 64) / 2);
            patches.push(preprocessPatch(scaledCanvas, px, 0));
          }
        }
        const confs = await runBatchInference(patches);
        const formCount = confs.filter(c => c <= 0.5).length;
        const textCount = confs.length - formCount;
        return formCount >= textCount ? 0 : 1;
      }

      const topLabel = await classifyHalf(0, midY);
      const botLabel = await classifyHalf(midY, lh - midY);

      if (topLabel !== botLabel) {
        allRegions.push({ x: lx, y: ly, w: lw, h: midY, label: topLabel });
        allRegions.push({ x: lx, y: ly + midY, w: lw, h: lh - midY, label: botLabel });
        continue;
      }
      // Labels agree → fall through to normal chunk classification
    }

    // ── Normal line (h <= 100): chunk-level classification with weighted voting ──
    const scaleFactor = 64.0 / lh;
    const newW = Math.max(1, Math.round(lw * scaleFactor));

    // Extract line, scale to 64px height
    const lineCanvas = document.createElement('canvas');
    lineCanvas.width = lw;
    lineCanvas.height = lh;
    const lctx = lineCanvas.getContext('2d');
    lctx.drawImage(mainCanvas, lx, ly, lw, lh, 0, 0, lw, lh);

    const scaledCanvas = document.createElement('canvas');
    scaledCanvas.width = newW;
    scaledCanvas.height = 64;
    const scCtx = scaledCanvas.getContext('2d');
    scCtx.drawImage(lineCanvas, 0, 0, lw, lh, 0, 0, newW, 64);

    // Slide 64x64 window at stride=32
    const stride = 32;
    const patches = [];
    const positions = []; // px in scaled coordinates
    for (let px = 0; px <= newW - 64; px += stride) {
      patches.push(preprocessPatch(scaledCanvas, px, 0));
      positions.push(px);
    }
    if (patches.length === 0) {
      if (newW < 64) {
        const padded = document.createElement('canvas');
        padded.width = 64; padded.height = 64;
        const pctx = padded.getContext('2d');
        pctx.fillStyle = '#ffffff';
        pctx.fillRect(0, 0, 64, 64);
        pctx.drawImage(scaledCanvas, Math.floor((64 - newW) / 2), 0);
        patches.push(preprocessPatch(padded, 0, 0));
        positions.push(0);
      } else {
        const px = Math.floor((newW - 64) / 2);
        patches.push(preprocessPatch(scaledCanvas, px, 0));
        positions.push(px);
      }
    }

    const chineseConfs = await runBatchInference(patches);
    const scale = scaleFactor;

    // Classify each chunk by overlap-width-weighted majority vote
    const chunkLabels = [];
    for (const chunk of chunks) {
      const textThreshold = chunk.w < 55 ? 0.65 : 0.40;
      let textWeight = 0, formWeight = 0;
      const chunkX1 = chunk.x - lx;
      const chunkX2 = chunkX1 + chunk.w;

      for (let i = 0; i < positions.length; i++) {
        const px = positions[i];
        const cconf = chineseConfs[i];
        const winX1 = Math.floor(px / scale);
        const winX2 = Math.floor((px + 64) / scale);
        const overlap = Math.min(winX2, chunkX2) - Math.max(winX1, chunkX1);
        if (overlap > 0) {
          if (cconf >= textThreshold) {
            textWeight += overlap;
          } else {
            formWeight += overlap;
          }
        }
      }
      if (textWeight + formWeight === 0) {
        chunkLabels.push(0);
      } else {
        chunkLabels.push(textWeight >= formWeight ? 1 : 0);
      }
    }

    // Build sub-regions from consecutive same-label chunks
    if (chunks.length > 0) {
      let subStart = 0;
      for (let i = 1; i < chunks.length; i++) {
        if (chunkLabels[i] !== chunkLabels[subStart]) {
          const sx = chunks[subStart].x;
          const prevChunk = chunks[i - 1];
          const ex = prevChunk.x + prevChunk.w;
          const subW = ex - sx;
          if (subW >= 20) {
            allRegions.push({ x: sx, y: ly, w: subW, h: lh, label: chunkLabels[subStart] });
          }
          subStart = i;
        }
      }
      const sx = chunks[subStart].x;
      const lastChunk = chunks[chunks.length - 1];
      const ex = lastChunk.x + lastChunk.w;
      const subW = ex - sx;
      if (subW >= 20) {
        allRegions.push({ x: sx, y: ly, w: subW, h: lh, label: chunkLabels[subStart] });
      }
    }
  }

  // ── Narrow TEXT reclassification: single-symbol chunks between FORMULA regions ──
  if (allRegions.length >= 3) {
    for (let i = 1; i < allRegions.length - 1; i++) {
      const cur = allRegions[i];
      if (cur.w >= 55 || cur.label !== 1) continue;
      const left = allRegions[i - 1];
      const right = allRegions[i + 1];
      if (left.label !== 0 || right.label !== 0) continue;
      const leftGap = cur.x - (left.x + left.w);
      const rightGap = right.x - (cur.x + cur.w);
      const vDiffL = Math.abs(cur.y - left.y);
      const vDiffR = Math.abs(cur.y - right.y);
      if (leftGap <= 24 && rightGap <= 24
          && vDiffL <= Math.max(cur.h, left.h) * 0.3
          && vDiffR <= Math.max(cur.h, right.h) * 0.3) {
        allRegions[i] = { ...cur, label: 0 };
      }
    }
  }

  // ── Merge adjacent same-label regions ──
  const charGap = 28;
  const merged = [];
  for (const region of allRegions) {
    let attached = false;
    if (merged.length > 0 && merged[merged.length - 1].label === region.label) {
      const prev = merged[merged.length - 1];
      const hGap = Math.abs((prev.x + prev.w) - region.x);
      const vDiff = Math.abs(region.y - prev.y);
      const hRatio = Math.abs(region.h - prev.h) / Math.max(region.h, prev.h);
      if (hGap <= charGap && vDiff <= Math.max(prev.h, region.h) * 0.3 && hRatio <= 0.3) {
        const nx = Math.min(prev.x, region.x);
        const ny = Math.min(prev.y, region.y);
        const nw = Math.max(prev.x + prev.w, region.x + region.w) - nx;
        const nh = Math.max(prev.y + prev.h, region.y + region.h) - ny;
        merged[merged.length - 1] = { x: nx, y: ny, w: nw, h: nh, label: prev.label };
        attached = true;
      }
    }
    if (!attached) merged.push(region);
  }

  // Sort by reading order
  merged.sort((a, b) => a.y - b.y || a.x - b.x);

  const t1 = performance.now();
  const nF = merged.filter(r => r.label === 0).length;
  const nT = merged.filter(r => r.label === 1).length;
  console.debug(`[region-detect] ${allRegions.length} chunks -> ${nF}F + ${nT}T (${merged.length} regions, ${(t1-t0).toFixed(0)}ms)`);

  return merged;
}

// ── Run ONNX batch inference on preprocessed patches ──

async function runBatchInference(patches) {
  if (patches.length === 0) return [];
  const batchSize = 64;
  const allConfs = [];

  for (let start = 0; start < patches.length; start += batchSize) {
    const batch = patches.slice(start, start + batchSize);
    const n = batch.length;

    // Stack into a single tensor [n, 3, 64, 64]
    const tensorData = new Float32Array(n * 3 * 64 * 64);
    for (let i = 0; i < n; i++) {
      tensorData.set(batch[i], i * 3 * 64 * 64);
    }

    const input = new ort.Tensor('float32', tensorData, [n, 3, 64, 64]);
    const output = await detSession.run({ [detSession.inputNames[0]]: input });
    const logits = output[detSession.outputNames[0]]; // [n, 2]

    for (let i = 0; i < n; i++) {
      const logitPair = [logits.data[i * 2], logits.data[i * 2 + 1]];
      const probs = softmax(logitPair);
      allConfs.push(probs[1]); // class 1 = Chinese text
    }
  }

  return allConfs;
}

// ── Main entry point ──

export async function detectRegions(img) {
  if (!isRegionDetReady()) throw new Error('Region detection model not ready');

  const imageData = getImageData(img);
  const bgColor = estimateBgColor(imageData);

  // Stage 1: Find content blocks
  const contentBlocks = findContentByPixels(imageData);
  console.debug(`[region-detect] Stage 1: ${contentBlocks.length} content blocks`);

  // Stage 1.5: Split into lines and chunks
  const linesAndChunks = [];
  for (const block of contentBlocks) {
    const lines = splitBlockIntoLines(imageData, block, bgColor);
    for (const line of lines) {
      const chunks = splitLineIntoChunks(imageData, line, bgColor);
      linesAndChunks.push([line, chunks]);
    }
  }
  console.debug(`[region-detect] Stage 1.5: ${linesAndChunks.length} lines`);

  // Stage 2: CNN classification
  const regions = await classifyRegions(img, linesAndChunks, bgColor);

  return { regions, contentBlocks, bgColor };
}

// ── Crop image region helper ──

export function cropRegion(img, box) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(box.w));
  canvas.height = Math.max(1, Math.round(box.h));
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, box.x, box.y, box.w, box.h, 0, 0, box.w, box.h);
  return canvas;
}

// ── Group regions by line (y-coordinate proximity) ──

export function groupRegionsByLine(regions) {
  if (regions.length === 0) return [];
  const sorted = [...regions].sort((a, b) => a.y - b.y || a.x - b.x);
  const lines = [];
  let currentLine = [sorted[0]];
  let currentY = sorted[0].y;
  let currentH = sorted[0].h;
  const lineTolerance = 0.5; // 50% height overlap = same line

  for (let i = 1; i < sorted.length; i++) {
    const r = sorted[i];
    const yOverlap = Math.min(currentY + currentH, r.y + r.h) - Math.max(currentY, r.y);
    const minH = Math.min(currentH, r.h);
    if (yOverlap > minH * lineTolerance) {
      currentLine.push(r);
      currentY = Math.min(currentY, r.y);
      currentH = Math.max(currentY + currentH, r.y + r.h) - currentY;
    } else {
      lines.push(currentLine.sort((a, b) => a.x - b.x));
      currentLine = [r];
      currentY = r.y;
      currentH = r.h;
    }
  }
  lines.push(currentLine.sort((a, b) => a.x - b.x));
  return lines;
}
