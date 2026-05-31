package com.latexsnipper.app.ocr;

import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;

/**
 * ImagePreProcess — contrast enhancement, binarization, handwriting detection.
 * <p>
 * Matches image-preprocess.js: enhanceHandwriting() + binarize() + preprocessForOCR() + looksLikeHandwriting().
 * <p>
 * Uses CLAHE (Contrast-Limited Adaptive Histogram Equalization) and Otsu thresholding.
 */
public class ImagePreProcess {

    /**
     * Check if image looks like handwriting.
     * Matches looksLikeHandwriting(): light bg, very few dark pixels, avg intensity high.
     */
    public static boolean looksLikeHandwriting(Bitmap bitmap) {
        int size = Math.min(128, Math.min(bitmap.getWidth(), bitmap.getHeight()));
        Bitmap thumb = Bitmap.createScaledBitmap(bitmap, size, size, true);

        int[] argb = new int[size * size];
        thumb.getPixels(argb, 0, size, 0, 0, size, size);
        if (thumb != bitmap) thumb.recycle();

        int n = size * size;
        int darkCount = 0;
        float totalIntensity = 0;

        for (int i = 0; i < n; i++) {
            int pixel = argb[i];
            float r = (pixel >> 16) & 0xFF;
            float g = (pixel >> 8) & 0xFF;
            float b = pixel & 0xFF;
            float v = r * 0.299f + g * 0.587f + b * 0.114f;
            totalIntensity += v;
            if (v < 128) darkCount++;
        }

        float avgIntensity = totalIntensity / n;
        float darkRatio = (float) darkCount / n;

        return avgIntensity > 200 && darkRatio > 0.002f && darkRatio < 0.15f;
    }

    /**
     * Enhance contrast for handwriting using CLAHE.
     * Matches enhanceHandwriting().
     */
    public static Bitmap enhanceHandwriting(Bitmap source) {
        int w = source.getWidth();
        int h = source.getHeight();
        int[] argb = new int[w * h];
        source.getPixels(argb, 0, w, 0, 0, w, h);

        float[] gray = toGrayFloats(argb);
        float[] enhanced = clahe(gray, w, h, 16, 3.0f);

        return buildBitmapFromGray(enhanced, w, h);
    }

    /**
     * Binarize using Otsu thresholding. Matches binarize().
     */
    public static Bitmap binarize(Bitmap source) {
        int w = source.getWidth();
        int h = source.getHeight();
        int[] argb = new int[w * h];
        source.getPixels(argb, 0, w, 0, 0, w, h);

        float[] gray = toGrayFloats(argb);
        int threshold = otsuThreshold(gray);
        return buildBitmapFromThreshold(gray, threshold, w, h);
    }

    /**
     * Full OCR preprocessing: CLAHE + Otsu. Matches preprocessForOCR().
     */
    public static Bitmap preprocessForOCR(Bitmap source) {
        int w = source.getWidth();
        int h = source.getHeight();
        int[] argb = new int[w * h];
        source.getPixels(argb, 0, w, 0, 0, w, h);

        float[] gray = toGrayFloats(argb);
        float[] enhanced = clahe(gray, w, h, 32, 2.5f);
        int threshold = otsuThreshold(enhanced);

        return buildBitmapFromThreshold(enhanced, threshold, w, h);
    }

    // ── Grayscale conversion ──

    private static float[] toGrayFloats(int[] argb) {
        float[] gray = new float[argb.length];
        for (int i = 0; i < argb.length; i++) {
            int p = argb[i];
            gray[i] = ((p >> 16) & 0xFF) * 0.299f
                    + ((p >> 8)  & 0xFF) * 0.587f
                    + (p         & 0xFF) * 0.114f;
        }
        return gray;
    }

    // ── Otsu threshold ──

    private static int otsuThreshold(float[] gray) {
        int[] hist = new int[256];
        int n = gray.length;
        for (float v : gray) hist[Math.round(v)]++;

        float sum = 0;
        for (int i = 0; i < 256; i++) sum += i * hist[i];

        float wB = 0, sumB = 0;
        float maxVariance = 0;
        int threshold = 128;

        for (int t = 0; t < 256; t++) {
            wB += hist[t];
            if (wB == 0) continue;
            float wF = n - wB;
            if (wF == 0) break;
            sumB += t * hist[t];
            float mB = sumB / wB;
            float mF = (sum - sumB) / wF;
            float variance = wB * wF * (mB - mF) * (mB - mF);
            if (variance > maxVariance) {
                maxVariance = variance;
                threshold = t;
            }
        }
        return threshold;
    }

    // ── CLAHE ──

    private static float[] clahe(float[] gray, int width, int height,
                                  int tileSize, float clipLimit) {
        float[] result = new float[gray.length];
        int tilesX = (int) Math.ceil((float) width / tileSize);
        int tilesY = (int) Math.ceil((float) height / tileSize);
        int totalTiles = tilesX * tilesY;

        // Store per-tile CDFs
        float[][] tileCDFs = new float[totalTiles][256];
        float[] tileCX = new float[totalTiles];
        float[] tileCY = new float[totalTiles];

        for (int ty = 0; ty < tilesY; ty++) {
            for (int tx = 0; tx < tilesX; tx++) {
                int tileIdx = ty * tilesX + tx;
                int x0 = tx * tileSize;
                int y0 = ty * tileSize;
                int x1 = Math.min(x0 + tileSize, width);
                int y1 = Math.min(y0 + tileSize, height);

                int[] hist = new int[256];
                int count = 0;
                for (int y = y0; y < y1; y++) {
                    for (int x = x0; x < x1; x++) {
                        int val = Math.round(gray[y * width + x]);
                        hist[val]++;
                        count++;
                    }
                }

                // Clip histogram
                if (clipLimit > 0 && count > 0) {
                    int clipThreshold = (int) (clipLimit * count / 256);
                    int excess = 0;
                    for (int i = 0; i < 256; i++) {
                        if (hist[i] > clipThreshold) {
                            excess += hist[i] - clipThreshold;
                            hist[i] = clipThreshold;
                        }
                    }
                    int redist = excess / 256;
                    for (int i = 0; i < 256; i++) hist[i] += redist;
                }

                // Build CDF
                float[] cdf = tileCDFs[tileIdx];
                if (count > 0) {
                    cdf[0] = (float) hist[0] / count;
                    for (int i = 1; i < 256; i++) {
                        cdf[i] = cdf[i - 1] + (float) hist[i] / count;
                    }
                }

                tileCX[tileIdx] = (x0 + x1) / 2.0f;
                tileCY[tileIdx] = (y0 + y1) / 2.0f;
            }
        }

        // Apply bilinear interpolation
        for (int y = 0; y < height; y++) {
            for (int x = 0; x < width; x++) {
                int tx0 = Math.max(0, Math.min(tilesX - 1, x / tileSize));
                int ty0 = Math.max(0, Math.min(tilesY - 1, y / tileSize));

                float sum = 0, weightSum = 0;
                for (int dy = -1; dy <= 1; dy++) {
                    for (int dx = -1; dx <= 1; dx++) {
                        int nx = tx0 + dx;
                        int ny = ty0 + dy;
                        if (nx >= 0 && nx < tilesX && ny >= 0 && ny < tilesY) {
                            int idx = ny * tilesX + nx;
                            float dist = (float) Math.sqrt(
                                (x - tileCX[idx]) * (x - tileCX[idx]) +
                                (y - tileCY[idx]) * (y - tileCY[idx]));
                            if (dist < 1) dist = 1;
                            float w = 1.0f / dist;
                            int val = Math.round(gray[y * width + x]);
                            if (val < 0) val = 0;
                            if (val > 255) val = 255;
                            sum += tileCDFs[idx][val] * w;
                            weightSum += w;
                        }
                    }
                }
                float v = (sum / weightSum) * 255;
                result[y * width + x] = Math.min(255, Math.max(0, v));
            }
        }

        return result;
    }

    // ── Bitmap construction helpers ──

    private static Bitmap buildBitmapFromGray(float[] gray, int w, int h) {
        int[] argb = new int[gray.length];
        for (int i = 0; i < gray.length; i++) {
            int v = Math.round(Math.min(255, Math.max(0, gray[i])));
            argb[i] = Color.rgb(v, v, v);
        }
        Bitmap b = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888);
        b.setPixels(argb, 0, w, 0, 0, w, h);
        return b;
    }

    private static Bitmap buildBitmapFromThreshold(float[] gray, int threshold, int w, int h) {
        int[] argb = new int[gray.length];
        for (int i = 0; i < gray.length; i++) {
            int v = gray[i] >= threshold ? 255 : 0;
            argb[i] = Color.rgb(v, v, v);
        }
        Bitmap b = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888);
        b.setPixels(argb, 0, w, 0, 0, w, h);
        return b;
    }
}
