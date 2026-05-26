// Handwriting canvas module — pen/eraser, undo/redo, ink smoothing, pressure
// Extracted from ocr_demo.html + mobile enhancements

import { HW_MAX_STROKES } from '../constants.js';

let hwCanvas, hwCtx, hwWrap;
let hwTool = 'pen';
let hwDrawing = false;
let hwStrokes = [];
let hwRedoStack = [];
let hwResizing = false, hwRX, hwRY, hwRW, hwRH;

// Ink smoothing state
let lastPoints = [];
const SMOOTH_WINDOW = 3;

export function initHandwrite(canvasEl, wrapEl) {
  hwCanvas = canvasEl;
  hwCtx = hwCanvas.getContext('2d');
  hwWrap = wrapEl;
  hwCtx.lineCap = 'round';
  hwCtx.lineJoin = 'round';
  bindEvents();
}

export function getCanvas() { return hwCanvas; }

// ── Pen color follows theme ──

export function hwPenColor() {
  return document.documentElement.getAttribute('data-theme') === 'dark' ? '#e2e8f0' : '#1e293b';
}

// ── State management ──

function saveState() {
  hwStrokes.push(hwCtx.getImageData(0, 0, hwCanvas.width, hwCanvas.height));
  if (hwStrokes.length > HW_MAX_STROKES) hwStrokes.shift();
  hwRedoStack = []; // clear redo on new action
}

export function hwSetTool(tool) {
  hwTool = tool;
}

export function hwUndo() {
  if (hwStrokes.length > 0) {
    hwRedoStack.push(hwCtx.getImageData(0, 0, hwCanvas.width, hwCanvas.height));
    hwCtx.putImageData(hwStrokes.pop(), 0, 0);
  }
}

export function hwRedo() {
  if (hwRedoStack.length > 0) {
    hwStrokes.push(hwCtx.getImageData(0, 0, hwCanvas.width, hwCanvas.height));
    hwCtx.putImageData(hwRedoStack.pop(), 0, 0);
  }
}

export function hwClear() {
  saveState();
  hwCtx.clearRect(0, 0, hwCanvas.width, hwCanvas.height);
  hwRedoStack = [];
}

// ── Coordinate transform ──

function getPos(e) {
  const rect = hwCanvas.getBoundingClientRect();
  const scaleX = hwCanvas.width / rect.width;
  const scaleY = hwCanvas.height / rect.height;
  const cx = e.touches ? e.touches[0].clientX : e.clientX;
  const cy = e.touches ? e.touches[0].clientY : e.clientY;
  return { x: (cx - rect.left) * scaleX, y: (cy - rect.top) * scaleY };
}

// ── Pressure-sensitive line width ──

function getLineWidth(e) {
  const base = hwTool === 'eraser' ? 24 : 3;
  if (e.pointerType === 'pen' && e.pressure > 0) {
    return base * (0.3 + e.pressure * 0.7);
  }
  return base;
}

// ── Ink smoothing with quadratic bezier ──

function drawSmoothed(p) {
  lastPoints.push(p);
  if (lastPoints.length > SMOOTH_WINDOW) lastPoints.shift();

  if (lastPoints.length < 2) {
    hwCtx.beginPath();
    hwCtx.moveTo(p.x, p.y);
    return;
  }

  if (hwTool === 'eraser') {
    hwCtx.globalCompositeOperation = 'destination-out';
    hwCtx.strokeStyle = 'rgba(0,0,0,1)';
  } else {
    hwCtx.globalCompositeOperation = 'source-over';
    hwCtx.strokeStyle = hwPenColor();
  }

  const mid = {
    x: (lastPoints[lastPoints.length - 2].x + p.x) / 2,
    y: (lastPoints[lastPoints.length - 2].y + p.y) / 2,
  };
  hwCtx.quadraticCurveTo(lastPoints[lastPoints.length - 2].x, lastPoints[lastPoints.length - 2].y, mid.x, mid.y);
  hwCtx.stroke();
  hwCtx.beginPath();
  hwCtx.moveTo(mid.x, mid.y);
}

// ── Event binding ──

function bindEvents() {
  hwCanvas.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'touch' && (e.isPrimary === false)) return; // palm rejection
    saveState();
    hwDrawing = true;
    lastPoints = [];
    const p = getPos(e);
    hwCtx.lineWidth = getLineWidth(e);
    hwCtx.beginPath();
    hwCtx.moveTo(p.x, p.y);
    hwCanvas.setPointerCapture(e.pointerId);
    e.preventDefault();
  });

  hwCanvas.addEventListener('pointermove', (e) => {
    if (!hwDrawing) return;
    hwCtx.lineWidth = getLineWidth(e);
    drawSmoothed(getPos(e));
    e.preventDefault();
  });

  ['pointerup', 'pointerleave', 'pointercancel'].forEach(ev => {
    hwCanvas.addEventListener(ev, () => {
      if (!hwDrawing) return;
      hwDrawing = false;
      lastPoints = [];
      // fire auto-recognize callback
      if (hwCanvas._onStrokeEnd) hwCanvas._onStrokeEnd();
    });
  });

  // Two-finger tap = undo (mobile)
  hwCanvas.addEventListener('touchstart', (e) => {
    if (e.touches.length === 2) {
      hwUndo();
      e.preventDefault();
    }
  }, { passive: false });

  // Resize handle
  const handle = hwWrap?.querySelector('.hw-resize-handle');
  if (handle) {
    handle.addEventListener('pointerdown', (e) => {
      e.preventDefault(); e.stopPropagation();
      hwResizing = true;
      hwRX = e.clientX; hwRY = e.clientY;
      hwRW = hwCanvas.offsetWidth; hwRH = hwCanvas.offsetHeight;
      handle.setPointerCapture(e.pointerId);
    });
    handle.addEventListener('pointermove', (e) => {
      if (!hwResizing) return;
      hwCanvas.style.width = Math.max(280, hwRW + e.clientX - hwRX) + 'px';
      hwCanvas.style.height = Math.max(200, hwRH + e.clientY - hwRY) + 'px';
    });
    ['pointerup', 'pointercancel'].forEach(ev => {
      handle.addEventListener(ev, () => { hwResizing = false; });
    });
  }
}

// ── Stroke end callback ──

export function onStrokeEnd(callback) {
  hwCanvas._onStrokeEnd = callback;
}

// ── Content bounds detection ──

export function hwGetContentBounds() {
  const data = hwCtx.getImageData(0, 0, hwCanvas.width, hwCanvas.height).data;
  let minX = hwCanvas.width, minY = hwCanvas.height, maxX = 0, maxY = 0;
  for (let y = 0; y < hwCanvas.height; y++) {
    for (let x = 0; x < hwCanvas.width; x++) {
      const alpha = data[(y * hwCanvas.width + x) * 4 + 3];
      if (alpha > 0) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (minX > maxX) return null;
  const pad = 20;
  return {
    x: Math.max(0, minX - pad),
    y: Math.max(0, minY - pad),
    w: Math.min(hwCanvas.width, maxX - minX + pad * 2),
    h: Math.min(hwCanvas.height, maxY - minY + pad * 2),
  };
}

// ── Export handwriting as file for recognition ──

export function hwExportImage() {
  return new Promise((resolve) => {
    const tmp = document.createElement('canvas');
    tmp.width = hwCanvas.width; tmp.height = hwCanvas.height;
    const tctx = tmp.getContext('2d');
    tctx.fillStyle = '#ffffff';
    tctx.fillRect(0, 0, tmp.width, tmp.height);
    tctx.drawImage(hwCanvas, 0, 0);
    // Dark mode: invert non-white pixels to black (for white-text-on-dark)
    if (document.documentElement.getAttribute('data-theme') === 'dark') {
      const imgData = tctx.getImageData(0, 0, tmp.width, tmp.height);
      const d = imgData.data;
      for (let i = 0; i < d.length; i += 4) {
        if (d[i] < 250 || d[i + 1] < 250 || d[i + 2] < 250) {
          d[i] = 255 - d[i]; d[i + 1] = 255 - d[i + 1]; d[i + 2] = 255 - d[i + 2];
        }
      }
      tctx.putImageData(imgData, 0, 0);
    }
    tmp.toBlob((blob) => {
      resolve(new File([blob], 'handwrite.png', { type: 'image/png' }));
    }, 'image/png');
  });
}

// ── Update theme (call on theme change) ──

export function updateHwTheme(theme) {
  if (!hwWrap) return;
  hwWrap.style.backgroundColor = theme === 'dark' ? '#1e293b' : '#ffffff';
  hwWrap.style.backgroundImage = theme === 'dark'
    ? 'linear-gradient(rgba(255,255,255,0.07) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.07) 1px, transparent 1px)'
    : 'linear-gradient(rgba(0,0,0,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(0,0,0,0.06) 1px, transparent 1px)';
  hwWrap.style.backgroundSize = '20px 20px';
}
