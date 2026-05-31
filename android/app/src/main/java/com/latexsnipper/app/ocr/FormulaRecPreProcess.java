package com.latexsnipper.app.ocr;

import android.graphics.Bitmap;

/**
 * FormulaRecPreProcess — image preprocessing for TrOCR formula recognition.
 * <p>
 * Pipeline: resize short side to 384 (preserving aspect ratio) → center crop 384×384
 * → normalize to [-1, 1]. This matches HuggingFace ViTImageProcessor behavior
 * (resize to shortest side 384 then center crop).
 */
public class FormulaRecPreProcess {

    public static final int IMG_SIZE = 384;

    /**
     * Preprocess a Bitmap for the TrOCR encoder.
     * Preserves aspect ratio: resize so short side = 384, then center crop 384×384.
     *
     * @param bitmap Input bitmap (any size).
     * @return float array [3][384][384] in CHW layout, values in [-1, 1].
     */
    public static float[] run(Bitmap bitmap) {
        int iw = bitmap.getWidth();
        int ih = bitmap.getHeight();

        // Resize so the shortest side = IMG_SIZE, preserving aspect ratio
        float scale = (float) IMG_SIZE / Math.min(iw, ih);
        int newW = Math.round(iw * scale);
        int newH = Math.round(ih * scale);

        Bitmap resized = Bitmap.createScaledBitmap(bitmap, newW, newH, true);
        if (resized == bitmap) {
            resized = bitmap.copy(Bitmap.Config.ARGB_8888, false);
        }

        // Center crop to IMG_SIZE x IMG_SIZE
        int cropX = Math.max(0, (newW - IMG_SIZE) / 2);
        int cropY = Math.max(0, (newH - IMG_SIZE) / 2);
        int cw = Math.min(IMG_SIZE, newW - cropX);
        int ch = Math.min(IMG_SIZE, newH - cropY);

        Bitmap cropped;
        if (cw == IMG_SIZE && ch == IMG_SIZE) {
            cropped = Bitmap.createBitmap(resized, cropX, cropY, IMG_SIZE, IMG_SIZE);
        } else {
            // Edge case: image too small, pad to 384x384 with white
            cropped = Bitmap.createBitmap(IMG_SIZE, IMG_SIZE, Bitmap.Config.ARGB_8888);
            android.graphics.Canvas cv = new android.graphics.Canvas(cropped);
            cv.drawColor(android.graphics.Color.WHITE);
            cv.drawBitmap(resized, (IMG_SIZE - newW) / 2f, (IMG_SIZE - newH) / 2f, null);
        }
        if (resized != bitmap) resized.recycle();

        int[] argb = new int[IMG_SIZE * IMG_SIZE];
        cropped.getPixels(argb, 0, IMG_SIZE, 0, 0, IMG_SIZE, IMG_SIZE);
        cropped.recycle();

        final int n = IMG_SIZE * IMG_SIZE;
        float[] data = new float[3 * n];
        final float scl = 2.0f / 255.0f;

        for (int i = 0; i < n; i++) {
            int pixel = argb[i];
            float r = ((pixel >> 16) & 0xFF) * scl - 1.0f;
            float g = ((pixel >> 8)  & 0xFF) * scl - 1.0f;
            float b = (pixel         & 0xFF) * scl - 1.0f;
            data[i]       = r;
            data[n + i]   = g;
            data[2 * n + i] = b;
        }

        return data;
    }
}
