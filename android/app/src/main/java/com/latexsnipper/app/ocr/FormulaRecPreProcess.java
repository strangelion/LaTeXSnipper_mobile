package com.latexsnipper.app.ocr;

import android.graphics.Bitmap;

/**
 * FormulaRecPreProcess — image preprocessing for TrOCR formula recognition.
 * <p>
 * ViTImageProcessor config: do_resize=true, size=384, do_center_crop=false,
 * do_normalize=true, image_mean=[0.5,0.5,0.5], image_std=[0.5,0.5,0.5],
 * rescale_factor=1/255, resample=BICUBIC(3).
 * <p>
 * With do_center_crop=false and size={384,384}, the processor resizes
 * directly to 384×384 (stretch), NOT preserve-aspect-ratio + pad.
 */
public class FormulaRecPreProcess {

    public static final int IMG_SIZE = 384;

    /**
     * Preprocess a Bitmap for the TrOCR encoder.
     * Directly resize to 384×384 (matching ViTImageProcessor with size=384, no center-crop).
     *
     * @param bitmap Input bitmap (any size).
     * @return float array [3][384][384] in CHW layout, values in [-1, 1].
     */
    public static float[] run(Bitmap bitmap) {
        // Direct stretch resize to exactly 384×384 (ViTImageProcessor size=384, no center-crop)
        Bitmap resized = Bitmap.createScaledBitmap(bitmap, IMG_SIZE, IMG_SIZE, true);
        if (resized == bitmap) {
            resized = bitmap.copy(Bitmap.Config.ARGB_8888, false);
        }

        int[] argb = new int[IMG_SIZE * IMG_SIZE];
        resized.getPixels(argb, 0, IMG_SIZE, 0, 0, IMG_SIZE, IMG_SIZE);
        if (resized != bitmap) resized.recycle();

        final int n = IMG_SIZE * IMG_SIZE;
        float[] data = new float[3 * n];
        // Normalize: (pixel / 255 - 0.5) / 0.5 = pixel * 2 / 255 - 1
        final float scl = 2.0f / 255.0f;

        for (int i = 0; i < n; i++) {
            int pixel = argb[i];
            data[i]       = ((pixel >> 16) & 0xFF) * scl - 1.0f;  // R
            data[n + i]   = ((pixel >> 8)  & 0xFF) * scl - 1.0f;  // G
            data[2 * n + i] = (pixel         & 0xFF) * scl - 1.0f; // B
        }

        return data;
    }
}
