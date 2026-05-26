// Camera module — open/close/capture, flash toggle, focus, zoom
// Extracted from ocr_demo.html + mobile enhancements

let camStream = null;
let camVideo = null;
let camModal = null;

export function initCamera(videoEl, modalEl) {
  camVideo = videoEl;
  camModal = modalEl;
}

export function isOpen() {
  return camStream !== null && camStream.active;
}

export async function openCamera({ facingMode = 'environment' } = {}) {
  try {
    camStream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode,
        width: { ideal: 1920 },
        height: { ideal: 1080 },
      },
      audio: false,
    });
    camVideo.srcObject = camStream;
    camModal.classList.add('show');
  } catch (e) {
    throw new Error('Camera access denied: ' + (e.message || e));
  }
}

export function closeCamera() {
  if (camStream) {
    camStream.getTracks().forEach(t => t.stop());
    camStream = null;
  }
  if (camVideo) camVideo.srcObject = null;
  if (camModal) camModal.classList.remove('show');
}

export async function switchFacing() {
  const currentFacing = camStream
    ? camStream.getVideoTracks()[0]?.getSettings()?.facingMode
    : 'environment';
  const newFacing = currentFacing === 'environment' ? 'user' : 'environment';
  closeCamera();
  await openCamera({ facingMode: newFacing });
}

export async function toggleFlash() {
  if (!camStream) return false;
  const track = camStream.getVideoTracks()[0];
  if (!track) return false;
  try {
    const current = track.getSettings().torch || false;
    await track.applyConstraints({ advanced: [{ torch: !current }] });
    return !current;
  } catch (e) {
    return false;
  }
}

export function isFlashSupported() {
  if (!camStream) return false;
  const track = camStream.getVideoTracks()[0];
  if (!track) return false;
  const capabilities = track.getCapabilities?.();
  return capabilities?.torch === true;
}

export async function setZoom(level) {
  if (!camStream) return;
  const track = camStream.getVideoTracks()[0];
  if (!track) return;
  try {
    await track.applyConstraints({ advanced: [{ zoom: level }] });
  } catch (e) { /* not supported */ }
}

export function capturePhoto(mimeType = 'image/jpeg', quality = 0.92) {
  return new Promise((resolve) => {
    if (!camStream || !camVideo) { resolve(null); return; }
    const canvas = document.createElement('canvas');
    canvas.width = camVideo.videoWidth;
    canvas.height = camVideo.videoHeight;
    canvas.getContext('2d').drawImage(camVideo, 0, 0);
    canvas.toBlob((blob) => {
      resolve(blob ? new File([blob], 'camera.' + (mimeType === 'image/jpeg' ? 'jpg' : 'png'), { type: mimeType }) : null);
    }, mimeType, quality);
  });
}
