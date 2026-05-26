// Camera module — open/capture/crop/close
// Based on LaTeXSnipper_user_manual/public/js/ocr.js camera logic

let camStream = null;
let camVideo = null;
let camModal = null;
let camCropCanvas = null;
let camCropCtx = null;
let camCropImg = null;
let camCropRect = null;
let camCropDragging = false;
let camCropStart = null;
let camActions = null;
let camCropActions = null;
let onPhotoCallback = null;

export function initCamera(videoEl, modalEl, cropCanvasEl, actionsEl, cropActionsEl) {
  camVideo = videoEl;
  camModal = modalEl;
  camCropCanvas = cropCanvasEl;
  camCropCtx = camCropCanvas.getContext('2d');
  camActions = actionsEl;
  camCropActions = cropActionsEl;
  bindCropEvents();
}

// Called when user confirms crop → callback receives the cropped File
export function onPhoto(callback) {
  onPhotoCallback = callback;
}

export function isOpen() {
  return camStream !== null && camStream.active;
}

export async function openCamera() {
  try {
    camStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } },
      audio: false,
    });
    camVideo.srcObject = camStream;
    camVideo.style.display = '';
    camCropCanvas.style.display = 'none';
    camActions.style.display = 'flex';
    camCropActions.style.display = 'none';
    camModal.classList.add('show');
  } catch (e) {
    throw new Error('Camera access denied: ' + (e.message || e));
  }
}

export function closeCamera() {
  if (camStream) { camStream.getTracks().forEach(t => t.stop()); camStream = null; }
  camVideo.srcObject = null;
  camVideo.style.display = '';
  camCropCanvas.style.display = 'none';
  camActions.style.display = 'flex';
  camCropActions.style.display = 'none';
  camCropImg = null;
  camCropRect = null;
  camModal.classList.remove('show');
}

// ── Capture: freeze frame, show crop overlay ──
export function capturePhoto() {
  if (!camStream) return;
  camCropImg = document.createElement('canvas');
  camCropImg.width = camVideo.videoWidth;
  camCropImg.height = camVideo.videoHeight;
  camCropImg.getContext('2d').drawImage(camVideo, 0, 0);
  // Stop live stream
  if (camStream) { camStream.getTracks().forEach(t => t.stop()); camStream = null; }
  camVideo.srcObject = null;
  camVideo.style.display = 'none';
  // Show crop canvas
  camCropCanvas.style.display = 'block';
  camCropCanvas.width = camCropImg.width;
  camCropCanvas.height = camCropImg.height;
  camCropCtx.drawImage(camCropImg, 0, 0);
  camCropRect = null;
  camCropDragging = false;
  drawCropOverlay();
  camActions.style.display = 'none';
  camCropActions.style.display = 'flex';
}

// ── Crop overlay drawing ──
function drawCropOverlay() {
  camCropCtx.drawImage(camCropImg, 0, 0);
  if (!camCropRect) {
    camCropCtx.fillStyle = 'rgba(0,0,0,0.25)';
    camCropCtx.fillRect(0, 0, camCropCanvas.width, camCropCanvas.height);
    camCropCtx.fillStyle = 'rgba(255,255,255,0.9)';
    const fs = Math.max(14, Math.min(24, camCropCanvas.width / 20));
    camCropCtx.font = fs + 'px "Segoe UI","Microsoft YaHei",sans-serif';
    camCropCtx.textAlign = 'center'; camCropCtx.textBaseline = 'middle';
    camCropCtx.fillText('拖拽框选要识别的区域', camCropCanvas.width / 2, camCropCanvas.height / 2);
    camCropCtx.fillStyle = 'rgba(255,255,255,0.5)';
    camCropCtx.font = (fs * 0.6) + 'px "Segoe UI","Microsoft YaHei",sans-serif';
    camCropCtx.fillText('不框选则识别整张图片', camCropCanvas.width / 2, camCropCanvas.height / 2 + fs * 1.4);
    return;
  }
  const r = camCropRect;
  camCropCtx.fillStyle = 'rgba(0,0,0,0.35)';
  camCropCtx.fillRect(0, 0, camCropCanvas.width, r.y);
  camCropCtx.fillRect(0, r.y, r.x, r.h);
  camCropCtx.fillRect(r.x + r.w, r.y, camCropCanvas.width - r.x - r.w, r.h);
  camCropCtx.fillRect(0, r.y + r.h, camCropCanvas.width, camCropCanvas.height - r.y - r.h);
  camCropCtx.strokeStyle = '#60a5fa'; camCropCtx.lineWidth = 2;
  camCropCtx.strokeRect(r.x, r.y, r.w, r.h);
}

// ── Crop touch/mouse events ──
function cropGetPos(e) {
  const rect = camCropCanvas.getBoundingClientRect();
  const sx = camCropCanvas.width / rect.width;
  const sy = camCropCanvas.height / rect.height;
  const cx = e.touches ? e.touches[0].clientX : e.clientX;
  const cy = e.touches ? e.touches[0].clientY : e.clientY;
  return { x: (cx - rect.left) * sx, y: (cy - rect.top) * sy };
}

function bindCropEvents() {
  camCropCanvas.style.touchAction = 'none';
  camCropCanvas.addEventListener('pointerdown', (e) => {
    const p = cropGetPos(e);
    camCropStart = { x: p.x, y: p.y };
    camCropDragging = true;
    camCropCanvas.setPointerCapture(e.pointerId);
    e.preventDefault();
  });
  camCropCanvas.addEventListener('pointermove', (e) => {
    if (!camCropDragging) return;
    const p = cropGetPos(e);
    camCropRect = {
      x: Math.min(camCropStart.x, p.x), y: Math.min(camCropStart.y, p.y),
      w: Math.abs(p.x - camCropStart.x), h: Math.abs(p.y - camCropStart.y),
    };
    drawCropOverlay();
    e.preventDefault();
  });
  ['pointerup', 'pointercancel'].forEach(ev => {
    camCropCanvas.addEventListener(ev, () => { camCropDragging = false; });
  });
}

// ── Confirm crop → produce cropped file ──
export function confirmCrop() {
  if (!camCropImg) return null;
  const sx = camCropRect && camCropRect.w > 10 ? camCropRect.x : 0;
  const sy = camCropRect && camCropRect.h > 10 ? camCropRect.y : 0;
  const sw = camCropRect && camCropRect.w > 10 ? camCropRect.w : camCropImg.width;
  const sh = camCropRect && camCropRect.h > 10 ? camCropRect.h : camCropImg.height;
  const out = document.createElement('canvas');
  out.width = sw; out.height = sh;
  out.getContext('2d').drawImage(camCropImg, sx, sy, sw, sh, 0, 0, sw, sh);
  camCropCanvas.style.display = 'none';
  camCropActions.style.display = 'none';
  camModal.classList.remove('show');
  const img = camCropImg;
  camCropImg = null;
  camCropRect = null;
  return new Promise((resolve) => {
    out.toBlob((blob) => {
      resolve(new File([blob], 'camera.jpg', { type: 'image/jpeg' }));
    }, 'image/jpeg', 0.92);
  });
}

// ── Retake: go back to live camera ──
export function retakePhoto() {
  camCropCanvas.style.display = 'none';
  camCropActions.style.display = 'none';
  camCropImg = null;
  camCropRect = null;
  openCamera();
}
