package com.latexsnipper.app.ocr;

import android.content.ContentValues;
import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Matrix;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;
import android.util.Log;
import android.webkit.JavascriptInterface;

import java.io.ByteArrayInputStream;
import java.io.OutputStream;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;

/**
 * NativeOcrBridge — exposes OCR engine to JavaScript via Android's @JavascriptInterface.
 * <p>
 * Heavy inference runs on a background thread pool. The JS side calls the method and
 * immediately returns a "pending" token, then polls getResult() for completion.
 * This prevents WebView thread blocking.
 */
public class NativeOcrBridge {

    private static final String TAG = "NativeOcrBridge";
    private static final long RECOGNITION_TIMEOUT_MS = 30000;

    private final OcrEngine ocrEngine;
    private final ExecutorService executor = Executors.newFixedThreadPool(1);
    private Context context;

    // Async result store
    private volatile String pendingResult = null;
    private volatile String pendingKey = null;
    private int callCounter = 0;

    public NativeOcrBridge(Context ctx) {
        this.context = ctx;
        this.ocrEngine = new OcrEngine();
    }

    public OcrEngine getEngine() { return ocrEngine; }

    private volatile boolean loadingStarted = false;

    // Accumulated logs for JS export
    private final StringBuilder logBuffer = new StringBuilder();
    private static final int MAX_LOG_BUFFER = 50000;

    private synchronized void addLog(String tag, String msg) {
        String line = System.currentTimeMillis() + "  [" + tag + "] " + msg;
        if (logBuffer.length() + line.length() > MAX_LOG_BUFFER) {
            logBuffer.delete(0, logBuffer.length() / 4);
        }
        logBuffer.append(line).append("\n");
    }

    /** JS calls this to push a log line from the JavaScript side into the native buffer */
    @JavascriptInterface
    public void addLog(String msg) {
        addLog("JS", msg);
    }

    /** JS calls this to retrieve accumulated native logs for export */
    @JavascriptInterface
    public String getLogs() {
        String logs;
        synchronized (this) {
            logs = logBuffer.toString();
            logBuffer.setLength(0);
        }
        // Also append OcrEngine file log
        try {
            java.io.File logFile = new java.io.File(context.getFilesDir(), "ocr-debug.log");
            if (logFile.exists()) {
                java.io.BufferedReader br = new java.io.BufferedReader(new java.io.FileReader(logFile));
                StringBuilder sb = new StringBuilder();
                String line;
                while ((line = br.readLine()) != null) sb.append(line).append("\n");
                br.close();
                if (sb.length() > 0) logs += "\n\n=== OcrEngine Debug Log ===\n" + sb.toString();
                logFile.delete(); // Clear after reading
            }
        } catch (Exception e) { /* ignore */ }
        return logs;
    }

    @JavascriptInterface
    public boolean isReady() {
        return ocrEngine.isReady();
    }

    @JavascriptInterface
    public String getModelStatus() {
        try {
            org.json.JSONObject status = new org.json.JSONObject();
            status.put("formulaDet", ocrEngine.getRunner().isFormulaDetReady());
            status.put("formulaRec", ocrEngine.getRunner().isFormulaRecReady());
            status.put("textDet", ocrEngine.getRunner().isTextDetReady());
            status.put("textRec", ocrEngine.getRunner().isTextRecReady());
            status.put("docOri", ocrEngine.getRunner().isDocOriReady());
            return status.toString();
        } catch (Exception e) {
            return "{}";
        }
    }

    @JavascriptInterface
    public String loadModels() {
        if (ocrEngine.isReady()) return "ok";
        if (loadingStarted) return "loading";
        loadingStarted = true;

        new Thread(() -> {
            try {
                addLog("MODEL", "Loading models synchronously...");
                ocrEngine.loadAllModelsSync(context);
                addLog("MODEL", "All models loaded successfully");
                Log.d(TAG, "All models loaded");
            } catch (Exception e) {
                addLog("MODEL", "FAILED: " + e.getMessage());
                Log.e(TAG, "loadModels failed", e);
            }
        }, "model-loader").start();
        return "loading";
    }

    @JavascriptInterface
    public String reloadModels() {
        loadingStarted = true;
        new Thread(() -> {
            try {
                addLog("MODEL", "Reloading models...");
                ocrEngine.reloadModels(context);
                addLog("MODEL", "Models reloaded");
                Log.d(TAG, "Models reloaded");
            } catch (Exception e) {
                addLog("MODEL", "Reload FAILED: " + e.getMessage());
                Log.e(TAG, "reloadModels failed", e);
            }
        }, "model-reloader").start();
        return "loading";
    }

    @JavascriptInterface
    public String getStatus() {
        if (ocrEngine.isReady()) return "ready";
        if (loadingStarted) return "loading";
        return "idle";
    }

    // ═══ Async recognition helpers ═══

    private interface Recognizer {
        String run(Bitmap bitmap) throws Exception;
    }

    private String launchAsync(String type, String base64Image, Recognizer rec) {
        String key = type + "_" + (callCounter++);
        final String logKey = key;
        Log.d(TAG, "Starting " + type + " (key=" + logKey + ")");
        addLog("OCR", "Starting " + type + " recognition");
        executor.submit(() -> {
            try {
                boolean[] exifApplied = new boolean[1];
                long t0 = System.currentTimeMillis();
                Bitmap bitmap = decodeImageWithOrientation(base64Image, exifApplied);
                addLog("OCR", type + " decode " + (System.currentTimeMillis()-t0) + "ms "
                    + bitmap.getWidth() + "x" + bitmap.getHeight());

                // Skip auto-orient: camera crop already handles rotation correctly.
                // Doc-orient model is unreliable for cropped regions and can rotate
                // correctly-oriented images to wrong orientation (e.g. landscape→portrait).
                if (exifApplied[0]) {
                    addLog("OCR", "EXIF already oriented: " + bitmap.getWidth() + "x" + bitmap.getHeight());
                }

                addLog("OCR", type + " starting inference, bitmap=" + bitmap.getWidth() + "x" + bitmap.getHeight());
                t0 = System.currentTimeMillis();
                String result = rec.run(bitmap);
                bitmap.recycle();
                long elapsed = System.currentTimeMillis()-t0;
                addLog("OCR", type + " done " + elapsed + "ms, result length=" + (result != null ? result.length() : 0));
                // Log first 200 chars of result for debugging
                if (result != null && result.length() > 0) {
                    addLog("OCR", type + " result preview: " + result.substring(0, Math.min(200, result.length())));
                }
                pendingResult = result;
                pendingKey = key;
            } catch (Exception e) {
                Log.e(TAG, type + " FAILED (key=" + logKey + ")", e);
                addLog("OCR", type + " FAILED: " + e.getClass().getSimpleName() + ": " + e.getMessage());
                pendingResult = "{\"error\":\"" + escapeJson(e.getMessage()) + "\"}";
                pendingKey = key;
            }
        });
        return key;
    }

    @JavascriptInterface
    public String recognizeFormula(String base64Image) {
        return launchAsync("formula", base64Image, (bitmap) -> {
            OcrEngine.RecognizeResult result = ocrEngine.recognizeFormula(bitmap);
            return "{\"done\":true,\"latex\":\"" + escapeJson(result.text)
                + "\",\"confidence\":" + result.confidence
                + ",\"timeMs\":" + result.timeMs + "}";
        });
    }

    @JavascriptInterface
    public String recognizeText(String base64Image) {
        return launchAsync("text", base64Image, (bitmap) -> {
            OcrEngine.RecognizeResult result = ocrEngine.recognizeText(bitmap);
            return "{\"done\":true,\"text\":\"" + escapeJson(result.text)
                + "\",\"confidence\":" + result.confidence
                + ",\"timeMs\":" + result.timeMs + "}";
        });
    }

    @JavascriptInterface
    public String recognizeMixed(String base64Image) {
        return launchAsync("mixed", base64Image, (bitmap) -> {
            addLog("OCR", "mixed: calling ocrEngine.recognizeMixed, bitmap=" + bitmap.getWidth() + "x" + bitmap.getHeight());
            OcrEngine.MixedResult mixed = ocrEngine.recognizeMixed(bitmap);
            addLog("OCR", "mixed: regions=" + mixed.regions.size() + " confidence=" + mixed.confidence + " timeMs=" + mixed.timeMs);
            for (int i = 0; i < mixed.regions.size(); i++) {
                OcrEngine.MixedResult.RegionResult r = mixed.regions.get(i);
                addLog("OCR", "mixed region[" + i + "]: type=" + r.type + " text=" + (r.text != null ? r.text.substring(0, Math.min(50, r.text.length())) : "null") + " conf=" + r.confidence);
            }
            StringBuilder sb = new StringBuilder("{\"done\":true,\"text\":\"");
            sb.append(escapeJson(mixed.formattedText != null ? mixed.formattedText : ""));
            sb.append("\",\"regions\":[");
            for (int i = 0; i < mixed.regions.size(); i++) {
                if (i > 0) sb.append(",");
                OcrEngine.MixedResult.RegionResult r = mixed.regions.get(i);
                sb.append("{\"x\":").append(r.x)
                  .append(",\"y\":").append(r.y)
                  .append(",\"w\":").append(r.w)
                  .append(",\"h\":").append(r.h)
                  .append(",\"type\":\"").append(r.type)
                  .append("\",\"text\":\"").append(escapeJson(r.text))
                  .append("\",\"confidence\":").append(r.confidence)
                  .append("}");
            }
            sb.append("],\"confidence\":").append(mixed.confidence)
              .append(",\"timeMs\":").append(mixed.timeMs).append("}");
            return sb.toString();
        });
    }

    /**
     * JS polls this to get the result. Returns null/empty if not ready yet.
     * JS should wait until result starts with the expected key prefix.
     */
    @JavascriptInterface
    public String getResult(String key) {
        if (pendingKey == null || !pendingKey.startsWith(key)) return "";
        String r = pendingResult;
        pendingKey = null;
        pendingResult = null;
        return r != null ? r : "";
    }

    @JavascriptInterface
    public String saveSettings(String json) {
        try {
            context.getSharedPreferences("LaTeXSnipperSettings", Context.MODE_PRIVATE)
                .edit().putString("settings_json", json).apply();
            return "ok";
        } catch (Exception e) {
            return "error:" + e.getMessage();
        }
    }

    @JavascriptInterface
    public String loadSettings() {
        try {
            return context.getSharedPreferences("LaTeXSnipperSettings", Context.MODE_PRIVATE)
                .getString("settings_json", "{}");
        } catch (Exception e) {
            return "{}";
        }
    }

    @JavascriptInterface
    public void setAcceleration(String mode) {
        ocrEngine.getRunner().setAccelerationMode(mode);
    }

    @JavascriptInterface
    public String getModelsDir() {
        return context.getFilesDir() + "/models";
    }

    @JavascriptInterface
    public String getInstalledModels() {
        ModelManager mm = new ModelManager(context);
        org.json.JSONObject result = new org.json.JSONObject();
        try {
            String[] categories = {"formula-det", "formula-rec", "text-det", "text-rec", "doc-ori"};
            for (String cat : categories) {
                result.put(cat, new org.json.JSONArray(mm.listInstalled(cat)));
            }
        } catch (Exception e) {
            return "{}";
        }
        return result.toString();
    }

    @JavascriptInterface
    public String getActiveModels() {
        ModelManager mm = new ModelManager(context);
        org.json.JSONObject result = new org.json.JSONObject();
        try {
            String[] categories = {"formula-det", "formula-rec", "text-det", "text-rec", "doc-ori"};
            for (String cat : categories) {
                String active = mm.getActiveVariant(cat);
                if (active != null) result.put(cat, active);
            }
        } catch (Exception e) {
            return "{}";
        }
        return result.toString();
    }

    @JavascriptInterface
    public String setActiveModel(String category, String variantId) {
        ModelManager mm = new ModelManager(context);
        mm.setActiveVariant(category, variantId);
        return "ok";
    }

    @JavascriptInterface
    public String deleteModel(String category, String variantId) {
        ModelManager mm = new ModelManager(context);
        boolean ok = mm.deleteVariant(category, variantId);
        return ok ? "ok" : "error:delete failed";
    }

    @JavascriptInterface
    public void release() {
        ocrEngine.release();
    }

    // ── Chunked model file writing (avoids OOM for large files) ──

    private java.io.FileOutputStream modelWriteStream = null;

    /**
     * Start writing a model file. Creates parent directories and opens output stream.
     * Call writeModelChunk() repeatedly, then finishModelWrite().
     */
    @JavascriptInterface
    public String startModelWrite(String category, String variantId, String filename) {
        try {
            java.io.File dir = new java.io.File(context.getFilesDir(),
                "models/" + category + "/" + variantId);
            dir.mkdirs();
            java.io.File file = new java.io.File(dir, filename);
            modelWriteStream = new java.io.FileOutputStream(file);
            return "ok";
        } catch (Exception e) {
            Log.e(TAG, "startModelWrite failed: " + e.getMessage());
            return "error:" + e.getMessage();
        }
    }

    /**
     * Write a base64-encoded chunk to the current model file.
     */
    @JavascriptInterface
    public String writeModelChunk(String base64Chunk) {
        if (modelWriteStream == null) return "error:no stream";
        try {
            byte[] data = android.util.Base64.decode(base64Chunk, android.util.Base64.NO_WRAP);
            modelWriteStream.write(data);
            return "ok";
        } catch (Exception e) {
            Log.e(TAG, "writeModelChunk failed: " + e.getMessage());
            return "error:" + e.getMessage();
        }
    }

    /**
     * Finish writing the current model file. Closes the output stream.
     */
    @JavascriptInterface
    public String finishModelWrite() {
        try {
            if (modelWriteStream != null) {
                modelWriteStream.flush();
                modelWriteStream.close();
                modelWriteStream = null;
            }
            return "ok";
        } catch (Exception e) {
            Log.e(TAG, "finishModelWrite failed: " + e.getMessage());
            return "error:" + e.getMessage();
        }
    }

    // ── Save file to Downloads (via MediaStore, lets user choose location) ──

    /**
     * Save a base64-encoded file to the Android Downloads folder.
     * On Android 10+ (Q), uses MediaStore.Downloads to write via ContentResolver.
     * The file appears in the Downloads app / Files app, where the user can
     * open, share, or move it. No "no apps can perform this action" error.
     *
     * JS calls: NativeOcr.saveFile(base64data, filename)
     * where base64data is the raw base64 string (no data: URI prefix).
     *
     * Returns "ok" on success, or an error message string.
     */
    @JavascriptInterface
    public String saveFile(String base64Data, String filename) {
        try {
            byte[] decoded = Base64.decode(base64Data, Base64.DEFAULT);
            String mimeType = guessMimeType(filename);

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                // Android 10+: use MediaStore
                ContentValues values = new ContentValues();
                values.put(MediaStore.Downloads.DISPLAY_NAME, filename);
                values.put(MediaStore.Downloads.MIME_TYPE, mimeType);
                values.put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS);
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                    values.put(MediaStore.Downloads.IS_PENDING, 1);
                }

                android.net.Uri uri = context.getContentResolver().insert(
                    MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
                if (uri == null)
                    return "error: ContentResolver insert returned null";

                try (OutputStream os = context.getContentResolver().openOutputStream(uri)) {
                    if (os == null) return "error: openOutputStream null";
                    os.write(decoded);
                    os.flush();
                }

                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                    values.clear();
                    values.put(MediaStore.Downloads.IS_PENDING, 0);
                    context.getContentResolver().update(uri, values, null, null);
                }

                addLog("SAVE", "Saved: " + filename + " (" + decoded.length + " bytes)");
                return "ok";
            } else {
                // Android 9 and below: write to external storage Downloads
                java.io.File downloadsDir = Environment.getExternalStoragePublicDirectory(
                    Environment.DIRECTORY_DOWNLOADS);
                if (!downloadsDir.exists()) downloadsDir.mkdirs();
                java.io.File outFile = new java.io.File(downloadsDir, filename);
                java.io.FileOutputStream fos = new java.io.FileOutputStream(outFile);
                fos.write(decoded);
                fos.close();
                addLog("SAVE", "Saved (legacy): " + outFile.getAbsolutePath());
                return "ok";
            }
        } catch (Exception e) {
            Log.e(TAG, "saveFile failed", e);
            return "error: " + e.getMessage();
        }
    }

    private String guessMimeType(String filename) {
        String lower = filename.toLowerCase();
        if (lower.endsWith(".png")) return "image/png";
        if (lower.endsWith(".svg")) return "image/svg+xml";
        if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
        if (lower.endsWith(".txt")) return "text/plain";
        if (lower.endsWith(".zip")) return "application/zip";
        if (lower.endsWith(".json")) return "application/json";
        if (lower.endsWith(".onnx")) return "application/octet-stream";
        return "application/octet-stream";
    }

    // ── Image decoding with EXIF auto-rotation ──

    private Bitmap decodeImageWithOrientation(String dataUri, boolean[] exifApplied) {
        String base64 = dataUri.contains(",")
            ? dataUri.substring(dataUri.indexOf(',') + 1)
            : dataUri;
        addLog("OCR", "decodeImage: base64 length=" + base64.length() + " chars, dataUri length=" + dataUri.length());
        byte[] decoded = Base64.decode(base64, Base64.DEFAULT);
        addLog("OCR", "decodeImage: decoded bytes=" + decoded.length + " (" + (decoded.length / 1024) + " KB)");

        // Read EXIF orientation from JPEG bytes
        int orientation = 1;
        try {
            orientation = readExifOrientation(decoded);
        } catch (Exception e) {
            /* non-JPEG or no EXIF */
        }

        Bitmap bm = BitmapFactory.decodeByteArray(decoded, 0, decoded.length);
        if (bm == null) throw new IllegalArgumentException("Failed to decode image");
        addLog("OCR", "decodeImage: Bitmap " + bm.getWidth() + "x" + bm.getHeight() + " (" + (bm.getByteCount() / 1024) + " KB)");

        // Auto-rotate based on EXIF
        if (orientation != 1) {
            Matrix matrix = new Matrix();
            switch (orientation) {
                case 3:  matrix.postRotate(180); break;
                case 6:  matrix.postRotate(90); break;
                case 8:  matrix.postRotate(270); break;
                case 2:  matrix.preScale(-1, 1); break;
                case 4:  matrix.preScale(1, -1); break;
                case 5:  matrix.postRotate(90); matrix.preScale(-1, 1); break;
                case 7:  matrix.postRotate(270); matrix.preScale(-1, 1); break;
            }
            Bitmap rotated = Bitmap.createBitmap(bm, 0, 0, bm.getWidth(), bm.getHeight(), matrix, true);
            if (rotated != bm) {
                bm.recycle();
                bm = rotated;
            }
            Log.d(TAG, "EXIF auto-rotate: orientation=" + orientation);
            if (exifApplied != null) exifApplied[0] = true;
        }

        return bm;
    }

    /** Parse EXIF orientation tag from JPEG bytes (APP1 marker). */
    private int readExifOrientation(byte[] jpeg) throws Exception {
        if (jpeg.length < 4 || (jpeg[0] & 0xFF) != 0xFF || (jpeg[1] & 0xFF) != 0xD8)
            return 1; // Not JPEG

        int offset = 2;
        int length = jpeg.length;
        while (offset + 8 < length) {
            int marker = (jpeg[offset] & 0xFF) << 8 | (jpeg[offset + 1] & 0xFF);
            int segLen = (jpeg[offset + 2] & 0xFF) << 8 | (jpeg[offset + 3] & 0xFF);
            if (marker == 0xFFE1) { // APP1 = EXIF
                // Check "Exif\0\0"
                if (offset + 10 < length
                    && jpeg[offset + 4] == 'E' && jpeg[offset + 5] == 'x'
                    && jpeg[offset + 6] == 'i' && jpeg[offset + 7] == 'f')
                {
                    return parseExifOrientation(jpeg, offset + 8, offset + 2 + segLen);
                }
            }
            if (segLen < 2) break;
            offset += 2 + segLen;
            if (marker == 0xFFDA) break; // SOS - no more metadata
        }
        return 1;
    }

    private int parseExifOrientation(byte[] data, int tiffStart, int end) {
        if (tiffStart + 8 > end) return 1;
        boolean littleEndian = (data[tiffStart] == 'I' && data[tiffStart + 1] == 'I');
        int ifdOffset = readInt(data, tiffStart + 4, littleEndian, 4) + tiffStart;
        if (ifdOffset < tiffStart + 8 || ifdOffset + 2 > end) return 1;

        int entries = readInt(data, ifdOffset, littleEndian, 2);
        int ifdPtr = ifdOffset + 2;

        for (int i = 0; i < entries && ifdPtr + 12 <= end; i++) {
            int tag = readInt(data, ifdPtr, littleEndian, 2);
            int type = readInt(data, ifdPtr + 2, littleEndian, 2);
            int count = readInt(data, ifdPtr + 4, littleEndian, 4);
            if (tag == 0x0112 && type == 3 && count == 1) {
                return readInt(data, ifdPtr + 8, littleEndian, 2);
            }
            ifdPtr += 12;
        }
        return 1;
    }

    private int readInt(byte[] data, int offset, boolean littleEndian, int numBytes) {
        int val = 0;
        for (int i = 0; i < numBytes; i++) {
            int b = (offset + i < data.length) ? (data[offset + i] & 0xFF) : 0;
            if (littleEndian) {
                val |= b << (i * 8);
            } else {
                val = (val << 8) | b;
            }
        }
        return val;
    }

    private static String escapeJson(String s) {
        if (s == null) return "";
        StringBuilder sb = new StringBuilder(s.length() + 16);
        for (int i = 0; i < s.length(); i++) {
            int cp = s.codePointAt(i);
            if (cp > 0xFFFF) { i++; } // skip low surrogate for supplementary chars
            switch (cp) {
                case '\\': sb.append("\\\\"); break;
                case '"':  sb.append("\\\""); break;
                case '\n': sb.append("\\n"); break;
                case '\r': sb.append("\\r"); break;
                case '\t': sb.append("\\t"); break;
                case '\b': sb.append("\\b"); break;
                case '\f': sb.append("\\f"); break;
                default:
                    if (cp < 0x20) {
                        sb.append(String.format("\\u%04x", cp));
                    } else {
                        sb.appendCodePoint(cp);
                    }
            }
        }
        return sb.toString();
    }
}
