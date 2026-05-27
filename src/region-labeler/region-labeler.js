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

  if (!drawing) return;
  const pos = getPos(e);
  const x = Math.min(startX, pos.x);
  const y = Math.min(startY, pos.y);
  const w = Math.abs(pos.x - startX);
  const h = Math.abs(pos.y - startY);
  redraw();
  ctx.strokeStyle = drawType === 'formula' ? '#ef4444' : '#3b82f6';
  ctx.lineWidth = 2;
  ctx.setLineDash([5, 5]);
  ctx.strokeRect(x * scale, y * scale, w * scale, h * scale);
  ctx.setLineDash([]);
  // Show size
  ctx.fillStyle = 'rgba(0,0,0,0.7)';
  ctx.fillRect(x * scale, y * scale - 18, 60, 16);
  ctx.fillStyle = '#fff';
  ctx.font = '10px sans-serif';
  ctx.fillText(`${Math.round(w)}x${Math.round(h)}`, x * scale + 2, y * scale - 5);
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
    ctx.strokeStyle = isFormula ? '#ef4444' : '#3b82f6';
    ctx.lineWidth = 2;
    ctx.strokeRect(rx, ry, rw, rh);
    ctx.fillStyle = isFormula ? 'rgba(239,68,68,0.15)' : 'rgba(59,130,246,0.15)';
    ctx.fillRect(rx, ry, rw, rh);
    ctx.fillStyle = isFormula ? '#ef4444' : '#3b82f6';
    ctx.font = 'bold 12px sans-serif';
    ctx.fillText(isFormula ? '公式' : '文字', rx + 3, ry + 15);
    if (r.result) {
      const tw = Math.min(rw - 4, 140);
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.fillRect(rx + 2, ry + rh - 16, tw, 14);
      ctx.fillStyle = '#333';
      ctx.font = '10px sans-serif';
      ctx.fillText(r.result.substring(0, 20), rx + 4, ry + rh - 5);
    }
  }

  if (regions.length > 0) {
    const fc = regions.filter(r => r.type === 'formula').length;
    const tc = regions.filter(r => r.type === 'text').length;
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    const label = `${fc} 公式 + ${tc} 文字`;
    const tw = ctx.measureText(label).width + 12;
    ctx.fillRect(0, canvas.height - 24, tw, 24);
    ctx.fillStyle = '#fff';
    ctx.font = '11px sans-serif';
    ctx.fillText(label, 6, canvas.height - 8);
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
