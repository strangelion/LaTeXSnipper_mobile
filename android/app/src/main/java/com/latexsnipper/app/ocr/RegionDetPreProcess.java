package com.latexsnipper.app.ocr;

import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Paint;

/**
 * RegionDetPreProcess — 64×64 patch extraction with ImageNet normalization.
 * <p>
 * Matches region-detect.js :: preprocessPatch().
 */
public class RegionDetPreProcess {

    public static final int PATCH_SIZE = 64;

    // ImageNet normalization stats
    private static final float[] MEAN = {0.485f, 0.456f, 0.406f};
    private static final float[] STD  = {0.229f, 0.224f, 0.225f};

    /**
     * Extract and normalize a 64x64 patch from a canvas at position (sx, sy).
     *
     * @param canvas Source canvas (assumed to be at least 64×64).
     * @param sx     Source x offset.
     * @param sy     Source y offset.
     * @return float[3*64*64] in CHW layout, ImageNet normalized.
     */
    public static float[] extractPatch(Bitmap canvas, int sx, int sy) {
        Bitmap patch = Bitmap.createBitmap(canvas, sx, sy, PATCH_SIZE, PATCH_SIZE);

        int[] argb = new int[PATCH_SIZE * PATCH_SIZE];
        patch.getPixels(argb, 0, PATCH_SIZE, 0, 0, PATCH_SIZE, PATCH_SIZE);
        patch.recycle();

        int n = PATCH_SIZE * PATCH_SIZE;
        float[] data = new float[3 * n];

        for (int i = 0; i < n; i++) {
            int pixel = argb[i];
            float r = ((pixel >> 16) & 0xFF) / 255.0f;
            float g = ((pixel >> 8)  & 0xFF) / 255.0f;
            float b = (pixel         & 0xFF) / 255.0f;

            data[i]       = (r - MEAN[0]) / STD[0];
            data[n + i]   = (g - MEAN[1]) / STD[1];
            data[2 * n + i] = (b - MEAN[2]) / STD[2];
        }

        return data;
    }

    /**
     * Create a 64×64 patch (with padding if needed) and normalize.
     *
     * @param bitmap Source bitmap of any size.
     * @return float[3*64*64] in CHW layout.
     */
    public static float[] createPatch(Bitmap bitmap) {
        int w = bitmap.getWidth();
        int h = bitmap.getHeight();

        Bitmap patch;
        if (w == PATCH_SIZE && h == PATCH_SIZE) {
            patch = bitmap.copy(Bitmap.Config.ARGB_8888, false);
        } else {
            // Scale to fit within 64x64 (maintaining aspect)
            float scale = Math.min((float) PATCH_SIZE / w, (float) PATCH_SIZE / h);
            int scaledW = Math.round(w * scale);
            int scaledH = Math.round(h * scale);

            Bitmap scaled = Bitmap.createScaledBitmap(bitmap, scaledW, scaledH, true);

            // Center on white background
            patch = Bitmap.createBitmap(PATCH_SIZE, PATCH_SIZE, Bitmap.Config.ARGB_8888);
            Canvas cv = new Canvas(patch);
            cv.drawColor(android.graphics.Color.WHITE);
            int dx = (PATCH_SIZE - scaledW) / 2;
            int dy = (PATCH_SIZE - scaledH) / 2;
            cv.drawBitmap(scaled, dx, dy, null);
            scaled.recycle();
        }

        int[] argb = new int[PATCH_SIZE * PATCH_SIZE];
        patch.getPixels(argb, 0, PATCH_SIZE, 0, 0, PATCH_SIZE, PATCH_SIZE);
        patch.recycle();

        int n = PATCH_SIZE * PATCH_SIZE;
        float[] data = new float[3 * n];
        for (int i = 0; i < n; i++) {
            int pixel = argb[i];
            float r = ((pixel >> 16) & 0xFF) / 255.0f;
            float g = ((pixel >> 8)  & 0xFF) / 255.0f;
            float b = (pixel         & 0xFF) / 255.0f;
            data[i]       = (r - MEAN[0]) / STD[0];
            data[n + i]   = (g - MEAN[1]) / STD[1];
            data[2 * n + i] = (b - MEAN[2]) / STD[2];
        }

        return data;
    }
}
