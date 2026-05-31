package com.latexsnipper.app.ocr;

import android.graphics.Bitmap;
import android.util.Log;

import java.util.ArrayList;
import java.util.List;

/**
 * FormulaLineSplitter — splits multi-line formula images into individual lines,
 * recognizes each line separately, and reassembles them.
 * <p>
 * Matches desktop mathcraft_ocr/formula_lines.py :: split_formula_line_groups()
 * + compose_formula_line() + compose_aligned_formula().
 * <p>
 * Pipeline: ink row projection → detect gaps → split → recognize each line → reassemble.
 */
public class FormulaLineSplitter {

    private static final String TAG = "FormulaLineSplit";
    private static final int MIN_LINE_HEIGHT = 12;
    private static final int MIN_GAP_HEIGHT = 4;
    private static final int INK_THRESHOLD = 3;  // min dark pixels per row to count as "ink"

    /**
     * Split a formula bitmap into lines, recognize each, and return corrected LaTeX.
     *
     * @param formulaBmp The formula crop bitmap (any size).
     * @param runner     OnnxRunner with loaded formula rec models.
     * @param recPost    FormulaRecPostProcess for decoding.
     * @return Recognized LaTeX string (with \begin{aligned} for multi-line).
     */
    public static String recognizeMultiLine(Bitmap formulaBmp,
                                             OnnxRunner runner,
                                             FormulaRecPostProcess recPost) {
        int w = formulaBmp.getWidth();
        int h = formulaBmp.getHeight();

        // If small enough, just recognize as single line
        if (h < 64 || w < 64) {
            return recognizeSingle(formulaBmp, runner, recPost);
        }

        // Step 1: Convert to grayscale and compute row ink profile
        int[] argb = new int[w * h];
        formulaBmp.getPixels(argb, 0, w, 0, 0, w, h);
        int[] rowInk = new int[h];

        for (int y = 0; y < h; y++) {
            int count = 0;
            for (int x = 0; x < w; x++) {
                int pixel = argb[y * w + x];
                // Luminance: dark = ink
                int lum = ((pixel >> 16) & 0xFF) * 299 + ((pixel >> 8) & 0xFF) * 587 + (pixel & 0xFF) * 114;
                if (lum < 30000) count++;  // dark pixel threshold
            }
            rowInk[y] = count;
        }

        // Step 2: Detect ink bands and gaps
        List<int[]> inkBands = new ArrayList<>();  // [startY, endY] inclusive
        boolean inBand = false;
        int bandStart = 0;
        int gapCount = 0;

        for (int y = 0; y < h; y++) {
            if (rowInk[y] >= INK_THRESHOLD && !inBand) {
                bandStart = y;
                inBand = true;
                gapCount = 0;
            } else if (rowInk[y] < INK_THRESHOLD && inBand) {
                gapCount++;
                if (gapCount > MIN_GAP_HEIGHT) {
                    inkBands.add(new int[]{bandStart, y - gapCount});
                    inBand = false;
                    gapCount = 0;
                }
            } else if (rowInk[y] < INK_THRESHOLD) {
                gapCount++;
            }
        }
        if (inBand) {
            inkBands.add(new int[]{bandStart, h - 1});
        }

        // Filter out noise bands
        List<int[]> validBands = new ArrayList<>();
        for (int[] band : inkBands) {
            int bh = band[1] - band[0] + 1;
            if (bh >= MIN_LINE_HEIGHT) validBands.add(band);
        }

        // Single line? Just do full image
        if (validBands.size() <= 1) {
            return recognizeSingle(formulaBmp, runner, recPost);
        }

        Log.d(TAG, "Multi-line formula: " + validBands.size() + " lines");

        // Step 3: Recognize each line
        List<String> lineTexts = new ArrayList<>();
        for (int[] band : validBands) {
            int y1 = Math.max(0, band[0] - 4);
            int y2 = Math.min(h, band[1] + 4);
            int lh = y2 - y1;
            if (lh < 8) continue;

            Bitmap lineBmp = Bitmap.createBitmap(formulaBmp, 0, y1, w, lh);
            String latex = recognizeSingle(lineBmp, runner, recPost);
            lineBmp.recycle();
            if (latex != null && !latex.isEmpty()) {
                lineTexts.add(latex);
            }
        }

        // Step 4: Reassemble
        if (lineTexts.isEmpty()) return "";
        if (lineTexts.size() == 1) return lineTexts.get(0);

        // Multi-line → wrap in aligned environment
        StringBuilder sb = new StringBuilder();
        sb.append("\\begin{aligned}");
        for (int i = 0; i < lineTexts.size(); i++) {
            String cleaned = lineTexts.get(i).trim();
            // Remove leading/trailing $$ if present
            cleaned = cleaned.replaceAll("^\\$+", "").replaceAll("\\$+$", "").trim();
            sb.append(cleaned);
            if (i < lineTexts.size() - 1) sb.append(" \\\\ ");
        }
        sb.append("\\end{aligned}");
        return sb.toString();
    }

    /** Recognize a single formula image (full frame, no splitting). */
    private static String recognizeSingle(Bitmap bitmap,
                                           OnnxRunner runner,
                                           FormulaRecPostProcess recPost) {
        try {
            float[] input = FormulaRecPreProcess.run(bitmap);
            java.nio.FloatBuffer fb = java.nio.FloatBuffer.wrap(input);
            ai.onnxruntime.OrtSession.Result encResult = runner.runEncoder(fb);

            float[] encOutput = OcrEngine.tensorDataStatic(encResult, runner.getEncoderOutputName());
            long[] encShape = OcrEngine.tensorShapeStatic(encResult, runner.getEncoderOutputName());
            int[] encDims = {(int) encShape[0], (int) encShape[1], (int) encShape[2]};

            FormulaRecPostProcess.DecodeResult decResult = recPost.decode(runner, encOutput, encDims);
            return decResult.latex;
        } catch (Exception e) {
            Log.e(TAG, "Single line rec failed", e);
            return "";
        }
    }
}
