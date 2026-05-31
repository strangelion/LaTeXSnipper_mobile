// Camera module — capture, free-form crop with corner handles, rotation slider
// Four corners can be freely dragged to form any quadrilateral.
// On confirm, perspective-warp crops the quad into a straight rectangle.

let camStream = null;
let camVideo = null;
let camModal = null;
let camCropCanvas = null;
let camCropCtx = null;
let camCropImg = null;        // original captured image (canvas)
let camCropDisplay = null;    // rotated version displayed (canvas)
let camCropMode = 'rect';
let camCropPoints = null;     // 4 corners of quad: [TL, TR, BR, BL]
let camCropPath = null;       // freeform path for lasso mode
let camRotation = 0;          // degrees (0-360)
let camCropDragging = false;
let camCropDragIdx = -1;      // -1 = not dragging, 0-3 = corner index
let camCropMovePt = null;     // {x,y} base of dragged corner at drag start
let camActions = null, camCropActions = null;
let _captureLock = false;
let _displayScale = 1;
let _wasCapture = false;

export function isFromCamera() { return _wasCapture; }

function fitCanvasToViewport() {
  const vw = window.innerWidth, vh = window.innerHeight;
  const bw = camCropCanvas.width, bh = camCropCanvas.height;
  if (!bw || !bh) return;
  _displayScale = Math.min((vw * 0.94) / bw, (vh * 0.78) / bh, 1);
  camCropCanvas.style.width = Math.round(bw * _displayScale) + 'px';
  camCropCanvas.style.height = Math.round(bh * _displayScale) + 'px';
}

export function initCamera(videoEl, modalEl, cropCanvasEl, actionsEl, cropActionsEl) {
  camVideo = videoEl; camModal = modalEl;
  camCropCanvas = cropCanvasEl; camCropCtx = camCropCanvas.getContext('2d');
  camActions = actionsEl; camCropActions = cropActionsEl;
  bindCropEvents();
  initRotateTrack();
}

export function isOpen() { return camStream !== null && camStream.active; }

export async function openCamera() {
  try {
    camStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false,
    });
    camVideo.srcObject = camStream;
    camVideo.style.display = ''; camCropCanvas.style.display = 'none';
    camActions.style.display = 'flex'; camCropActions.style.display = 'none';
    camModal.classList.add('show');
    const nav = document.querySelector('.bottom-nav');
    if (nav) nav.style.display = 'none';
    document.getElementById('camFlash')?.classList.remove('active');
    camRotation = 0;
    hideRotateBar();
  } catch (e) { throw new Error('Camera access denied: ' + (e.message || e)); }
}

export async function toggleFlash() {
  if (!camStream) return;
  const track = camStream.getVideoTracks()[0];
  if (!track) return;
  try {
    const caps = track.getCapabilities ? track.getCapabilities() : null;
    if (!caps || !caps.torch) return;
    const current = track.getSettings().torch || false;
    await track.applyConstraints({ advanced: [{ torch: !current }] });
    const btn = document.getElementById('camFlash');
    if (btn) btn.classList.toggle('active', !current);
  } catch (_) {}
}

// ── Rotation track — canvas with moving ticks ──
function showRotateBar() {
  const wrap = document.getElementById('camRotateOverlay');
  if (wrap) wrap.classList.add('show');
  drawRotateTrack(0);
}
function hideRotateBar() {
  const wrap = document.getElementById('camRotateOverlay');
  if (wrap) wrap.classList.remove('show');
}

function drawRotateTrack(angle) {
  const canvas = document.getElementById('camRotateCanvas');
  if (!canvas) return;
  const rect = canvas.parentElement.getBoundingClientRect();
  const W = Math.round(rect.width), H = Math.round(rect.height);
  const dpr = window.devicePixelRatio || 1;
  canvas.width = W * dpr; canvas.height = H * dpr;
  canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
  canvas._w = W; // store for pointer handlers
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);

  const centerX = W / 2;
  const tickArea = W * 0.85; // ticks occupy 85% of width
  const startX = (W - tickArea) / 2;
  const totalDeg = 360;
  const pxPerDeg = tickArea / totalDeg;
  const offset = (((angle % 360) + 360) % 360) * pxPerDeg;

  // Draw ticks covering visible area + generous margins
  const minVisDeg = Math.max(-360, -((startX + offset) / pxPerDeg) - 2);
  const maxVisDeg = Math.min(720, ((W - startX + offset) / pxPerDeg) + 2);
  for (let d = Math.floor(minVisDeg / 15) * 15; d <= Math.ceil(maxVisDeg / 15) * 15; d += 15) {
    const x = startX + d * pxPerDeg - offset;
    const isMajor = d % 45 === 0;
    const isZero = ((d % 360) + 360) % 360 === 0;
    const tickH = isMajor ? 14 : 7;
    const y0 = (H - tickH) / 2;
    ctx.strokeStyle = isZero ? 'rgba(96,165,250,0.9)' : 'rgba(255,255,255,0.3)';
    ctx.lineWidth = isZero ? 2.5 : 1.5;
    ctx.beginPath();
    ctx.moveTo(x, y0);
    ctx.lineTo(x, y0 + tickH);
    ctx.stroke();
  }

  // Center 0° indicator
  ctx.strokeStyle = '#60a5fa';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(centerX, 6);
  ctx.lineTo(centerX, H - 6);
  ctx.stroke();
}

function updateRotateIndicator(angle) {
  drawRotateTrack(angle);
}

function initRotateTrack() {
  const canvas = document.getElementById('camRotateCanvas');
  if (!canvas) return;
  let dragging = false;
  let lastX = 0;
  let accumulated = 0;

  function getPtrPos(e) {
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  canvas.addEventListener('pointerdown', (e) => {
    if (!camCropImg) return;
    dragging = true;
    lastX = e.clientX;
    accumulated = camRotation;
    // Redraw at full resolution first
    drawRotateTrack(camRotation);
    canvas.setPointerCapture(e.pointerId);
    e.preventDefault();
  });

  canvas.addEventListener('pointermove', (e) => {
    if (!dragging || !camCropImg) return;
    // Map 1px of horizontal movement to ~0.8° rotation
    const dx = e.clientX - lastX;
    accumulated += dx * 0.8;
    camRotation = accumulated;
    lastX = e.clientX;
    applyRotation();
    drawCropOverlay();
    updateRotateIndicator(camRotation);
  });

  ['pointerup', 'pointercancel'].forEach(ev => {
    canvas.addEventListener(ev, () => { dragging = false; });
  });
}

function applyRotation() {
  if (!camCropImg) return;
  const w = camCropImg.width, h = camCropImg.height;
  const rad = (camRotation * Math.PI) / 180;
  const cos = Math.abs(Math.cos(rad)), sin = Math.abs(Math.sin(rad));
  const nw = Math.ceil(w * cos + h * sin);
  const nh = Math.ceil(w * sin + h * cos);

  camCropDisplay = document.createElement('canvas');
  camCropDisplay.width = nw;
  camCropDisplay.height = nh;
  const ctx = camCropDisplay.getContext('2d');
  ctx.translate(nw / 2, nh / 2);
  ctx.rotate(rad);
  ctx.drawImage(camCropImg, -w / 2, -h / 2);

  // Canvas buffer = full res; CSS fits it to viewport
  camCropCanvas.width = nw;
  camCropCanvas.height = nh;
  fitCanvasToViewport();
  camCropPoints = null;
}

// ── Close ──

export function closeCamera() {
  if (_captureLock) return;
  _wasCapture = false;
  if (camStream) { camStream.getTracks().forEach(t => t.stop()); camStream = null; }
  camVideo.srcObject = null; camVideo.style.display = '';
  camCropCanvas.style.display = 'none';
  camActions.style.display = 'flex'; camCropActions.style.display = 'none';
  camCropImg = null; camCropDisplay = null; camCropPoints = null; camCropPath = null;
  hideRotateBar();
  camModal.classList.remove('show');
  const nav = document.querySelector('.bottom-nav');
  if (nav) nav.style.display = '';
}

// ── Capture photo ──

export function capturePhoto() {
  if (!camStream) return;
  camCropImg = document.createElement('canvas');
  const isPortrait = window.innerHeight > window.innerWidth;
  const videoLandscape = camVideo.videoWidth > camVideo.videoHeight;
  if (isPortrait && videoLandscape) {
    camCropImg.width = camVideo.videoHeight; camCropImg.height = camVideo.videoWidth;
    const ctx = camCropImg.getContext('2d');
    ctx.translate(camCropImg.width / 2, camCropImg.height / 2);
    ctx.rotate(Math.PI / 2);
    ctx.drawImage(camVideo, -camVideo.videoWidth / 2, -camVideo.videoHeight / 2);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  } else {
    camCropImg.width = camVideo.videoWidth; camCropImg.height = camVideo.videoHeight;
    camCropImg.getContext('2d').drawImage(camVideo, 0, 0);
  }
  if (camStream) { camStream.getTracks().forEach(t => t.stop()); camStream = null; }
  camVideo.srcObject = null; camVideo.style.display = 'none';
  camCropCanvas.style.display = 'block';
  camCropPath = (camCropMode === 'lasso') ? [] : null;

  // Start with no rotation, display = original
  camRotation = 0;
  camCropDisplay = camCropImg;
  camCropCanvas.width = camCropImg.width;
  camCropCanvas.height = camCropImg.height;
  fitCanvasToViewport();
  camCropPoints = null;
  drawCropOverlay();
  _wasCapture = true;
  camActions.style.display = 'none'; camCropActions.style.display = 'flex';
  showRotateBar();
  _captureLock = true;
  setTimeout(() => { _captureLock = false; }, 500);
}

// ── Overlay ──

function drawCropOverlay() {
  if (!camCropDisplay) return;
  camCropCtx.drawImage(camCropDisplay, 0, 0);

  const W = camCropCanvas.width, H = camCropCanvas.height;

  if (!camCropPoints) {
    // No crop yet — show hint
    camCropCtx.fillStyle = 'rgba(0,0,0,0.25)';
    camCropCtx.fillRect(0, 0, W, H);
    camCropCtx.fillStyle = 'rgba(255,255,255,0.9)';
    const fs = Math.max(32, Math.min(52, W / 10));
    camCropCtx.font = 'bold ' + fs + 'px "Segoe UI","Microsoft YaHei",sans-serif';
    camCropCtx.textAlign = 'center'; camCropCtx.textBaseline = 'middle';
    camCropCtx.fillText('拖拽框选要识别的区域', W / 2, H / 2);
    camCropCtx.fillStyle = 'rgba(255,255,255,0.5)';
    camCropCtx.font = (fs * 0.55) + 'px "Segoe UI","Microsoft YaHei",sans-serif';
    camCropCtx.fillText('不框选则识别整张图片', W / 2, H / 2 + fs * 1.3);
    return;
  }

  const pts = camCropPoints;

  // Dim outside the quad
  camCropCtx.save();
  camCropCtx.beginPath();
  camCropCtx.moveTo(pts[0].x, pts[0].y);
  camCropCtx.lineTo(pts[1].x, pts[1].y);
  camCropCtx.lineTo(pts[2].x, pts[2].y);
  camCropCtx.lineTo(pts[3].x, pts[3].y);
  camCropCtx.closePath();
  camCropCtx.fillStyle = 'rgba(0,0,0,0.35)';
  camCropCtx.fill('evenodd');
  camCropCtx.restore();

  // Quad border
  camCropCtx.strokeStyle = '#60a5fa'; camCropCtx.lineWidth = 2;
  camCropCtx.beginPath();
  camCropCtx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < 4; i++) camCropCtx.lineTo(pts[i].x, pts[i].y);
  camCropCtx.closePath();
  camCropCtx.stroke();

  // Corner handles
  if (camCropDragIdx >= 0) {
    // Highlight the dragged corner
    const p = pts[camCropDragIdx];
    camCropCtx.fillStyle = 'rgba(147,197,253,0.35)';
    camCropCtx.beginPath();
    camCropCtx.arc(p.x, p.y, 36, 0, Math.PI * 2);
    camCropCtx.fill();
  }
  for (let i = 0; i < 4; i++) {
    const isHover = i === camCropDragIdx;
    const r = isHover ? 18 : 14;
    camCropCtx.fillStyle = isHover ? '#93c5fd' : '#60a5fa';
    camCropCtx.beginPath();
    camCropCtx.arc(pts[i].x, pts[i].y, r, 0, Math.PI * 2);
    camCropCtx.fill();
  }
}

// ── Hit test ──

function cornerHit(p) {
  if (!camCropPoints) return -1;
  const thr = Math.max(44, Math.min(80, camCropCanvas.width / 5));
  for (let i = 0; i < 4; i++) {
    const dx = p.x - camCropPoints[i].x, dy = p.y - camCropPoints[i].y;
    if (Math.sqrt(dx * dx + dy * dy) < thr) return i;
  }
  return -1;
}

function insideQuad(p, pts) {
  // Ray casting
  let inside = false;
  for (let i = 0, j = 3; i < 4; j = i++) {
    if ((pts[i].y > p.y) !== (pts[j].y > p.y) &&
        p.x < (pts[j].x - pts[i].x) * (p.y - pts[i].y) / (pts[j].y - pts[i].y) + pts[i].x) inside = !inside;
  }
  return inside;
}

// ── Events ──

function cropGetPos(e) {
  const rect = camCropCanvas.getBoundingClientRect();
  const sx = camCropCanvas.width / rect.width, sy = camCropCanvas.height / rect.height;
  const cx = e.touches ? e.touches[0].clientX : e.clientX;
  const cy = e.touches ? e.touches[0].clientY : e.clientY;
  return { x: (cx - rect.left) * sx, y: (cy - rect.top) * sy, clientY: cy };
}

function updateBarVisibility(clientY) {
  const modeBar = document.getElementById('camModeBar');
  const bottomBar = document.querySelector('.cam-bottom-bar');
  const h = window.innerHeight;
  const modeOpacity = clientY < h * 0.15 ? '0.15' : '1';
  const bottomOpacity = clientY > h * 0.82 ? '0.15' : '1';
  if (modeBar) modeBar.style.opacity = modeOpacity;
  if (bottomBar) bottomBar.style.opacity = bottomOpacity;
}

function initQuad(x, y, w, h) {
  // Create initial 4 points from a rect
  const margin = 8;
  camCropPoints = [
    { x: x + margin, y: y + margin },
    { x: x + w - margin, y: y + margin },
    { x: x + w - margin, y: y + h - margin },
    { x: x + margin, y: y + h - margin },
  ];
}

function bindCropEvents() {
  camCropCanvas.style.touchAction = 'none';

  camCropCanvas.addEventListener('pointerdown', (e) => {
    const p = cropGetPos(e);

    // Lasso mode: just draw freeform path
    if (camCropMode === 'lasso') {
      camCropPath = [p];
      camCropDragging = true;
      camCropCanvas.setPointerCapture(e.pointerId); e.preventDefault();
      return;
    }

    // If already have a quad, check corner hit → drag
    const ci = cornerHit(p);
    if (ci >= 0) {
      camCropDragIdx = ci;
      camCropMovePt = { x: camCropPoints[ci].x, y: camCropPoints[ci].y };
      camCropDragging = true;
      camCropCanvas.setPointerCapture(e.pointerId); e.preventDefault();
      return;
    }

    if (camCropPoints && insideQuad(p, camCropPoints)) {
      // Inside quad → move entire quad by moving all 4 corners
      const offsetX = p.x - camCropPoints[0].x;
      const offsetY = p.y - camCropPoints[0].y;
      // Average offset from all corners is more accurate, but using first is fine
      camCropDragIdx = -2; // sentinel for "moving quad"
      camCropMovePt = { x: p.x, y: p.y };
      camCropDragging = true;
      camCropCanvas.setPointerCapture(e.pointerId); e.preventDefault();
      return;
    }

    // Start drawing a new rectangular quad — don't create it yet,
    // wait until pointermove exceeds minimum size
    camCropPoints = null;
    camCropDragIdx = -1;
    camCropDragging = true;
    camCropCanvas.setPointerCapture(e.pointerId); e.preventDefault();
    camCropMovePt = { x: p.x, y: p.y };
    // Redraw to clear any stale quad
    drawCropOverlay();
  });

  camCropCanvas.addEventListener('pointermove', (e) => {
    const p = cropGetPos(e);

    if (!camCropDragging) {
      // Hover visual for corners
      if (camCropPoints && cornerHit(p) >= 0) {
        camCropCanvas.style.cursor = 'grab';
      } else {
        camCropCanvas.style.cursor = 'crosshair';
      }
      return;
    }

    updateBarVisibility(p.clientY);

    // Lasso mode: draw freeform path
    if (camCropMode === 'lasso') {
      camCropPath.push(p);
      const prev = camCropPath[camCropPath.length - 2] || p;
      camCropCtx.strokeStyle = '#f97316'; camCropCtx.lineWidth = 2; camCropCtx.lineCap = 'round';
      camCropCtx.beginPath(); camCropCtx.moveTo(prev.x, prev.y); camCropCtx.lineTo(p.x, p.y); camCropCtx.stroke();
      e.preventDefault();
      return;
    }

    if (camCropDragIdx >= 0 && camCropDragIdx < 4) {
      // Dragging one corner — update only that point, keep others fixed
      camCropPoints[camCropDragIdx] = {
        x: Math.max(4, Math.min(camCropCanvas.width - 4, p.x)),
        y: Math.max(4, Math.min(camCropCanvas.height - 4, p.y)),
      };
    } else if (camCropDragIdx === -2) {
      // Moving entire quad — shift all 4 corners by delta
      const dx = p.x - camCropMovePt.x;
      const dy = p.y - camCropMovePt.y;
      camCropPoints = camCropPoints.map(pt => ({
        x: Math.max(4, Math.min(camCropCanvas.width - 4, pt.x + dx)),
        y: Math.max(4, Math.min(camCropCanvas.height - 4, pt.y + dy)),
      }));
      camCropMovePt = { x: p.x, y: p.y };
    } else {
      // Drawing initial rectangle — update all 4 points from drag rect
      const sx = camCropMovePt.x, sy = camCropMovePt.y;
      const x = Math.min(sx, p.x), y = Math.min(sy, p.y);
      const w = Math.abs(p.x - sx), h = Math.abs(p.y - sy);
      if (w > 5 && h > 5) {
        initQuad(x, y, w, h);
      }
    }
    drawCropOverlay();
    e.preventDefault();
  });

  ['pointerup', 'pointercancel'].forEach(ev => {
    camCropCanvas.addEventListener(ev, () => {
      camCropDragging = false;
      camCropDragIdx = -1;
      camCropMovePt = null;
      updateBarVisibility(-1);
      camCropCanvas.style.cursor = 'crosshair';
    });
  });
}

// ── Mode toggle (kept for compatibility) ──

export function setCropMode(mode) {
  camCropMode = mode;
  document.getElementById('camCropModeRect')?.classList.toggle('active', mode === 'rect');
  document.getElementById('camCropModeLasso')?.classList.toggle('lasso-active', mode === 'lasso');
  camCropPoints = null;
  camCropPath = (mode === 'lasso') ? [] : null;
  drawCropOverlay();
}

// ── Perspective warp ──

function getPerspectiveMatrix(src, dst) {
  // src, dst: [{x,y},{x,y},{x,y},{x,y}] — TL, TR, BR, BL
  // Solve 8x8 linear system for perspective transform coefficients [a,b,c,d,e,f,g,h]
  // Such that: x' = (ax + by + c) / (gx + hy + 1), y' = (dx + ey + f) / (gx + hy + 1)

  const A = []; const B = [];
  for (let i = 0; i < 4; i++) {
    const sx = src[i].x, sy = src[i].y;
    const dx = dst[i].x, dy = dst[i].y;
    // x' equation
    A.push([sx, sy, 1, 0, 0, 0, -sx * dx, -sy * dx]);
    B.push(dx);
    // y' equation
    A.push([0, 0, 0, sx, sy, 1, -sx * dy, -sy * dy]);
    B.push(dy);
  }
  // Solve using Gaussian elimination
  return solve8x8(A, B);
}

function solve8x8(A, B) {
  // Gaussian elimination with partial pivoting for 8x8 system
  const n = 8;
  const m = A.map((row, i) => [...row, B[i]]);
  for (let col = 0; col < n; col++) {
    // Find pivot
    let maxEl = Math.abs(m[col][col]), maxRow = col;
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(m[row][col]) > maxEl) { maxEl = Math.abs(m[row][col]); maxRow = row; }
    }
    [m[col], m[maxRow]] = [m[col], m[maxRow]];
    if (Math.abs(m[col][col]) < 1e-12) return null; // singular
    // Eliminate below
    for (let row = col + 1; row < n; row++) {
      const factor = m[row][col] / m[col][col];
      for (let j = col; j <= n; j++) m[row][j] -= factor * m[col][j];
    }
  }
  // Back substitution
  const x = new Array(n);
  for (let i = n - 1; i >= 0; i--) {
    x[i] = m[i][n] / m[i][i];
    for (let j = i - 1; j >= 0; j--) m[j][n] -= m[j][i] * x[i];
  }
  return x; // [a,b,c,d,e,f,g,h]
}

function applyPerspective(M, x, y) {
  if (!M) return null;
  const [a, b, c, d, e, f, g, h] = M;
  const denom = g * x + h * y + 1;
  if (Math.abs(denom) < 1e-12) return null;
  return { x: (a * x + b * y + c) / denom, y: (d * x + e * y + f) / denom };
}

function bilinearSample(canvas, u, v) {
  const w = canvas.width, h = canvas.height;
  if (u < 0 || u >= w || v < 0 || v >= h) return [255, 255, 255, 255];
  const x = Math.floor(u), y = Math.floor(v);
  const fx = u - x, fy = v - y;
  const ctx = canvas.getContext('2d');
  const data = ctx.getImageData(Math.max(0, x), Math.max(0, y), Math.min(2, w - x), Math.min(2, h - y)).data;
  if (!data || data.length < 8) return [255, 255, 255, 255];

  const idx = (x, y) => ((y - Math.floor(v)) * Math.min(2, w - Math.floor(u)) + (x - Math.floor(u))) * 4;
  // Actually simpler: just use floor pixel for speed
  const pi = (Math.floor(v) * w + Math.floor(u)) * 4;
  const ctx2 = canvas.getContext('2d');
  const fullData = ctx2.getImageData(0, 0, w, h).data;
  const p = (Math.max(0, Math.min(h - 1, Math.floor(v))) * w + Math.max(0, Math.min(w - 1, Math.floor(u)))) * 4;
  return [fullData[p], fullData[p + 1], fullData[p + 2], fullData[p + 3]];
}

function quadBoundingBox(pts) {
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
  for (const p of pts) {
    if (p.x < x1) x1 = p.x; if (p.y < y1) y1 = p.y;
    if (p.x > x2) x2 = p.x; if (p.y > y2) y2 = p.y;
  }
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
}

function perspectiveWarp(srcCanvas, srcPts, outW, outH) {
  const MAX_PIXELS = 4000000; // ~4MP = safe for getImageData
  const srcPixels = srcCanvas.width * srcCanvas.height;

  // For large source images, work on a downscaled copy then drawImage to full size
  let workCanvas = srcCanvas;
  let workPts = srcPts;
  let scaleDown = 1;

  if (srcPixels > MAX_PIXELS) {
    scaleDown = Math.sqrt(MAX_PIXELS / srcPixels);
    const sw = Math.round(srcCanvas.width * scaleDown);
    const sh = Math.round(srcCanvas.height * scaleDown);
    workCanvas = document.createElement('canvas');
    workCanvas.width = sw; workCanvas.height = sh;
    workCanvas.getContext('2d').drawImage(srcCanvas, 0, 0, sw, sh);
    workPts = srcPts.map(p => ({ x: p.x * scaleDown, y: p.y * scaleDown }));
  }

  const dstPts = [
    { x: 0, y: 0 }, { x: outW, y: 0 },
    { x: outW, y: outH }, { x: 0, y: outH }
  ];
  const invM = getPerspectiveMatrix(dstPts, workPts);
  if (!invM) return null;

  const out = document.createElement('canvas');
  const workOutW = Math.round(outW * scaleDown);
  const workOutH = Math.round(outH * scaleDown);
  out.width = outW; out.height = outH;

  if (scaleDown < 1) {
    // Warp at smaller resolution, then scale up with drawImage
    const tmp = document.createElement('canvas');
    tmp.width = workOutW; tmp.height = workOutH;
    const tctx = tmp.getContext('2d');
    const imgData = tctx.createImageData(workOutW, workOutH);
    const d = imgData.data;
    const srcData = workCanvas.getContext('2d').getImageData(0, 0, workCanvas.width, workCanvas.height).data;
    const sw = workCanvas.width, sh = workCanvas.height;
    for (let y = 0; y < workOutH; y++) {
      for (let x = 0; x < workOutW; x++) {
        const sp = applyPerspective(invM, x, y);
        if (!sp) continue;
        const px = Math.round(sp.x), py = Math.round(sp.y);
        if (px < 0 || px >= sw || py < 0 || py >= sh) continue;
        const si = (py * sw + px) * 4;
        const di = (y * workOutW + x) * 4;
        d[di] = srcData[si]; d[di + 1] = srcData[si + 1]; d[di + 2] = srcData[si + 2]; d[di + 3] = 255;
      }
    }
    tctx.putImageData(imgData, 0, 0);
    out.getContext('2d').drawImage(tmp, 0, 0, outW, outH);
  } else {
    // Small enough — warp at full resolution
    const octx = out.getContext('2d');
    const imgData = octx.createImageData(outW, outH);
    const d = imgData.data;
    const srcData = srcCanvas.getContext('2d').getImageData(0, 0, srcCanvas.width, srcCanvas.height).data;
    const sw = srcCanvas.width, sh = srcCanvas.height;
    for (let y = 0; y < outH; y++) {
      for (let x = 0; x < outW; x++) {
        const sp = applyPerspective(invM, x, y);
        if (!sp) continue;
        const px = Math.round(sp.x), py = Math.round(sp.y);
        if (px < 0 || px >= sw || py < 0 || py >= sh) continue;
        const si = (py * sw + px) * 4;
        const di = (y * outW + x) * 4;
        d[di] = srcData[si]; d[di + 1] = srcData[si + 1]; d[di + 2] = srcData[si + 2]; d[di + 3] = 255;
      }
    }
    octx.putImageData(imgData, 0, 0);
  }
  return out;
}

// ── Confirm ──

export function confirmCrop() {
  if (!camCropImg) return null;

  // Log all state
  console.log('[crop] camRotation:', camRotation);
  console.log('[crop] camCropImg:', camCropImg.width, 'x', camCropImg.height);
  console.log('[crop] camCropCanvas buffer:', camCropCanvas.width, 'x', camCropCanvas.height);
  console.log('[crop] camCropCanvas CSS size:', camCropCanvas.style.width, camCropCanvas.style.height);
  const cr = camCropCanvas.getBoundingClientRect();
  console.log('[crop] camCropCanvas getBoundingClientRect:', cr.width, 'x', cr.height);

  // Build the rotated source canvas once
  const srcW = camCropImg.width, srcH = camCropImg.height;
  const rad = (camRotation * Math.PI) / 180;
  const cos = Math.abs(Math.cos(rad)), sin = Math.abs(Math.sin(rad));
  const rotW = Math.ceil(srcW * cos + srcH * sin);
  const rotH = Math.ceil(srcW * sin + srcH * cos);
  console.log('[crop] rotW x rotH:', rotW, 'x', rotH);

  const src = document.createElement('canvas');
  src.width = rotW; src.height = rotH;
  const sctx = src.getContext('2d');
  if (camRotation !== 0) {
    sctx.translate(rotW / 2, rotH / 2);
    sctx.rotate(rad);
    sctx.drawImage(camCropImg, -srcW / 2, -srcH / 2);
    sctx.setTransform(1, 0, 0, 1, 0, 0);
  } else {
    sctx.drawImage(camCropImg, 0, 0);
  }

  // Scale factor from display buffer → full-res rotated source
  const scale = rotW / camCropCanvas.width || 1;
  console.log('[crop] scale:', scale);
  console.log('[crop] src canvas size:', src.width, 'x', src.height);

  function finish(resultCanvas) {
    _wasCapture = false;
    _captureLock = false;
    camCropCanvas.style.display = 'none'; camCropActions.style.display = 'none'; camModal.classList.remove('show');
    hideRotateBar();
    camCropImg = null; camCropDisplay = null; camCropPoints = null; camCropPath = null;
    // Delay nav restore to avoid click-through to tabs behind
    setTimeout(() => { const nav = document.querySelector('.bottom-nav'); if (nav) nav.style.display = ''; }, 100);
    return new Promise(r => resultCanvas.toBlob(b => r(b ? new File([b], 'camera.jpg', { type: 'image/jpeg' }) : null), 'image/jpeg', 0.92));
  }

  // ── Lasso: clip to path, fill outside with white
  if (camCropMode === 'lasso' && camCropPath && camCropPath.length > 4) {
    const np = camCropPath.map(p => ({ x: p.x * scale, y: p.y * scale }));
    let mx = np[0].x, my = np[0].y, Mx = mx, My = my;
    for (let i = 1; i < np.length; i++) {
      if (np[i].x < mx) mx = np[i].x;
      if (np[i].y < my) my = np[i].y;
      if (np[i].x > Mx) Mx = np[i].x;
      if (np[i].y > My) My = np[i].y;
    }
    const bw = Math.round(Mx - mx), bh = Math.round(My - my);
    console.log('[crop] lasso bbox:', mx, my, bw, bh, 'canvas:', src.width, src.height);
    if (bw > 10 && bh > 10) {
      const out = document.createElement('canvas'); out.width = bw; out.height = bh;
      const octx = out.getContext('2d');
      octx.fillStyle = '#ffffff'; octx.fillRect(0, 0, bw, bh);
      octx.save(); octx.beginPath(); octx.moveTo(np[0].x - mx, np[0].y - my);
      for (let i = 1; i < np.length; i++) octx.lineTo(np[i].x - mx, np[i].y - my);
      octx.closePath(); octx.clip();
      octx.drawImage(src, Math.round(mx), Math.round(my), bw, bh, 0, 0, bw, bh);
      octx.restore();
      return finish(out);
    }
  }

  // ── Quad crop: clip to quad, fill outside with white
  if (camCropPoints) {
    const confirmScale = rotW / camCropCanvas.width || 1;
    const np = camCropPoints.map(p => ({ x: p.x * confirmScale, y: p.y * confirmScale }));
    const bb = quadBoundingBox(np);
    const bw = Math.round(bb.w), bh = Math.round(bb.h);
    if (bw >= 10 && bh >= 10) {
      const out = document.createElement('canvas');
      out.width = bw; out.height = bh;
      const octx = out.getContext('2d');
      octx.fillStyle = '#ffffff'; octx.fillRect(0, 0, bw, bh);
      octx.save();
      octx.beginPath(); octx.moveTo(np[0].x - bb.x, np[0].y - bb.y);
      for (let i = 1; i < 4; i++) octx.lineTo(np[i].x - bb.x, np[i].y - bb.y);
      octx.closePath(); octx.clip();
      octx.drawImage(src, Math.round(bb.x), Math.round(bb.y), bw, bh, 0, 0, bw, bh);
      octx.restore();
      return finish(out);
    }
  }

  // ── No crop: export whole rotated image
  console.log('[crop] no crop points, exporting full src');
  return finish(src);
}

export function retakePhoto() {
  camCropCanvas.style.display = 'none'; camCropActions.style.display = 'none';
  camCropImg = null; camCropDisplay = null; camCropPoints = null;
  openCamera();
}
