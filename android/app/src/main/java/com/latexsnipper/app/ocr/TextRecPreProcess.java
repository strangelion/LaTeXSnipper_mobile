package com.latexsnipper.app.ocr;

import android.graphics.Bitmap;

/**
 * TextRecPreProcess — preprocessing for PP-OCRv5 CRNN text recognition.
 * <p>
 * Matches RapidOCR TextRecognizer.resize_norm_img():
 *   - Resize width by aspect ratio, keep height=48
 *   - Cap width at 320 (but RapidOCR uses max_wh_ratio over all images in batch)
 *   - Pad RIGHT with zeros (black) to [3, 48, 320] — not centered!
 *   - BGR channel order, normalize to (pixel/255 - 0.5) / 0.5 → [-1, 1]
 *   - Output CHW float array
 */
public class TextRecPreProcess {

    public static final int TARGET_H = 48;
    public static final int MAX_W = 320;

    /**
     * Preprocess a Bitmap for CRNN text recognition.
     * Matches RapidOCR resize_norm_img: keeps height=48, scales width by ratio,
     * pads RIGHT with black, BGR order.
     *
     * @param bitmap Input bitmap (cropped text line).
     * @return float array [3][48][320] in CHW layout, BGR order, values [-1, 1].
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

        // Black background (matches np.zeros padding in RapidOCR)
        // RapidOCR pads on the RIGHT: padding_im[:, :, 0:resized_w] = resized_image
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
