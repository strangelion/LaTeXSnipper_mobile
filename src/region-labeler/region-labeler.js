// Region labeler — long-press drag to draw, tap to toggle type
// Left long-press = formula, right-click = text (desktop)
// Mobile: long-press always draws, type toggles via tap

import { recognize } from '../ocr/ocr-engine.js';
import { recognizeText } from '../ocr/tesseract-recognition.js';
import { cropRegion } from '../ocr/formula-detection.js';

let canvas = null;
let ctx = null;
let img = null;
let regions = [];
let drawing = false;
let drawType = 'formula';
let startX = 0, startY = 0;
let scale = 1;
let progressCb = null;
let pressTimer = null;
let pressStartX = 0, pressStartY = 0;
let longPressTriggered = false;
const LONG_PRESS_MS = 300;
const MOVE_THRESHOLD = 10; // px

export function initRegionLabeler(canvasEl, image, onProgress) {
  canvas = canvasEl;
  ctx = canvas.getContext('2d');
  img = image;
  regions = [];
  progressCb = onProgress;
  longPressTriggered = false;

  const iw = img.naturalWidth || img.width;
  const ih = img.naturalHeight || img.height;
  const maxW = canvas.parentElement?.clientWidth || 350;
  scale = Math.min(1, maxW / iw);
  canvas.width = Math.round(iw * scale);
  canvas.height = Math.round(ih * scale);
  canvas.style.display = 'block';

  redraw();
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onUp);
  canvas.addEventListener('contextmenu', onCtx);
}

function onCtx(e) { e.preventDefault(); }

function getPos(e) {
  const r = canvas.getBoundingClientRect();
  return { x: (e.clientX - r.left) / scale, y: (e.clientY - r.top) / scale };
}

function onDown(e) {
  e.preventDefault();
  canvas.setPointerCapture(e.pointerId);
  pressStartX = e.clientX;
  pressStartY = e.clientY;
  longPressTriggered = false;

  // Right click = immediate draw as text
  if (e.button === 2) {
    const pos = getPos(e);
    drawType = 'text';
    drawing = true;
    startX = pos.x;
    startY = pos.y;
    return;
  }

  // Left click = long press to draw formula, or tap to toggle
  pressTimer = setTimeout(() => {
    longPressTriggered = true;
    const pos = getPos(e);
    drawType = 'formula';
    drawing = true;
    startX = pos.x;
    startY = pos.y;
    // Visual feedback
    canvas.style.cursor = 'crosshair';
  }, LONG_PRESS_MS);
}

function onMove(e) {
  // If moved too much before long press, cancel long press and start drawing
  if (!longPressTriggered && pressTimer) {
    const dx = e.clientX - pressStartX;
    const dy = e.clientY - pressStartY;
    if (Math.sqrt(dx * dx + dy * dy) > MOVE_THRESHOLD) {
      clearTimeout(pressTimer);
      pressTimer = null;
      longPressTriggered = true;
      const pos = getPos(e);
      drawType = 'formula';
      drawing = true;
      startX = pos.x;
      startY = pos.y;
      canvas.style.cursor = 'crosshair';
    }
  }

  // Draw preview while dragging
  if (!drawing) return;
  const pos = getPos(e);
  const x = Math.min(startX, pos.x);
  const y = Math.min(startY, pos.y);
  const w = Math.abs(pos.x - startX);
  const h = Math.abs(pos.y - startY);
  redraw();
  const color = drawType === 'formula' ? '#ff4444' : '#4488ff';
  // White outline
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 4;
  ctx.setLineDash([6, 4]);
  ctx.strokeRect(x * scale - 1, y * scale - 1, w * scale + 2, h * scale + 2);
  // Colored dashed line
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.strokeRect(x * scale, y * scale, w * scale, h * scale);
  ctx.setLineDash([]);
  // Size indicator
  ctx.fillStyle = 'rgba(0,0,0,0.8)';
  ctx.fillRect(x * scale, y * scale - 20, 70, 18);
  ctx.fillStyle = '#fff';
  ctx.font = '11px sans-serif';
  ctx.fillText(`${Math.round(w)}x${Math.round(h)}`, x * scale + 4, y * scale - 6);
}

function onUp(e) {
  clearTimeout(pressTimer);
  pressTimer = null;
  canvas.style.cursor = '';

  if (drawing) {
    drawing = false;
    const pos = getPos(e);
    const x = Math.min(startX, pos.x);
    const y = Math.min(startY, pos.y);
    const w = Math.abs(pos.x - startX);
    const h = Math.abs(pos.y - startY);
    if (w >= 8 && h >= 8) {
      regions.push({ x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h), type: drawType, result: null });
    }
    redraw();
    return;
  }

  // Short tap (no long press) = toggle type of existing region
  if (!longPressTriggered) {
    const pos = getPos(e);
    for (let i = regions.length - 1; i >= 0; i--) {
      const reg = regions[i];
      if (pos.x >= reg.x && pos.x <= reg.x + reg.w &&
          pos.y >= reg.y && pos.y <= reg.y + reg.h) {
        reg.type = reg.type === 'formula' ? 'text' : 'formula';
        redraw();
        return;
      }
    }
  }
}

function redraw() {
  if (!ctx || !img) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  for (const r of regions) {
    const rx = r.x * scale, ry = r.y * scale, rw = r.w * scale, rh = r.h * scale;
    const isFormula = r.type === 'formula';
    const color = isFormula ? '#ff4444' : '#4488ff';

    // White outline for contrast
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 4;
    ctx.strokeRect(rx - 1, ry - 1, rw + 2, rh + 2);

    // Colored border
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.strokeRect(rx, ry, rw, rh);

    // Semi-transparent fill
    ctx.fillStyle = isFormula ? 'rgba(255,68,68,0.25)' : 'rgba(68,136,255,0.25)';
    ctx.fillRect(rx, ry, rw, rh);

    // Label with background
    const labelText = isFormula ? '公式' : '文字';
    ctx.font = 'bold 14px sans-serif';
    const labelW = ctx.measureText(labelText).width + 8;
    ctx.fillStyle = color;
    ctx.fillRect(rx, ry, labelW, 20);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(labelText, rx + 4, ry + 15);

    // Result preview
    if (r.result) {
      const preview = r.result.substring(0, 20);
      ctx.font = '11px sans-serif';
      const pw = ctx.measureText(preview).width + 6;
      ctx.fillStyle = 'rgba(0,0,0,0.8)';
      ctx.fillRect(rx + 2, ry + rh - 18, pw, 16);
      ctx.fillStyle = '#ffffff';
      ctx.fillText(preview, rx + 5, ry + rh - 6);
    }
  }

  if (regions.length > 0) {
    const fc = regions.filter(r => r.type === 'formula').length;
    const tc = regions.filter(r => r.type === 'text').length;
    const label = `${fc} 公式 + ${tc} 文字`;
    ctx.font = 'bold 12px sans-serif';
    const tw = ctx.measureText(label).width + 16;
    ctx.fillStyle = 'rgba(0,0,0,0.8)';
    ctx.fillRect(0, canvas.height - 26, tw, 26);
    ctx.fillStyle = '#fff';
    ctx.fillText(label, 8, canvas.height - 9);
  }
}

export function clearRegions() { regions = []; redraw(); }
export function undoRegion() { regions.pop(); redraw(); }
export function getRegionCount() { return regions.length; }

export async function recognizeRegions() {
  if (!regions.length || !img) return null;
  const results = [];
  for (let i = 0; i < regions.length; i++) {
    const r = regions[i];
    if (progressCb) progressCb(i + 1, regions.length);
    const crop = cropRegion(img, r);
    try {
      if (r.type === 'formula') {
        const res = await recognize(crop, 'formula');
        r.result = res.latex || '';
        if (res.latex) results.push({ type: 'formula', text: res.latex, confidence: res.confidence, y: r.y });
      } else {
        const t = await recognizeText(crop);
        r.result = t || '';
        if (t && t.trim().length > 0) results.push({ type: 'text', text: t.trim(), confidence: 0.7, y: r.y });
      }
    } catch (e) { console.debug('[labeler]', i, e.message); }
    redraw();
  }
  results.sort((a, b) => a.y - b.y);
  const parts = results.map(r => r.text);
  const avg = results.length ? results.reduce((s, r) => s + r.confidence, 0) / results.length : 0;
  return { latex: parts.join('\n'), confidence: avg };
}

export function destroyLabeler() {
  clearTimeout(pressTimer);
  if (canvas) {
    canvas.removeEventListener('pointerdown', onDown);
    canvas.removeEventListener('pointermove', onMove);
    canvas.removeEventListener('pointerup', onUp);
    canvas.removeEventListener('pointercancel', onUp);
    canvas.removeEventListener('contextmenu', onCtx);
  }
  canvas = null; ctx = null; img = null; regions = [];
}
