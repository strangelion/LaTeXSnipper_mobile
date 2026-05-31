package com.latexsnipper.app.ocr;

import android.graphics.Bitmap;

/**
 * TextRecPreProcess — preprocessing for PP-OCRv5 CRNN text recognition.
 * <p>
 * Matches text-recognition.js :: preprocessText():
 * <ul>
 *   <li>Resize height to 48, width = min(ceil(48 * aspect), 320)</li>
 *   <li>Pad with black (zeros) to [3, 48, 320]</li>
 *   <li>BGR channel order (PaddlePaddle/OpenCV convention)</li>
 *   <li>Normalize: (pixel/255 - 0.5) / 0.5 → [-1, 1]</li>
 * </ul>
 */
public class TextRecPreProcess {

    public static final int TARGET_H = 48;
    public static final int MAX_W = 320;

    /**
     * Preprocess a Bitmap for CRNN text recognition.
     *
     * @param bitmap Input bitmap (cropped text line).
     * @return float array [3][48][320] in CHW layout, BGR order.
     */
    public static float[] run(Bitmap bitmap) {
        int iw = bitmap.getWidth();
        int ih = bitmap.getHeight();

        float ratio = (float) iw / ih;
        int targetW = (int) Math.ceil(TARGET_H * ratio);
        if (targetW > MAX_W) targetW = MAX_W;
        if (targetW < 4) targetW = 4;

        Bitmap resized = Bitmap.createScaledBitmap(bitmap, targetW, TARGET_H, true);
        Bitmap canvas = Bitmap.createBitmap(MAX_W, TARGET_H, Bitmap.Config.ARGB_8888);

        // Black background (matches np.zeros padding)
        android.graphics.Canvas cv = new android.graphics.Canvas(canvas);
        cv.drawColor(android.graphics.Color.BLACK);
        cv.drawBitmap(resized, 0, 0, null);
        if (resized != bitmap) resized.recycle();

        int[] argb = new int[MAX_W * TARGET_H];
        canvas.getPixels(argb, 0, MAX_W, 0, 0, MAX_W, TARGET_H);
        canvas.recycle();

        int n = MAX_W * TARGET_H;
        float[] data = new float[3 * n];

        for (int i = 0; i < n; i++) {
            int pixel = argb[i];
            // BGR channel order (PaddlePaddle/OpenCV convention)
            float b = (((pixel)        & 0xFF) / 255.0f - 0.5f) / 0.5f;
            float g = (((pixel >> 8)   & 0xFF) / 255.0f - 0.5f) / 0.5f;
            float r = (((pixel >> 16)  & 0xFF) / 255.0f - 0.5f) / 0.5f;

            data[i]       = b;  // B channel first
            data[n + i]   = g;  // G channel
            data[2 * n + i] = r; // R channel last
        }

        return data;
    }
}
