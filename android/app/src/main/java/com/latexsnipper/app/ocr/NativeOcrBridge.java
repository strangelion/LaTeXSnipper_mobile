package com.latexsnipper.app.ocr;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Matrix;
import android.util.Base64;
import android.util.Log;
import android.webkit.JavascriptInterface;

import java.io.ByteArrayInputStream;
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

    @JavascriptInterface
    public boolean isReady() {
        return ocrEngine.isReady();
    }

    @JavascriptInterface
    public String loadModels() {
        if (ocrEngine.isReady()) return "ok";
        if (loadingStarted) return "loading";
        loadingStarted = true;

        new Thread(() -> {
            try {
                ocrEngine.loadAllModelsSync(context);
                Log.d(TAG, "All models loaded");
            } catch (Exception e) {
                Log.e(TAG, "loadModels failed", e);
            }
        }, "model-loader").start();
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
        executor.submit(() -> {
            try {
                boolean[] exifApplied = new boolean[1];
                long t0 = System.currentTimeMillis();
                Bitmap bitmap = decodeImageWithOrientation(base64Image, exifApplied);
                Log.d(TAG, type + " decode=" + (System.currentTimeMillis()-t0) + "ms "
                    + bitmap.getWidth() + "x" + bitmap.getHeight()
                    + " exif=" + exifApplied[0]);

                // Only run ONNX auto-orient if EXIF didn't already correct the image
                if (!exifApplied[0]) {
                    Bitmap oriented = ocrEngine.autoOrient(bitmap);
                    if (oriented != bitmap) {
                        bitmap.recycle();
                        bitmap = oriented;
                    }
                }

                t0 = System.currentTimeMillis();
                String result = rec.run(bitmap);
                bitmap.recycle();
                Log.d(TAG, type + " done in " + (System.currentTimeMillis()-t0) + "ms");
                pendingResult = result;
                pendingKey = key;
            } catch (Exception e) {
                Log.e(TAG, type + " FAILED (key=" + logKey + ")", e);
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
            OcrEngine.MixedResult mixed = ocrEngine.recognizeMixed(bitmap);
            StringBuilder sb = new StringBuilder("{\"done\":true,\"regions\":[");
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
            sb.append("],\"timeMs\":").append(mixed.timeMs)
              .append(",\"formattedText\":\"").append(escapeJson(mixed.formattedText))
              .append("}");
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
    public void release() {
        ocrEngine.release();
    }

    // ── Image decoding with EXIF auto-rotation ──

    private Bitmap decodeImageWithOrientation(String dataUri, boolean[] exifApplied) {
        String base64 = dataUri.contains(",")
            ? dataUri.substring(dataUri.indexOf(',') + 1)
            : dataUri;
        byte[] decoded = Base64.decode(base64, Base64.DEFAULT);

        // Read EXIF orientation from JPEG bytes
        int orientation = 1;
        try {
            orientation = readExifOrientation(decoded);
        } catch (Exception e) {
            /* non-JPEG or no EXIF */
        }

        Bitmap bm = BitmapFactory.decodeByteArray(decoded, 0, decoded.length);
        if (bm == null) throw new IllegalArgumentException("Failed to decode image");

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
