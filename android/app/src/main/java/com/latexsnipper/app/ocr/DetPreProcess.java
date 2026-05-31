package com.latexsnipper.app.ocr;

import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.RectF;

/**
 * DetPreProcess — letterbox resize + normalization for YOLOv8 formula detection.
 *
 * Matches the JS implementation in formula-detection.js :: preprocessDet():
 *   - Resize to 768x768 maintaining aspect ratio (letterbox)
 *   - Fill background with gray (114, 114, 114)
 *   - Normalize pixel values to [0, 1]
 *   - Output CHW float array: [3, 768, 768]
 */
public class DetPreProcess {

    public static final int TARGET_SIZE = 768;
    public static final int FILL_GRAY = 114;

    /** Result of preprocessing, needed by post-process to de-scale boxes. */
    public static class Result {
        public final float[] data;      // CHW float array, length = 3 * TARGET_SIZE * TARGET_SIZE
        public final float scale;       // min(TARGET_SIZE / w, TARGET_SIZE / h)
        public final int padX;          // horizontal padding (pixels on the canvas)
        public final int padY;          // vertical padding
        public final int origW;         // original image width
        public final int origH;         // original image height

        public Result(float[] data, float scale, int padX, int padY, int origW, int origH) {
            this.data = data;
            this.scale = scale;
            this.padX = padX;
            this.padY = padY;
            this.origW = origW;
            this.origH = origH;
        }
    }

    /**
     * Preprocess a Bitmap for formula detection inference.
     *
     * @param bitmap Input bitmap (any size). Will not be recycled.
     * @return Result containing the normalized CHW tensor and metadata.
     */
    public static Result run(Bitmap bitmap) {
        final int iw = bitmap.getWidth();
        final int ih = bitmap.getHeight();

        // Letterbox scale
        final float scale = Math.min(
            (float) TARGET_SIZE / iw,
            (float) TARGET_SIZE / ih
        );
        final int newW = Math.round(iw * scale);
        final int newH = Math.round(ih * scale);
        final int padX = Math.round((TARGET_SIZE - newW) / 2.0f - 0.1f);
        final int padY = Math.round((TARGET_SIZE - newH) / 2.0f - 0.1f);

        // Create a 768x768 canvas filled with gray
        Bitmap canvas = Bitmap.createBitmap(TARGET_SIZE, TARGET_SIZE, Bitmap.Config.ARGB_8888);
        Canvas cv = new Canvas(canvas);
        Paint paint = new Paint();
        paint.setColor(android.graphics.Color.rgb(FILL_GRAY, FILL_GRAY, FILL_GRAY));
        paint.setStyle(Paint.Style.FILL);
        cv.drawRect(new RectF(0, 0, TARGET_SIZE, TARGET_SIZE), paint);

        // Draw scaled image centered (letterbox)
        Bitmap scaled = Bitmap.createScaledBitmap(bitmap, newW, newH, true);
        cv.drawBitmap(scaled, padX, padY, null);
        scaled.recycle();

        // Read pixels and convert to CHW float array [0, 1]
        int[] argb = new int[TARGET_SIZE * TARGET_SIZE];
        canvas.getPixels(argb, 0, TARGET_SIZE, 0, 0, TARGET_SIZE, TARGET_SIZE);
        canvas.recycle();

        final int n = TARGET_SIZE * TARGET_SIZE;
        float[] floatData = new float[3 * n];

        for (int i = 0; i < n; i++) {
            int pixel = argb[i];
            floatData[i]       = ((pixel >> 16) & 0xFF) / 255.0f;       // R
            floatData[n + i]   = ((pixel >> 8)  & 0xFF) / 255.0f;       // G
            floatData[2 * n + i] = (pixel         & 0xFF) / 255.0f;     // B
        }

        return new Result(floatData, scale, padX, padY, iw, ih);
    }
}
