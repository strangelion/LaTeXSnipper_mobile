// Global constants — extracted from ocr_demo.html

// Model paths (local, bundled with app)
export const MODEL_BASE = '/models/mathcraft-formula-rec';
export const MODEL_CACHE = 'ocr-models-v1';

// Image preprocessing
export const IMG_SIZE = 384;
export const CONFIDENCE_MIN = 0.05; // Low threshold to allow non-formula text recognition
export const DECODER_MAX_TOKENS = 512;

// PDF
export const MAX_PDF_PAGES = 100;
export const PDF_RENDER_TARGET = 768;

// Handwriting
export const HW_MAX_STROKES = 60;
export const HW_DEFAULT_WIDTH = 800;
export const HW_DEFAULT_HEIGHT = 500;

// Rate limiting
export const COOLDOWN_MS = 2000;

// CDN versions (documentation only — bundled via npm)
export const ORT_VERSION = '1.21.0';
export const PDFJS_VERSION = '3.11.174';
export const MATHJAX_VERSION = '3.2.2';

// Status icons (SVG strings)
export const ICONS = {
  loading: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
  ready: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>',
  processing: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>',
  done: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>',
  error: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
};
