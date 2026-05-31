package com.latexsnipper.app.ocr;

import android.graphics.Bitmap;

/**
 * DocOriPreProcess — document orientation detection preprocessing.
 * <p>
 * Matches doc-preprocess.js :: preprocessDocOri():
 * <ol>
 *   <li>Resize short side to 256, maintain aspect ratio</li>
 *   <li>Center crop to 224×224</li>
 *   <li>ImageNet normalization (mean/std)</li>
 *   <li>Output CHW float[3*224*224]</li>
 * </ol>
 */
public class DocOriPreProcess {

    public static final int TARGET_SIZE = 224;
    private static final int RESIZE_SHORT = 256;
    private static final float[] MEAN = {0.485f, 0.456f, 0.406f};
    private static final float[] STD  = {0.229f, 0.224f, 0.225f};

    /**
     * Preprocess a bitmap for document orientation classification.
     *
     * @param bitmap Input bitmap (any size/orientation).
     * @return float[3*224*224] ImageNet-normalized, CHW layout.
     */
    public static float[] run(Bitmap bitmap) {
        int iw = bitmap.getWidth();
        int ih = bitmap.getHeight();

        // Step 1: Resize short side to 256
        int newW, newH;
        if (iw < ih) {
            newW = RESIZE_SHORT;
            newH = Math.round(ih * (RESIZE_SHORT / (float) iw));
        } else {
            newH = RESIZE_SHORT;
            newW = Math.round(iw * (RESIZE_SHORT / (float) ih));
        }

        Bitmap resized = Bitmap.createScaledBitmap(bitmap, newW, newH, true);

        // Step 2: Center crop to 224×224
        int cropX = (newW - TARGET_SIZE) / 2;
        int cropY = (newH - TARGET_SIZE) / 2;
        Bitmap cropped = Bitmap.createBitmap(resized, Math.max(0, cropX), Math.max(0, cropY),
            Math.min(TARGET_SIZE, newW), Math.min(TARGET_SIZE, newH));
        if (resized != bitmap) resized.recycle();

        // If crop isn't exactly 224x224 (e.g., when image was too small), pad
        int cw = cropped.getWidth();
        int ch = cropped.getHeight();
        int[] argb;
        if (cw == TARGET_SIZE && ch == TARGET_SIZE) {
            argb = new int[TARGET_SIZE * TARGET_SIZE];
            cropped.getPixels(argb, 0, TARGET_SIZE, 0, 0, TARGET_SIZE, TARGET_SIZE);
        } else {
            // Pad to 224x224 with white
            Bitmap padded = Bitmap.createBitmap(TARGET_SIZE, TARGET_SIZE, Bitmap.Config.ARGB_8888);
            android.graphics.Canvas cv = new android.graphics.Canvas(padded);
            cv.drawColor(android.graphics.Color.WHITE);
            cv.drawBitmap(cropped, (TARGET_SIZE - cw) / 2, (TARGET_SIZE - ch) / 2, null);
            argb = new int[TARGET_SIZE * TARGET_SIZE];
            padded.getPixels(argb, 0, TARGET_SIZE, 0, 0, TARGET_SIZE, TARGET_SIZE);
            padded.recycle();
        }
        cropped.recycle();

        // Step 3: ImageNet normalization (CHW)
        int n = TARGET_SIZE * TARGET_SIZE;
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
     * Classify orientation from softmax output.
     *
     * @param logits Raw model output [0..3].
     * @return Orientation result with angle (0/90/180/270) and confidence.
     */
    public static OrientationResult classifyOrientation(float[] logits) {
        float[] probs = softmax(logits);
        int[] angles = {0, 90, 180, 270};

        int maxIdx = 0;
        for (int i = 1; i < 4; i++) {
            if (probs[i] > probs[maxIdx]) maxIdx = i;
        }

        return new OrientationResult(angles[maxIdx], probs[maxIdx]);
    }

    private static float[] softmax(float[] logits) {
        float max = Float.NEGATIVE_INFINITY;
        for (float v : logits) max = Math.max(max, v);
        double sum = 0;
        float[] exp = new float[logits.length];
        for (int i = 0; i < logits.length; i++) {
            exp[i] = (float) Math.exp(logits[i] - max);
            sum += exp[i];
        }
        for (int i = 0; i < logits.length; i++) exp[i] /= sum;
        return exp;
    }

    /** Result of orientation classification. */
    public static class OrientationResult {
        public final int angle;
        public final float confidence;

        public OrientationResult(int angle, float confidence) {
            this.angle = angle;
            this.confidence = confidence;
        }
    }
}
