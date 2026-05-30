export default {
  // ── Tab navigation ──
  "nav.recognize": "Recognize",
  "nav.editor": "Editor",
  "nav.history": "History",
  "nav.settings": "Settings",

  // ── Theme ──
  "theme.toggle": "Toggle Theme",
  "theme.light": "Light",
  "theme.dark": "Dark",

  // ── Recognize page ──
  "recog.dropHint": "Tap or drag to upload image / PDF · <kbd>Ctrl+V</kbd> to paste",
  "recog.mode.formula": "Formula",
  "recog.mode.text": "Text",
  "recog.mode.mixed": "Mixed",
  "recog.recognizing": "Recognizing…",
  "recog.emptyResult": "No content detected",
  "recog.copyLatex": "Copy LaTeX",
  "recog.copyText": "Copy Text",
  "recog.sendToEditor": "Send to Editor",
  "recog.confidence": "Confidence",

  // ── Camera ──
  "camera.open": "Camera OCR",
  "camera.close": "Close Camera",
  "camera.capture": "Capture",
  "camera.flash": "Flash",
  "camera.rotate": "Rotate",
  "camera.crop": "Crop",
  "camera.confirm": "Confirm",
  "camera.retake": "Retake",
  "camera.cropRect": "Rectangle",
  "camera.cropLasso": "Lasso",
  "camera.cancel": "Cancel",

  // ── Handwriting ──
  "hw.pen": "Pen",
  "hw.eraser": "Eraser",
  "hw.undo": "Undo",
  "hw.redo": "Redo",
  "hw.clear": "Clear",
  "hw.recognize": "Recognize",
  "hw.export": "Export Image",

  // ── Editor ──
  "editor.copyLatex": "Copy LaTeX",
  "editor.copyText": "Copy Text",
  "editor.exportMd": "Export Markdown",
  "editor.exportMathML": "Export MathML",
  "editor.clear": "Clear",

  // ── History ──
  "history.title": "History",
  "history.empty": "No recognition history yet.<br>Start by uploading a formula image!",
  "history.favorite": "Favorite",
  "history.delete": "Delete",
  "history.exportJson": "Export JSON",
  "history.importJson": "Import JSON",

  // ── PDF ──
  "pdf.page": "Page {{current}} / {{total}}",
  "pdf.prev": "Previous",
  "pdf.next": "Next",
  "pdf.selectPage": "Select Page",

  // ── Settings ──
  "settings.title": "Settings",
  "settings.engine": "Recognition Engine",
  "settings.engine.mathcraft": "MathCraft (Built-in)",
  "settings.engine.external": "External API",
  "settings.externalBaseUrl": "API Base URL",
  "settings.externalModel": "Model Name",
  "settings.externalApiKey": "API Key",
  "settings.save": "Save Settings",
  "settings.saved": "Saved ✓",
  "settings.test": "Test Connection",
  "settings.testing": "Testing…",
  "settings.testSuccess": "✓ Connected",
  "settings.testFail": "✗ Connection failed",
  "settings.language": "Interface Language",

  // ── Dev panel ──
  "dev.title": "Developer Panel",
  "dev.logs": "Logs",
  "dev.clearLogs": "Clear Logs",
  "dev.noLogs": "(no logs)",
  "dev.cleared": "(logs cleared)",

  // ── Update ──
  "update.available": "New version v{{version}} available",
  "update.download": "Download Update",
  "update.later": "Later",
  "update.checking": "Checking for updates…",

  // ── Common ──
  "common.ok": "OK",
  "common.cancel": "Cancel",
  "common.close": "Close",
  "common.loading": "Loading…",
  "common.cached": "Cached",
  "common.error": "Error",
  "common.retry": "Retry",

  // ── Status bar ──
  "status.ready": "Ready! Drag a formula image or Ctrl+V to paste",
  "status.readyRetry": "Ready! Please re-upload an image",
  "status.loadingTokenizer": "Loading tokenizer…",
  "status.loadingEncoder": "Downloading encoder model (84MB)…",
  "status.downloadingModel": "Downloading {{name}}…",
  "status.modelCached": "{{name}} (cached)",
  "status.modelDone": "{{name}} ✓",
  "status.recognizing": "Recognizing…",
  "status.recognizingCloud": "Calling cloud API…",
  "status.recognizingPdf": "Parsing PDF…",
  "status.done": "Recognition complete",
  "status.donePages": "Recognition complete ({{count}} pages)",
  "status.cloudDone": "Cloud recognition complete",
  "status.loadFailed": "Load failed",
  "status.initializing": "Initializing…",
  "status.loadingEngine": "Loading OCR engine…",

  // ── Errors ──
  "error.modelNotReady": "Models not ready yet, please wait",
  "error.fileTooSmall": "File too small, at least 1KB",
  "error.lowConfidence": "No content detected (confidence {{pct}}% too low). Please retry.",
  "error.recognitionFailed": "Recognition failed: {{msg}}",
  "error.cloudEmpty": "Cloud returned no valid results",
  "error.cloudFailed": "Cloud recognition failed: {{msg}}",
  "error.noBaseUrl": "Base URL is required",
  "error.initFailed": "Initialization failed: {{msg}}",

  // ── Camera overlay ──
  "camera.guideDrag": "Drag to select recognition area",
  "camera.guideNoCrop": "Full image recognition with no selection",

  // ── PDF ──
  "pdf.pages": "{{n}} / {{total}}",
  "pdf.confidence": "Confidence {{pct}}%",

  // ── Buttons (dynamic text) ──
  "btn.copyLatex": "Copy LaTeX",
  "btn.copied": "Copied ✓",
  "btn.saveSettings": "Save Settings",
  "btn.saved": "Saved ✓",
  "btn.share": "Share",
  "btn.sendToEditor": "Send to Editor",
  "btn.exportPng": "Export PNG",
  "btn.exportSvg": "Export SVG",
  "btn.clearCache": "Clear Model Cache",
  "btn.cacheCleared": "Cleared ✓",
  "btn.cacheClearFailed": "Clear failed",

  // ── Dev panel ──
  "dev.logReadFailed": "(log read failed)",
  "update.checkUpdate": "Check for Updates",
  "update.upToDate": "Already up to date",
  "check.failed": "Check failed",
  "recog.modeLabel": "Recognition Mode",
"settings.skin": "Theme",
  "settings.presets": "Presets",
  "settings.connection": "Connection",
  "recog.privacy": "All recognition runs locally in your browser. Images are never uploaded.",
  "recog.intro": "<strong>Offline OCR:</strong> Fully offline: ONNX Runtime local inference, models bundled in the app. No network needed after install. Supports images, PDF, camera, and handwriting recognition.",
  "dev.multiThread": "ONNX Multi-thread (up to 8 cores + SIMD)",
  "settings.custom": "Custom",
  "recog.resultLabel": "Result",
  "btn.aiPolish": "AI Polish",
  "settings.engine.builtin": "Offline Only",
  "settings.engine.hybrid": "Built-in + AI Polish",
  "settings.engineHint": "Built-in uses local ONNX models offline. AI Polish sends results to an external LLM for error correction and formatting.",
  "history.all": "All",
  "recog.tabImage": "Image",
  "recog.tabHandwrite": "Draw",
  "history.sourceFile": "File",
  "history.sourceCamera": "Camera",
  "history.sourceHandwrite": "Handwrite",
  "history.sourcePDF": "PDF",
  "history.clear": "Clear"
}
