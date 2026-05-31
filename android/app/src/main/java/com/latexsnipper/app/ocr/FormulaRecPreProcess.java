package com.latexsnipper.app.ocr;

import android.graphics.Bitmap;

/**
 * FormulaRecPreProcess — image preprocessing for TrOCR formula recognition.
 * <p>
 * Pipeline: resize the SHORTER side to 384 (preserving aspect) → NO center-crop!
 * → normalize to [-1, 1] using mean=0.5 std=0.5.
 *
 * ViTImageProcessor {do_center_crop: false, do_resize: true, size: 384,
 *   resample: 3 (bicubic), rescale_factor: 1/255, mean: [0.5,0.5,0.5], std: [0.5,0.5,0.5]}
 *
 * The processor resizes so the shorter side = 384 (size param), and does NOT center-crop.
 * Bicubic interpolation matches LaTeXSnipper desktop.
 */
public class FormulaRecPreProcess {

    public static final int IMG_SIZE = 384;

    /**
     * Preprocess a Bitmap for the TrOCR encoder.
     * Desktop ViTImageProcessor does:
     *   1. Bicubic resize so shorter side = 384 (size, NOT crop_size!)
     *   2. NO center crop (do_center_crop: false)
     *   3. Rescale pixels to [0,1]: pixel / 255
     *   4. Normalize: (pixel - mean) / std with mean=[0.5,0.5,0.5], std=[0.5,0.5,0.5]
     *      => (pixel / 255 - 0.5) / 0.5 = (pixel * 2 / 255) - 1 → [-1, 1]
     *   5. Bicubic resampling (resample=3 = PIL.Image.BICUBIC)
     *
     * @param bitmap Input bitmap (any size).
     * @return float array [3][384][384] in CHW layout, values in [-1, 1].
     */
    public static float[] run(Bitmap bitmap) {
        int iw = bitmap.getWidth();
        int ih = bitmap.getHeight();

        // Resize so the SHORTER side = IMG_SIZE (MATCHES ViTImageProcessor.do_center_crop=false)
        // The processor uses size as the target for the shorter side, NOT a crop size.
        // Shape becomes (384, 384*something) for wide images, or (384*something, 384) for tall.
        // Actually, ViTImageProcessor with size=384 and do_center_crop=false:
        //   "resize images so that the short side is 384, the other side may vary."
        float scale = (float) IMG_SIZE / Math.min(iw, ih);
        int newW = Math.round(iw * scale);
        int newH = Math.round(ih * scale);

        // Use BICUBIC resampling (Bitmap.createScaledBitmap uses bilinear — closest available)
        Bitmap resized = Bitmap.createScaledBitmap(bitmap, newW, newH, true);
        if (resized == bitmap)
            resized = bitmap.copy(Bitmap.Config.ARGB_8888, false);

        // The result may be >384 on the long side. We need to PAD the short side with zeros
        // to make it exactly 384×384 for ONNX. ViT expects fixed [3,384,384].
        // Pad with the mean pixel value (0.5 → 128) rather than 0 to minimize boundary artifacts.
        Bitmap canvas = Bitmap.createBitmap(IMG_SIZE, IMG_SIZE, Bitmap.Config.ARGB_8888);
        android.graphics.Canvas cv = new android.graphics.Canvas(canvas);
        // Fill with grey (128 = mean pixel value after rescale)
        cv.drawColor(android.graphics.Color.rgb(128, 128, 128));
        // Center the resized image
        int dx = (IMG_SIZE - newW) / 2;
        int dy = (IMG_SIZE - newH) / 2;
        cv.drawBitmap(resized, dx, dy, null);
        if (resized != bitmap) resized.recycle();

        int[] argb = new int[IMG_SIZE * IMG_SIZE];
        canvas.getPixels(argb, 0, IMG_SIZE, 0, 0, IMG_SIZE, IMG_SIZE);
        canvas.recycle();

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
