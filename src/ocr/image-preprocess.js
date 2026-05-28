// Image preprocessing for text recognition — contrast enhancement, binarization
// Used to improve handwriting and camera photo quality before PP-OCRv5 / Tesseract

// Convert image to grayscale ImageData
function toGrayscale(imageData) {
  const { data, width, height } = imageData;
  const gray = new Uint8ClampedArray(width * height);
  for (let i = 0; i < width * height; i++) {
    const p = i * 4;
    gray[i] = Math.round(data[p] * 0.299 + data[p + 1] * 0.587 + data[p + 2] * 0.114);
  }
  return { gray, width, height };
}

// Otsu's method — find optimal threshold for binarization
function otsuThreshold(gray, width, height) {
  const histogram = new Int32Array(256);
  const n = width * height;
  for (let i = 0; i < n; i++) histogram[gray[i]]++;

  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * histogram[i];

  let wB = 0, sumB = 0;
  let maxVariance = 0, threshold = 128;

  for (let t = 0; t < 256; t++) {
    wB += histogram[t];
    if (wB === 0) continue;
    const wF = n - wB;
    if (wF === 0) break;
    sumB += t * histogram[t];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const variance = wB * wF * (mB - mF) * (mB - mF);
    if (variance > maxVariance) {
      maxVariance = variance;
      threshold = t;
    }
  }
  return threshold;
}

// Apply binary threshold to ImageData
function applyThreshold(imageData, threshold) {
  const { data } = imageData;
  const n = Math.floor(data.length / 4);
  for (let i = 0; i < n; i++) {
    const p = i * 4;
    const v = data[p] * 0.299 + data[p + 1] * 0.587 + data[p + 2] * 0.114;
    const bw = v >= threshold ? 255 : 0;
    data[p] = bw;
    data[p + 1] = bw;
    data[p + 2] = bw;
  }
  return imageData;
}

// Contrast-Limited Adaptive Histogram Equalization (simplified)
// Enhances local contrast in tiles, reduces noise in flat regions
function claheGray(gray, width, height, tileSize, clipLimit) {
  tileSize = tileSize || 32;
  clipLimit = clipLimit || 2.0;

  const result = new Uint8ClampedArray(width * height);
  const tilesX = Math.ceil(width / tileSize);
  const tilesY = Math.ceil(height / tileSize);

  // Build CDF for each tile
  const tileCDFs = [];
  for (let ty = 0; ty < tilesY; ty++) {
    for (let tx = 0; tx < tilesX; tx++) {
      const hist = new Int32Array(256);
      const x0 = tx * tileSize;
      const y0 = ty * tileSize;
      const x1 = Math.min(x0 + tileSize, width);
      const y1 = Math.min(y0 + tileSize, height);
      let count = 0;

      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          hist[gray[y * width + x]]++;
          count++;
        }
      }

      // Clip histogram
      if (clipLimit > 0 && count > 0) {
        const clipThreshold = Math.floor(clipLimit * count / 256);
        let excess = 0;
        for (let i = 0; i < 256; i++) {
          if (hist[i] > clipThreshold) {
            excess += hist[i] - clipThreshold;
            hist[i] = clipThreshold;
          }
        }
        const redist = Math.floor(excess / 256);
        for (let i = 0; i < 256; i++) {
          hist[i] += redist;
        }
      }

      // Build CDF
      const cdf = new Float32Array(256);
      cdf[0] = hist[0] / count;
      for (let i = 1; i < 256; i++) {
        cdf[i] = cdf[i - 1] + hist[i] / count;
      }
      tileCDFs.push({ cdf, x0, y0, x1, y1, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 });
    }
  }

  // Apply bilinear interpolation between tile CDFs
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      // Find 4 nearest tile centers
      const tx = Math.floor(x / tileSize);
      const ty = Math.floor(y / tileSize);
      const neighbors = [];

      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = tx + dx;
          const ny = ty + dy;
          if (nx >= 0 && nx < tilesX && ny >= 0 && ny < tilesY) {
            const tile = tileCDFs[ny * tilesX + nx];
            const dist = Math.sqrt((x - tile.cx) ** 2 + (y - tile.cy) ** 2) || 1;
            neighbors.push({ cdf: tile.cdf, dist: 1 / dist });
          }
        }
      }

      const v = gray[y * width + x];
      let sum = 0, weightSum = 0;
      for (const n of neighbors) {
        sum += n.cdf[v] * n.dist;
        weightSum += n.dist;
      }
      result[y * width + x] = Math.round((sum / weightSum) * 255);
    }
  }
  return result;
}

// Write grayscale array back to ImageData (preserves alpha channel)
function grayToImageData(gray, imageData) {
  const { data, width, height } = imageData;
  for (let i = 0; i < width * height; i++) {
    const p = i * 4;
    data[p] = gray[i];
    data[p + 1] = gray[i];
    data[p + 2] = gray[i];
  }
  return imageData;
}

// ── Public API ──

// Enhance contrast for handwriting images (faint strokes → crisp dark text)
// Returns a new canvas with enhanced image
export function enhanceHandwriting(sourceImg) {
  const w = sourceImg.naturalWidth || sourceImg.width;
  const h = sourceImg.naturalHeight || sourceImg.height;

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(sourceImg, 0, 0);

  const imageData = ctx.getImageData(0, 0, w, h);
  const { gray } = toGrayscale(imageData);

  // Apply CLAHE with small tiles and moderate clipping
  const enhanced = claheGray(gray, w, h, 16, 3.0);
  grayToImageData(enhanced, imageData);
  ctx.putImageData(imageData, 0, 0);

  return canvas;
}

// Binarize image (Otsu thresholding) — returns pure black & white canvas
export function binarize(sourceImg) {
  const w = sourceImg.naturalWidth || sourceImg.width;
  const h = sourceImg.naturalHeight || sourceImg.height;

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(sourceImg, 0, 0);

  const imageData = ctx.getImageData(0, 0, w, h);
  const { gray } = toGrayscale(imageData);
  const threshold = otsuThreshold(gray, w, h);
  applyThreshold(imageData, threshold);
  ctx.putImageData(imageData, 0, 0);

  return canvas;
}

// Preprocess camera photo for text recognition
// 1. Convert to grayscale  2. Enhance contrast (CLAHE)  3. Binarize
export function preprocessForOCR(sourceImg) {
  const w = sourceImg.naturalWidth || sourceImg.width;
  const h = sourceImg.naturalHeight || sourceImg.height;

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(sourceImg, 0, 0);

  const imageData = ctx.getImageData(0, 0, w, h);
  const { gray } = toGrayscale(imageData);

  // Step 1: CLAHE contrast enhancement
  const enhanced = claheGray(gray, w, h, 32, 2.5);

  // Step 2: Otsu binarization
  const threshold = otsuThreshold(enhanced, w, h);

  // Apply binary threshold
  for (let i = 0; i < w * h; i++) {
    const p = i * 4;
    const bw = enhanced[i] >= threshold ? 255 : 0;
    imageData.data[p] = bw;
    imageData.data[p + 1] = bw;
    imageData.data[p + 2] = bw;
  }

  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

// Check if image looks like handwriting (thin strokes on white bg)
export function looksLikeHandwriting(sourceImg) {
  const w = sourceImg.naturalWidth || sourceImg.width;
  const h = sourceImg.naturalHeight || sourceImg.height;

  const canvas = document.createElement('canvas');
  const size = Math.min(128, w, h);
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(sourceImg, 0, 0, size, size);

  const imageData = ctx.getImageData(0, 0, size, size);
  const { data } = imageData;
  const n = size * size;

  // Count dark pixels and average darkness
  let darkCount = 0;
  let totalIntensity = 0;
  for (let i = 0; i < n; i++) {
    const p = i * 4;
    const v = data[p] * 0.299 + data[p + 1] * 0.587 + data[p + 2] * 0.114;
    totalIntensity += v;
    if (v < 128) darkCount++;
  }

  const avgIntensity = totalIntensity / n;
  const darkRatio = darkCount / n;

  // Handwriting: mostly light background, very few dark pixels, average intensity is high
  return avgIntensity > 200 && darkRatio > 0.002 && darkRatio < 0.15;
}
