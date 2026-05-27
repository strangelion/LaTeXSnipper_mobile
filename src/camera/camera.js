// Camera module — open/capture/crop/close
// Full crop: corner handles, edge resize, drag-move, lasso mode

let camStream = null;
let camVideo = null;
let camModal = null;
let camCropCanvas = null;
let camCropCtx = null;
let camCropImg = null;
let camCropRect = null;
let camCropDragging = false;
let camCropStart = null;
let camCropPath = [];
let camCropMode = 'rect';
let camCropAction = '';
let camCropCorner = -1, camCropEdge = -1;
let camCropMoveBase = null, camCropMoveOff = null;
let camActions = null, camCropActions = null;

export function initCamera(videoEl, modalEl, cropCanvasEl, actionsEl, cropActionsEl) {
  camVideo = videoEl; camModal = modalEl;
  camCropCanvas = cropCanvasEl; camCropCtx = camCropCanvas.getContext('2d');
  camActions = actionsEl; camCropActions = cropActionsEl;
  bindCropEvents();
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
    // Hide bottom nav during camera
    const nav = document.querySelector('.bottom-nav');
    if (nav) nav.style.display = 'none';
    // Reset flash state
    document.getElementById('camFlash')?.classList.remove('active');
  } catch (e) { throw new Error('Camera access denied: ' + (e.message || e)); }
}

export async function toggleFlash() {
  if (!camStream) return;
  const track = camStream.getVideoTracks()[0];
  if (!track) return;
  try {
    const caps = track.getCapabilities ? track.getCapabilities() : null;
    if (!caps || !caps.torch) return; // No torch support
    const current = track.getSettings().torch || false;
    await track.applyConstraints({ advanced: [{ torch: !current }] });
    const btn = document.getElementById('camFlash');
    if (btn) btn.classList.toggle('active', !current);
  } catch (_) { /* torch not supported */ }
}

export function rotateImage() {
  if (!camCropImg) return;
  const w = camCropImg.width, h = camCropImg.height;
  const rotated = document.createElement('canvas');
  rotated.width = h; rotated.height = w;
  const ctx = rotated.getContext('2d');
  ctx.translate(h / 2, w / 2);
  ctx.rotate(Math.PI / 2);
  ctx.drawImage(camCropImg, -w / 2, -h / 2);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  camCropImg = rotated;
  camCropCanvas.width = h; camCropCanvas.height = w;
  // Reset CSS display to ensure proper scaling after dimension swap
  camCropCanvas.style.width = '95vw';
  camCropCanvas.style.maxHeight = '65vh';
  camCropRect = null; camCropPath = [];
  camCropDragging = false; camCropAction = '';
  drawCropOverlay();
}

export function closeCamera() {
  if (camStream) { camStream.getTracks().forEach(t => t.stop()); camStream = null; }
  camVideo.srcObject = null; camVideo.style.display = '';
  camCropCanvas.style.display = 'none';
  camActions.style.display = 'flex'; camCropActions.style.display = 'none';
  camCropImg = null; camCropRect = null; camCropPath = [];
  camModal.classList.remove('show');
  // Restore bottom nav
  const nav = document.querySelector('.bottom-nav');
  if (nav) nav.style.display = '';
}

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
  camCropCanvas.width = camCropImg.width; camCropCanvas.height = camCropImg.height;
  camCropCtx.drawImage(camCropImg, 0, 0);
  camCropRect = null; camCropPath = []; camCropDragging = false;
  drawCropOverlay();
  camActions.style.display = 'none'; camCropActions.style.display = 'flex';
}

// ── Overlay ──
function drawCropOverlay(hoverCorner = -1, hoverEdge = -1, hovering = false) {
  if (!camCropImg) return;
  camCropCtx.drawImage(camCropImg, 0, 0);
  if (!camCropRect) {
    camCropCtx.fillStyle = 'rgba(0,0,0,0.25)';
    camCropCtx.fillRect(0, 0, camCropCanvas.width, camCropCanvas.height);
    camCropCtx.fillStyle = 'rgba(255,255,255,0.9)';
    const fs = Math.max(32, Math.min(52, camCropCanvas.width / 10));
    camCropCtx.font = 'bold ' + fs + 'px "Segoe UI","Microsoft YaHei",sans-serif';
    camCropCtx.textAlign = 'center'; camCropCtx.textBaseline = 'middle';
    camCropCtx.fillText('拖拽框选要识别的区域', camCropCanvas.width / 2, camCropCanvas.height / 2);
    camCropCtx.fillStyle = 'rgba(255,255,255,0.5)';
    camCropCtx.font = (fs * 0.55) + 'px "Segoe UI","Microsoft YaHei",sans-serif';
    camCropCtx.fillText('不框选则识别整张图片', camCropCanvas.width / 2, camCropCanvas.height / 2 + fs * 1.3);
    return;
  }
  const r = camCropRect;
  camCropCtx.fillStyle = 'rgba(0,0,0,0.35)';
  camCropCtx.fillRect(0, 0, camCropCanvas.width, r.y);
  camCropCtx.fillRect(0, r.y, r.x, r.h);
  camCropCtx.fillRect(r.x + r.w, r.y, camCropCanvas.width - r.x - r.w, r.h);
  camCropCtx.fillRect(0, r.y + r.h, camCropCanvas.width, camCropCanvas.height - r.y - r.h);
  const lineW = hovering ? 3.5 : 2;
  camCropCtx.strokeStyle = hovering ? '#93c5fd' : '#60a5fa'; camCropCtx.lineWidth = lineW;
  camCropCtx.strokeRect(r.x, r.y, r.w, r.h);
  if (camCropPath && camCropPath.length > 1) {
    camCropCtx.beginPath(); camCropCtx.strokeStyle = '#f97316'; camCropCtx.lineWidth = 2;
    camCropCtx.moveTo(camCropPath[0].x, camCropPath[0].y);
    for (let i = 1; i < camCropPath.length; i++) camCropCtx.lineTo(camCropPath[i].x, camCropPath[i].y);
    camCropCtx.stroke();
  }
  const corners = [[r.x, r.y], [r.x + r.w, r.y], [r.x, r.y + r.h], [r.x + r.w, r.y + r.h]];
  const baseR = Math.max(14, Math.min(24, r.w / 10, r.h / 10));
  for (let i = 0; i < 4; i++) {
    const isHovered = (i === hoverCorner);
    const hR = isHovered ? baseR * 2.5 : baseR;
    // Outer glow
    camCropCtx.fillStyle = isHovered ? 'rgba(147,197,253,0.35)' : 'rgba(96,165,250,0.15)';
    camCropCtx.beginPath();
    camCropCtx.arc(corners[i][0], corners[i][1], hR * 1.6, 0, Math.PI * 2);
    camCropCtx.fill();
    // Core dot
    camCropCtx.fillStyle = isHovered ? '#93c5fd' : '#60a5fa';
    camCropCtx.beginPath();
    camCropCtx.arc(corners[i][0], corners[i][1], hR, 0, Math.PI * 2);
    camCropCtx.fill();
  }
}

// ── Hit testing ──
function cornerHit(p, r) {
  if (!r || r.w < 20) return -1;
  const cs = [[r.x, r.y], [r.x+r.w, r.y], [r.x, r.y+r.h], [r.x+r.w, r.y+r.h]];
  const thr = Math.max(44, Math.min(80, r.w / 3, r.h / 3));
  for (let i = 0; i < 4; i++) { const dx = p.x - cs[i][0], dy = p.y - cs[i][1]; if (Math.sqrt(dx*dx+dy*dy) < thr) return i; }
  return -1;
}
function edgeHit(p, r) {
  if (!r || r.w < 30 || r.h < 30) return -1;
  const m = Math.max(28, Math.min(r.w, r.h) * 0.12);
  if (Math.abs(p.y - r.y) < m && p.x > r.x + m && p.x < r.x + r.w - m) return 0;
  if (Math.abs(p.x - (r.x + r.w)) < m && p.y > r.y + m && p.y < r.y + r.h - m) return 1;
  if (Math.abs(p.y - (r.y + r.h)) < m && p.x > r.x + m && p.x < r.x + r.w - m) return 2;
  if (Math.abs(p.x - r.x) < m && p.y > r.y + m && p.y < r.y + r.h - m) return 3;
  return -1;
}
function insideRect(p, r) { return r && p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h; }

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
  if (clientY === undefined || clientY < 0) {
    if (modeBar) modeBar.style.opacity = '1';
    if (bottomBar) bottomBar.style.opacity = '1';
    return;
  }
  const h = window.innerHeight;
  if (modeBar) modeBar.style.opacity = clientY < h * 0.15 ? '0.15' : '1';
  if (bottomBar) bottomBar.style.opacity = clientY > h * 0.82 ? '0.15' : '1';
}

function bindCropEvents() {
  camCropCanvas.style.touchAction = 'none';
  camCropCanvas.addEventListener('pointerdown', (e) => {
    const p = cropGetPos(e);
    if (camCropMode === 'lasso') {
      camCropAction = 'drawing'; camCropStart = {x:p.x, y:p.y}; camCropDragging = true; camCropPath = [p];
      camCropCanvas.setPointerCapture(e.pointerId); e.preventDefault(); return;
    }
    const r = camCropRect;
    const ci = cornerHit(p, r);
    if (ci >= 0) { camCropAction = 'resizing'; camCropCorner = ci; camCropMoveBase = {x:r.x,y:r.y,w:r.w,h:r.h}; camCropDragging = true; }
    else if (edgeHit(p, r) >= 0) { camCropAction = 'edge-resizing'; camCropEdge = edgeHit(p, r); camCropMoveBase = {x:r.x,y:r.y,w:r.w,h:r.h}; camCropDragging = true; }
    else if (insideRect(p, r)) { camCropAction = 'moving'; camCropMoveBase = {x:r.x,y:r.y,w:r.w,h:r.h}; camCropMoveOff = {x:p.x-r.x, y:p.y-r.y}; camCropDragging = true; }
    else { camCropAction = 'drawing'; camCropStart = {x:p.x, y:p.y}; camCropDragging = true; camCropPath = []; }
    camCropCanvas.setPointerCapture(e.pointerId); e.preventDefault();
  });
  camCropCanvas.addEventListener('pointermove', (e) => {
    const p = cropGetPos(e);
    if (!camCropDragging) {
      if (camCropRect && camCropMode === 'rect') {
        const ci = cornerHit(p, camCropRect);
        const ei = ci < 0 ? edgeHit(p, camCropRect) : -1;
        if (ci >= 0 || ei >= 0 || insideRect(p, camCropRect)) drawCropOverlay(ci, ei, true);
      }
      return;
    }
    updateBarVisibility(p.clientY);
    if (camCropMode === 'lasso') {
      camCropPath.push(p); const prev = camCropPath[camCropPath.length-2];
      camCropCtx.strokeStyle = '#f97316'; camCropCtx.lineWidth = 2; camCropCtx.lineCap = 'round';
      camCropCtx.beginPath(); camCropCtx.moveTo(prev.x, prev.y); camCropCtx.lineTo(p.x, p.y); camCropCtx.stroke();
    } else if (camCropAction === 'drawing') {
      camCropRect = {x:Math.min(camCropStart.x,p.x), y:Math.min(camCropStart.y,p.y), w:Math.abs(p.x-camCropStart.x), h:Math.abs(p.y-camCropStart.y)}; drawCropOverlay();
    } else if (camCropAction === 'moving') {
      const b = camCropMoveBase;
      camCropRect = {x:Math.max(0,Math.min(p.x-camCropMoveOff.x,camCropCanvas.width-b.w)), y:Math.max(0,Math.min(p.y-camCropMoveOff.y,camCropCanvas.height-b.h)), w:b.w, h:b.h}; drawCropOverlay();
    } else if (camCropAction === 'resizing') {
      const rb = camCropMoveBase; const ci2 = camCropCorner;
      const x1=ci2===0||ci2===2?p.x:rb.x, y1=ci2===0||ci2===1?p.y:rb.y, x2=ci2===1||ci2===3?p.x:rb.x+rb.w, y2=ci2===2||ci2===3?p.y:rb.y+rb.h;
      camCropRect = {x:Math.min(x1,x2), y:Math.min(y1,y2), w:Math.abs(x2-x1), h:Math.abs(y2-y1)}; drawCropOverlay();
    } else if (camCropAction === 'edge-resizing') {
      const eb=camCropMoveBase, ei2=camCropEdge;
      if(ei2===0) camCropRect={x:eb.x,y:Math.min(p.y,eb.y+eb.h-30),w:eb.w,h:Math.max(30,eb.y+eb.h-p.y)};
      else if(ei2===1) camCropRect={x:eb.x,y:eb.y,w:Math.max(30,p.x-eb.x),h:eb.h};
      else if(ei2===2) camCropRect={x:eb.x,y:eb.y,w:eb.w,h:Math.max(30,p.y-eb.y)};
      else if(ei2===3) camCropRect={x:Math.min(p.x,eb.x+eb.w-30),y:eb.y,w:Math.max(30,eb.x+eb.w-p.x),h:eb.h};
      drawCropOverlay();
    }
    e.preventDefault();
  });
  ['pointerup','pointercancel'].forEach(ev=>{camCropCanvas.addEventListener(ev,()=>{camCropDragging=false;camCropAction='';updateBarVisibility(-1);});});
}

// ── Mode ──
export function setCropMode(mode) {
  camCropMode = mode;
  document.getElementById('camCropModeRect')?.classList.toggle('active', mode === 'rect');
  document.getElementById('camCropModeLasso')?.classList.toggle('lasso-active', mode === 'lasso');
  camCropRect = null; camCropPath = []; drawCropOverlay();
}

function pathBounds() {
  if (!camCropPath || camCropPath.length < 2) return null;
  let mx=camCropPath[0].x, my=camCropPath[0].y, Mx=mx, My=my;
  for(let i=1;i<camCropPath.length;i++){const p=camCropPath[i];if(p.x<mx)mx=p.x;if(p.y<my)my=p.y;if(p.x>Mx)Mx=p.x;if(p.y>My)My=p.y;}
  return {x:mx,y:my,w:Mx-mx,h:My-my};
}

// ── Confirm ──
export function confirmCrop() {
  if (!camCropImg) return null;
  const rect = camCropRect || pathBounds();
  const sx = rect && rect.w > 10 ? rect.x : 0, sy = rect && rect.h > 10 ? rect.y : 0;
  const sw = rect && rect.w > 10 ? rect.w : camCropImg.width, sh = rect && rect.h > 10 ? rect.h : camCropImg.height;
  const out = document.createElement('canvas'); out.width = sw; out.height = sh;
  const octx = out.getContext('2d');
  if (camCropPath && camCropPath.length > 2) {
    octx.fillStyle = '#ffffff'; octx.fillRect(0, 0, sw, sh);
    octx.save(); octx.beginPath(); octx.moveTo(camCropPath[0].x - sx, camCropPath[0].y - sy);
    for (let i = 1; i < camCropPath.length; i++) octx.lineTo(camCropPath[i].x - sx, camCropPath[i].y - sy);
    octx.closePath(); octx.clip(); octx.drawImage(camCropImg, sx, sy, sw, sh, 0, 0, sw, sh); octx.restore();
  } else { octx.drawImage(camCropImg, sx, sy, sw, sh, 0, 0, sw, sh); }
  camCropCanvas.style.display = 'none'; camCropActions.style.display = 'none'; camModal.classList.remove('show');
  camCropImg = null; camCropRect = null; camCropPath = [];
  // Restore bottom nav
  const nav = document.querySelector('.bottom-nav');
  if (nav) nav.style.display = '';
  return new Promise(r => out.toBlob(b => r(new File([b], 'camera.jpg', { type: 'image/jpeg' })), 'image/jpeg', 0.92));
}

export function retakePhoto() {
  camCropCanvas.style.display = 'none'; camCropActions.style.display = 'none';
  camCropImg = null; camCropRect = null; camCropPath = [];
  openCamera();
}
