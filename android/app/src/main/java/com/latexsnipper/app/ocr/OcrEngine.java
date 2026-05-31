package com.latexsnipper.app.ocr;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Matrix;
import android.graphics.Paint;
import android.util.Log;

import java.nio.FloatBuffer;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;

/**
 * OcrEngine — main orchestrator for all OCR modes.
 * <p>
 * Coordinates model loading, preprocessing, inference, and postprocessing
 * for formula recognition, text recognition, and mixed-mode recognition.
 */
public class OcrEngine {

    private static final String TAG = "OcrEngine";
    private static final float MIN_TEXT_SCORE = 0.45f;  // Desktop min_text_score

    private final OnnxRunner runner;
    private final FormulaRecPostProcess recPostProc;
    private final TextRecPostProcess textRecPost;

    private boolean modelsLoaded = false;
    private boolean loading = false;
    private Context appContext;

    public OcrEngine() {
        runner = new OnnxRunner();
        recPostProc = new FormulaRecPostProcess();
        textRecPost = new TextRecPostProcess();
    }

    public OnnxRunner getRunner() { return runner; }

    // ── Model loading ──

    public interface ProgressCallback {
        void onProgress(String label, int percent);
    }

    /** Synchronous model loading (blocks until done). Used by NativeOcrBridge. */
    public synchronized void loadAllModelsSync() {
        if (modelsLoaded) return;
        if (loading) return;
        loading = true;
        appContext = null; // Not needed for sync loading without ctx
        // This is a no-op since models need Context — we handle it in NativeOcrBridge
        modelsLoaded = true;
        loading = false;
    }

    /** Synchronous model loading with context (blocks until done). Used by NativeOcrBridge. */
    public synchronized void loadAllModelsSync(Context ctx) {
        if (modelsLoaded) return;
        loading = true;
        appContext = ctx.getApplicationContext();
        try {
            Log.d(TAG, "Loading models (sync)...");
            runner.loadFormulaDetModel(ctx);
            Log.d(TAG, "  formula-det loaded");
            runner.loadFormulaRecModels(ctx);
            recPostProc.loadTokenizer(ctx);
            Log.d(TAG, "  formula-rec loaded");
            runner.loadTextDetModel(ctx);
            Log.d(TAG, "  text-det loaded");
            runner.loadTextRecModel(ctx);
            textRecPost.loadKeys(ctx);
            Log.d(TAG, "  text-rec loaded");
            runner.loadRegionDetModel(ctx);
            Log.d(TAG, "  region-det loaded");
            runner.loadDocOriModel(ctx);
            Log.d(TAG, "  doc-ori loaded");
            modelsLoaded = true;
            Log.d(TAG, "All models loaded (sync)");
        } catch (Exception e) {
            Log.e(TAG, "Model loading failed", e);
            throw new RuntimeException("Model loading failed", e);
        } finally {
            loading = false;
        }
    }

    public synchronized void loadAllModels(Context ctx, ProgressCallback cb) {
        if (modelsLoaded) return;
        if (loading) return;
        loading = true;
        appContext = ctx.getApplicationContext();

        new Thread(() -> {
            try {
                if (cb != null) cb.onProgress("公式检测模型", 0);
                runner.loadFormulaDetModel(ctx);
                if (cb != null) cb.onProgress("公式编码器模型", 25);
                runner.loadFormulaRecModels(ctx);
                recPostProc.loadTokenizer(ctx);
                if (cb != null) cb.onProgress("文字检测模型", 50);
                runner.loadTextDetModel(ctx);
                if (cb != null) cb.onProgress("文字识别模型", 75);
                runner.loadTextRecModel(ctx);
                textRecPost.loadKeys(ctx);
                if (cb != null) cb.onProgress("区域检测模型", 85);
                runner.loadRegionDetModel(ctx);
                if (cb != null) cb.onProgress("方向检测模型", 95);
                runner.loadDocOriModel(ctx);
                modelsLoaded = true;
                if (cb != null) cb.onProgress("全部模型加载完成", 100);
                Log.d(TAG, "All models loaded");
            } catch (Exception e) {
                Log.e(TAG, "Model loading failed", e);
            } finally {
                loading = false;
            }
        }).start();
    }

    public boolean isReady() { return modelsLoaded; }

    // ══════════════════════════════════════════════
    // AUTO ORIENTATION (pplcnet_doc_ori.onnx)
    // ══════════════════════════════════════════════

    /**
     * Auto-correct image orientation using PP-LCNet doc_ori model.
     * Returns the corrected bitmap (or the original if no rotation needed).
     * The caller must recycle the returned bitmap if different from input.
     */
    public Bitmap autoOrient(Bitmap bitmap) {
        if (!runner.isDocOriReady()) return bitmap;

        try {
            float[] input = DocOriPreProcess.run(bitmap);
            java.nio.FloatBuffer fb = java.nio.FloatBuffer.wrap(input);
            ai.onnxruntime.OrtSession.Result result = runner.runDocOri(fb);
            float[] logits = tensorData(result, runner.getDocOriOutputName());

            DocOriPreProcess.OrientationResult orient = DocOriPreProcess.classifyOrientation(logits);
            Log.d(TAG, "DocOri: angle=" + orient.angle + "°, conf=" + String.format("%.2f", orient.confidence)
                + " img=" + bitmap.getWidth() + "x" + bitmap.getHeight());

            if (orient.angle == 0 || orient.confidence < 0.6f) return bitmap;

            // The model predicts the direction the image is rotated.
            // To correct, rotate opposite direction.
            Log.d(TAG, "Auto-rotate: -" + orient.angle + "° (ccw)");
            Matrix matrix = new Matrix();
            matrix.postRotate(-orient.angle);
            int w = bitmap.getWidth(), h = bitmap.getHeight();
            Bitmap rotated = Bitmap.createBitmap(bitmap, 0, 0, w, h, matrix, true);
            return rotated;
        } catch (Exception e) {
            Log.w(TAG, "Auto-orient failed", e);
            return bitmap;
        }
    }

    // ══════════════════════════════════════════════
    // FORMULA RECOGNITION
    // ══════════════════════════════════════════════

    /**
     * Full formula recognition pipeline: detect → recognize → repair.
     * Matches: formula-detection.js detectFormulas() → ocr-engine.js recognize()
     */
    public RecognizeResult recognizeFormula(Bitmap bitmap) {
        long t0 = System.currentTimeMillis();
        Log.d(TAG, "recognizeFormula start " + bitmap.getWidth() + "x" + bitmap.getHeight());

        // Step 1: Formula detection (find formula regions)
        DetPreProcess.Result detPre = DetPreProcess.run(bitmap);
        float[] detOutput;
        try {
            ai.onnxruntime.OrtSession.Result detResult = runner.runFormulaDet(
                FloatBuffer.wrap(detPre.data));
            detOutput = tensorData(detResult, runner.getFormulaDetOutputName());
        } catch (Exception e) {
            Log.e(TAG, "Formula detection failed", e);
            // Fallback: use full image as one region
            DetPreProcess.Result fallbackPre = DetPreProcess.run(bitmap);
            try {
                ai.onnxruntime.OrtSession.Result fbResult = runner.runFormulaDet(
                    FloatBuffer.wrap(fallbackPre.data));
                detOutput = tensorData(fbResult, runner.getFormulaDetOutputName());
            } catch (Exception e2) {
                return new RecognizeResult("", 0, 0, 0);
            }
        }

        List<FormulaDetPostProcess.Box> regions = FormulaDetPostProcess.run(
            detOutput, detPre.origW, detPre.origH,
            detPre.scale, detPre.padX, detPre.padY);
        Log.d(TAG, "FormulaDet: " + regions.size() + " regions");

        long t1 = System.currentTimeMillis();

        // If no regions found, use full image
        if (regions.isEmpty()) {
            return recognizeFormulaFullImage(bitmap);
        }

        // Step 2: Recognize each region, take the best
        StringBuilder combinedLatex = new StringBuilder();
        float bestConf = 0;
        String bestLatex = "";

        for (FormulaDetPostProcess.Box region : regions) {
            Bitmap regionBitmap = cropBitmap(bitmap, region.x, region.y, region.w, region.h);
            RecognizeResult result = recognizeFormulaFullImage(regionBitmap);
            regionBitmap.recycle();

            if (result.confidence > bestConf) {
                bestConf = result.confidence;
                bestLatex = result.text;
            }
            if (!result.text.isEmpty()) {
                if (combinedLatex.length() > 0) combinedLatex.append(" \\\\ ");
                combinedLatex.append(result.text);
            }
        }

        long totalMs = System.currentTimeMillis() - t0;
        Log.d(TAG, String.format("Formula rec: %d regions in %dms (det %dms, rec %dms)",
            regions.size(), totalMs, t1 - t0, totalMs - (t1 - t0)));

        return new RecognizeResult(bestLatex, bestConf, regions.size(), (int) totalMs);
    }

    /**
     * Recognize formula from full image (no detection step).
     */
    private RecognizeResult recognizeFormulaFullImage(Bitmap bitmap) {
        long t0 = System.currentTimeMillis();
        float[] input = FormulaRecPreProcess.run(bitmap);

        try {
            // Encoder
            ai.onnxruntime.OrtSession.Result encResult = runner.runEncoder(
                FloatBuffer.wrap(input));

            float[] encOutput = tensorData(encResult, runner.getEncoderOutputName());
            long[] encShape = tensorShape(encResult, runner.getEncoderOutputName());
            int[] encDims = {(int) encShape[0], (int) encShape[1], (int) encShape[2]};

            // Decoder (beam search)
            FormulaRecPostProcess.DecodeResult decResult = recPostProc.decode(
                runner, encOutput, encDims);
            Log.d(TAG, "FormulaRec: '" + decResult.latex + "' conf=" + decResult.confidence
                + " tokens=" + decResult.numTokens);

            long ms = System.currentTimeMillis() - t0;
            return new RecognizeResult(decResult.latex, decResult.confidence, 1, (int) ms);

        } catch (Exception e) {
            Log.e(TAG, "Formula recognition failed", e);
            return new RecognizeResult("", 0, 0, (int) (System.currentTimeMillis() - t0));
        }
    }

    // ══════════════════════════════════════════════
    // TEXT RECOGNITION
    // ══════════════════════════════════════════════

    /**
     * Full text recognition pipeline: detect → recognize → combine.
     * Matches: text-detection.js detectText() → text-recognition.js recognizeText()
     */
    public RecognizeResult recognizeText(Bitmap bitmap) {
        long t0 = System.currentTimeMillis();
        Log.d(TAG, "recognizeText start " + bitmap.getWidth() + "x" + bitmap.getHeight());

        // Step 1: Text detection
        TextDetProcessor.PreResult detPre = TextDetProcessor.preprocess(bitmap);
        List<TextDetProcessor.Box> textBoxes;

        try {
            ai.onnxruntime.OrtSession.Result detResult = runner.runTextDet(
                FloatBuffer.wrap(detPre.data), detPre.inputShape);
            float[] probMap = tensorData(detResult, runner.getTextDetOutputName());

            textBoxes = TextDetProcessor.postprocess(probMap,
                detPre.height, detPre.width, detPre.scale, detPre.origW, detPre.origH);
            Log.d(TAG, "TextDet: " + textBoxes.size() + " boxes");

            // Fallback: if no boxes, try with lower threshold (treat as single text region)
            if (textBoxes.isEmpty()) {
                textBoxes.add(new TextDetProcessor.Box(0, 0, detPre.origW, detPre.origH, 0.5f));
            }
        } catch (Exception e) {
            Log.e(TAG, "Text detection failed", e);
            textBoxes = new ArrayList<>();
            textBoxes.add(new TextDetProcessor.Box(0, 0, detPre.origW, detPre.origH, 0.5f));
        }

        // Step 2: Recognize each text box
        StringBuilder fullText = new StringBuilder();
        float avgConf = 0;

        for (TextDetProcessor.Box box : textBoxes) {
            Bitmap region = cropBitmap(bitmap, box.x, box.y, box.w, box.h);

            try {
                float[] recInput = TextRecPreProcess.run(region);
                ai.onnxruntime.OrtSession.Result recResult = runner.runTextRec(
                    FloatBuffer.wrap(recInput));
                float[] logits = tensorData(recResult, runner.getTextRecOutputName());
                long[] dims = tensorShape(recResult, runner.getTextRecOutputName());

                TextRecPostProcess.DecodeResult decoded = textRecPost.ctcDecode(logits, dims);
                Log.d(TAG, "TextRec box " + box.x + "," + box.y + ": '" + decoded.text
                    + "' conf=" + decoded.confidence
                    + " dims=" + dims[0] + "," + dims[1] + "," + dims[2]);

                if (!decoded.text.isEmpty() && decoded.confidence >= MIN_TEXT_SCORE) {
                    if (fullText.length() > 0 && !fullText.toString().endsWith("\n")) {
                        fullText.append('\n');
                    }
                    fullText.append(decoded.text);
                    avgConf += decoded.confidence;
                }
            } catch (Exception e) {
                Log.e(TAG, "Text recognition failed for box", e);
            } finally {
                region.recycle();
            }
        }

        if (textBoxes.size() > 0) avgConf /= textBoxes.size();

        long ms = System.currentTimeMillis() - t0;
        Log.d(TAG, String.format("Text rec: %d boxes in %dms, conf=%.2f",
            textBoxes.size(), ms, avgConf));

        return new RecognizeResult(fullText.toString(), avgConf, textBoxes.size(), (int) ms);
    }

    // ══════════════════════════════════════════════
    // MIXED RECOGNITION  (matches desktop pipeline)
    // ══════════════════════════════════════════════

    /**
     * Mixed recognition pipeline (matches desktop mathcraft_ocr):
     * <ol>
     *   <li>Formula detection → get formula bounding boxes</li>
     *   <li>Mask formula regions (paint white) → run text detection on masked image</li>
     *   <li>Split text boxes around formula boundaries</li>
     *   <li>Classify segments as formula (use formula rec) or text (use text rec)</li>
     * </ol>
     */
    public MixedResult recognizeMixed(Bitmap bitmap) {
        long t0 = System.currentTimeMillis();
        List<MixedResult.RegionResult> results = new ArrayList<>();

        // Step 1: Formula detection
        DetPreProcess.Result detPre = DetPreProcess.run(bitmap);
        try {
            ai.onnxruntime.OrtSession.Result detResult = runner.runFormulaDet(
                FloatBuffer.wrap(detPre.data));
            float[] detOutput = tensorData(detResult, runner.getFormulaDetOutputName());
            List<FormulaDetPostProcess.Box> formulaBoxes = FormulaDetPostProcess.run(
                detOutput, detPre.origW, detPre.origH,
                detPre.scale, detPre.padX, detPre.padY);

            // Step 2: Text detection on ORIGINAL (unmasked) image, matching desktop behavior
            TextDetProcessor.PreResult textDetPre = TextDetProcessor.preprocess(bitmap);
            List<TextDetProcessor.Box> textBoxes;
            try {
                ai.onnxruntime.OrtSession.Result textDetResult = runner.runTextDet(
                    FloatBuffer.wrap(textDetPre.data), textDetPre.inputShape);
                float[] probMap = tensorData(textDetResult, runner.getTextDetOutputName());
                textBoxes = TextDetProcessor.postprocess(probMap,
                    textDetPre.height, textDetPre.width,
                    textDetPre.scale, textDetPre.origW, textDetPre.origH);
            } catch (Exception e) {
                Log.e(TAG, "Text detection failed in mixed mode", e);
                textBoxes = new ArrayList<>();
            }

            // Step 3: Split text boxes around formula x-ranges (desktop split_text_box_around_formulas)
            for (TextDetProcessor.Box textBox : textBoxes) {
                List<SegInterval> segments = splitAroundFormulas(textBox, formulaBoxes);

                for (SegInterval seg : segments) {
                    Bitmap crop = cropBitmap(bitmap, seg.x, textBox.y, seg.w, textBox.h);
                    if (seg.isFormula) {
                        // Use line splitter for tall formulas (multi-line), fallback to single for simple ones
                        String latex;
                        if (crop.getHeight() > crop.getWidth() * 0.8 || crop.getHeight() > 100) {
                            latex = FormulaLineSplitter.recognizeMultiLine(crop, runner, recPostProc);
                        } else {
                            RecognizeResult fr = recognizeFormulaFullImage(crop);
                            latex = fr.text;
                        }
                        if (latex != null && !latex.isEmpty()) {
                            results.add(new MixedResult.RegionResult(
                                seg.x, textBox.y, seg.w, textBox.h, "formula",
                                latex, 0.5f));
                        }
                    } else {
                        String recText = recognizeTextSegment(crop);
                        // Filter low-confidence text (desktop min_text_score=0.45)
                        if (recText != null && !recText.isEmpty()) {
                            results.add(new MixedResult.RegionResult(
                                seg.x, textBox.y, seg.w, textBox.h, "text",
                                recText, 0.5f));
                        }
                    }
                    crop.recycle();
                }
            }

            // Step 4: Recognize formula regions (skip if already covered by splits to avoid dup)
            for (FormulaDetPostProcess.Box fb : formulaBoxes) {
                // Check if this formula box is already covered by a previous formula segment
                boolean covered = false;
                for (MixedResult.RegionResult existing : results) {
                    if (!"formula".equals(existing.type)) continue;
                    int overlapX = Math.max(0, Math.min(fb.x + fb.w, existing.x + existing.w) - Math.max(fb.x, existing.x));
                    int overlapY = Math.max(0, Math.min(fb.y + fb.h, existing.y + existing.h) - Math.max(fb.y, existing.y));
                    float overlapRatio = (float)(overlapX * overlapY) / Math.max(fb.w * fb.h, 1);
                    if (overlapRatio > 0.7f) { covered = true; break; }
                }
                if (covered) continue;
                Bitmap crop = cropBitmap(bitmap, fb.x, fb.y, fb.w, fb.h);
                String latex;
                if (crop.getHeight() > crop.getWidth() * 0.8 || crop.getHeight() > 100) {
                    latex = FormulaLineSplitter.recognizeMultiLine(crop, runner, recPostProc);
                } else {
                    RecognizeResult fr = recognizeFormulaFullImage(crop);
                    latex = fr.text;
                }
                crop.recycle();
                if (latex != null && !latex.isEmpty()) {
                    results.add(new MixedResult.RegionResult(
                        fb.x, fb.y, fb.w, fb.h, "formula", latex, 0.5f));
                }
            }

        } catch (Exception e) {
            Log.e(TAG, "Mixed recognition failed", e);
        }

        // Fallback: if no results, try full-image formula recognition (desktop behavior)
        if (results.isEmpty()) {
            Log.d(TAG, "Mixed mode: no regions found, falling back to formula rec");
            RecognizeResult fr = recognizeFormulaFullImage(bitmap);
            if (fr.text != null && !fr.text.isEmpty()) {
                results.add(new MixedResult.RegionResult(
                    0, 0, bitmap.getWidth(), bitmap.getHeight(), "formula",
                    fr.text, fr.confidence));
            }
        }

        // Sort by reading order (top-to-bottom, left-to-right)
        results.sort((a, b) -> a.y != b.y ? a.y - b.y : a.x - b.x);

        // Format: group into lines, wrap formulas in $$, merge adjacent text
        String formattedText = formatLayoutOutput(results);

        long ms = System.currentTimeMillis() - t0;
        Log.d(TAG, String.format("Mixed rec: %d regions in %dms", results.size(), ms));

        MixedResult mixed = new MixedResult(results, (int) ms);
        mixed.formattedText = formattedText;
        return mixed;
    }

    /**
     * Format regions into structured text with $$ for formulas and paragraph grouping.
     * Simplified version of desktop annotate_blocks() + merge_blocks_text().
     */
    private String formatLayoutOutput(List<MixedResult.RegionResult> regions) {
        if (regions.isEmpty()) return "";
        if (regions.size() == 1) {
            MixedResult.RegionResult r = regions.get(0);
            if ("formula".equals(r.type))
                return "$$\n" + r.text + "\n$$";
            return r.text;
        }

        // Group into lines by y-overlap (0.45 threshold, matching desktop)
        List<List<MixedResult.RegionResult>> lines = new ArrayList<>();
        lines.add(new ArrayList<>());
        lines.get(0).add(regions.get(0));

        for (int i = 1; i < regions.size(); i++) {
            MixedResult.RegionResult curr = regions.get(i);
            boolean added = false;
            for (List<MixedResult.RegionResult> line : lines) {
                MixedResult.RegionResult first = line.get(0);
                int yOverlap = Math.min(first.y + first.h, curr.y + curr.h) - Math.max(first.y, curr.y);
                int minH = Math.min(first.h, curr.h);
                if (minH > 0 && (float) yOverlap / minH >= 0.45f) {
                    line.add(curr);
                    line.sort((a, b) -> a.x - b.x);
                    added = true;
                    break;
                }
            }
            if (!added) {
                List<MixedResult.RegionResult> newLine = new ArrayList<>();
                newLine.add(curr);
                lines.add(newLine);
            }
        }

        // Build output: adjacent text merged with space, formulas wrapped in $$, lines separated by \n
        StringBuilder output = new StringBuilder();
        for (int li = 0; li < lines.size(); li++) {
            List<MixedResult.RegionResult> line = lines.get(li);
            StringBuilder lineText = new StringBuilder();

            for (MixedResult.RegionResult r : line) {
                if ("formula".equals(r.type)) {
                    if (lineText.length() > 0
                        && lineText.charAt(lineText.length() - 1) != '\n') {
                        lineText.append(' ');
                    }
                    lineText.append("$$\n").append(r.text).append("\n$$");
                    lineText.append(' ');
                } else {
                    // Text: trim trailing whitespace, add space separator
                    String t = r.text.trim();
                    if (!t.isEmpty()) {
                        if (lineText.length() > 0
                            && lineText.charAt(lineText.length() - 1) != '\n') {
                            lineText.append(' ');
                        }
                        lineText.append(t);
                    }
                }
            }

            if (li > 0) output.append('\n');
            output.append(lineText.toString().trim());
        }

        return output.toString();
    }

    /** Paint formula regions white on a copy of the bitmap. Retained for internal use. */
    private Bitmap maskFormulaRegions(Bitmap src, List<FormulaDetPostProcess.Box> formulaBoxes) {
        Bitmap copy = src.copy(Bitmap.Config.ARGB_8888, true);
        android.graphics.Canvas cv = new android.graphics.Canvas(copy);
        android.graphics.Paint paint = new android.graphics.Paint();
        paint.setColor(android.graphics.Color.WHITE);
        paint.setStyle(android.graphics.Paint.Style.FILL);
        int margin = 2;
        for (FormulaDetPostProcess.Box fb : formulaBoxes) {
            int x = Math.max(0, fb.x - margin);
            int y = Math.max(0, fb.y - margin);
            int w = Math.min(fb.w + 2 * margin, copy.getWidth() - x);
            int h = Math.min(fb.h + 2 * margin, copy.getHeight() - y);
            cv.drawRect(x, y, x + w, y + h, paint);
        }
        return copy;
    }

    /** Split a text box around formula x-ranges, matching desktop split_text_box_around_formulas. */
    private List<SegInterval> splitAroundFormulas(
            TextDetProcessor.Box textBox,
            List<FormulaDetPostProcess.Box> formulaBoxes) {
        int tx = textBox.x, ty = textBox.y, tw = textBox.w, th = textBox.h;
        int tx2 = tx + tw, ty2 = ty + th;
        List<SegInterval> segs = new ArrayList<>();
        segs.add(new SegInterval(tx, tw, false));

        List<FormulaDetPostProcess.Box> relevant = new ArrayList<>();
        for (FormulaDetPostProcess.Box fb : formulaBoxes) {
            // y-overlap check
            if (fb.y < ty2 && fb.y + fb.h > ty) {
                relevant.add(fb);
            }
        }
        relevant.sort((a, b) -> a.x - b.x);

        for (FormulaDetPostProcess.Box fb : relevant) {
            for (int i = 0; i < segs.size(); i++) {
                SegInterval s = segs.get(i);
                if (s.isFormula) continue;
                int sx2 = s.x + s.w;
                int fx2 = fb.x + fb.w;
                if (s.x < fx2 && sx2 > fb.x) {
                    int leftW = fb.x - s.x;
                    int rightX = fx2;
                    int rightW = sx2 - fx2;
                    List<SegInterval> replacements = new ArrayList<>();
                    if (leftW > 6)
                        replacements.add(new SegInterval(s.x, leftW, false));
                    replacements.add(new SegInterval(fb.x, fb.w, true));
                    if (rightW > 6)
                        replacements.add(new SegInterval(rightX, rightW, false));
                    segs.remove(i);
                    segs.addAll(i, replacements);
                    break;
                }
            }
        }
        return segs;
    }

    /** Recognize a single text segment — direct CRNN on the crop (skip nested detection). */
    private String recognizeTextSegment(Bitmap crop) {
        try {
            float[] recInput = TextRecPreProcess.run(crop);
            ai.onnxruntime.OrtSession.Result recResult = runner.runTextRec(
                FloatBuffer.wrap(recInput));
            long[] dims = tensorShape(recResult, runner.getTextRecOutputName());
            if (dims.length >= 3) {
                float[] logits = tensorData(recResult, runner.getTextRecOutputName());
                TextRecPostProcess.DecodeResult dec = textRecPost.ctcDecode(logits, dims);
                return dec.confidence >= MIN_TEXT_SCORE ? dec.text : "";
            }
        } catch (Exception e) {
            Log.e(TAG, "Text segment rec failed", e);
        }
        return "";
    }

    /** Internal segment interval for splitting text around formulas. */
    private static class SegInterval {
        final int x, w;
        final boolean isFormula;
        SegInterval(int x, int w, boolean isFormula) {
            this.x = x; this.w = w; this.isFormula = isFormula;
        }
    }

    // ══════════════════════════════════════════════
    // PIXEL-BASED LAYOUT ANALYSIS (from region-detect.js)
    // ══════════════════════════════════════════════

    private int[] estimateBgColor(Bitmap bitmap) {
        int w = bitmap.getWidth();
        int h = bitmap.getHeight();
        int[] corners = new int[] {
            bitmap.getPixel(0, 0),
            bitmap.getPixel(w - 1, 0),
            bitmap.getPixel(0, h - 1),
            bitmap.getPixel(w - 1, h - 1),
            bitmap.getPixel(w / 2, 0),
            bitmap.getPixel(w / 2, h - 1),
            bitmap.getPixel(0, h / 2),
            bitmap.getPixel(w - 1, h / 2),
        };
        int[] rs = new int[8], gs = new int[8], bs = new int[8];
        for (int i = 0; i < 8; i++) {
            rs[i] = (corners[i] >> 16) & 0xFF;
            gs[i] = (corners[i] >> 8) & 0xFF;
            bs[i] = corners[i] & 0xFF;
        }
        java.util.Arrays.sort(rs);
        java.util.Arrays.sort(gs);
        java.util.Arrays.sort(bs);
        return new int[]{(rs[3] + rs[4]) / 2, (gs[3] + gs[4]) / 2, (bs[3] + bs[4]) / 2};
    }

    private int pixelDiff(int pixel, int[] bg) {
        int r = (pixel >> 16) & 0xFF, g = (pixel >> 8) & 0xFF, b = pixel & 0xFF;
        return Math.max(Math.max(Math.abs(r - bg[0]), Math.abs(g - bg[1])), Math.abs(b - bg[2]));
    }

    // ── findContentByPixels ──
    private PixelBlock[] findContentByPixels(Bitmap bitmap, int[] bgColor, int bgTol) {
        int w = bitmap.getWidth(), h = bitmap.getHeight();
        int[] pixels = new int[w * h];
        bitmap.getPixels(pixels, 0, w, 0, 0, w, h);

        // Row content counts
        int[] rowContent = new int[h];
        for (int y = 0; y < h; y++) {
            int count = 0;
            for (int x = 0; x < w; x++) {
                if (pixelDiff(pixels[y * w + x], bgColor) > bgTol) count++;
            }
            rowContent[y] = count;
        }

        // Find bands
        List<int[]> bands = new ArrayList<>();
        boolean inBand = false;
        int bandStart = 0;
        for (int y = 0; y < h; y++) {
            if (rowContent[y] >= 5 && !inBand) {
                bandStart = y;
                inBand = true;
            } else if (rowContent[y] < 5 && inBand) {
                bands.add(new int[]{bandStart, y - 1});
                inBand = false;
            }
        }
        if (inBand) bands.add(new int[]{bandStart, h - 1});
        if (bands.isEmpty()) return new PixelBlock[]{new PixelBlock(0, 0, w, h)};

        // Build content mask
        boolean[] hasContent = new boolean[w * h];
        for (int y = 0; y < h; y++) {
            for (int x = 0; x < w; x++) {
                hasContent[y * w + x] = pixelDiff(pixels[y * w + x], bgColor) > bgTol;
            }
        }

        // Merge bands
        List<int[]> mergedBands = new ArrayList<>();
        int curStart = bands.get(0)[0], curEnd = bands.get(0)[1];
        for (int i = 1; i < bands.size(); i++) {
            int start = bands.get(i)[0], end = bands.get(i)[1];
            int gap = start - curEnd - 1;
            if (gap <= 0) {
                curEnd = Math.max(curEnd, end);
                continue;
            }
            if (gap > 80) { // maxSymbolGap
                mergedBands.add(new int[]{curStart, curEnd});
                curStart = start;
                curEnd = end;
                continue;
            }
            int colsCross = continuousColsThroughGap(curEnd + 1, start - 1, w, h, hasContent);
            float xOverlap = xOverlapRatio(curStart, curEnd, start, end, w, h, hasContent);
            boolean prevIsFrag = isFragment(curStart, curEnd, w, h, hasContent);
            boolean nextIsFrag = isFragment(start, end, w, h, hasContent);

            if (xOverlap >= 0.3f && (prevIsFrag || nextIsFrag) && colsCross >= 2) {
                curEnd = end;
            } else if (colsCross >= 5) {
                curEnd = end;
            } else {
                mergedBands.add(new int[]{curStart, curEnd});
                curStart = start;
                curEnd = end;
            }
        }
        mergedBands.add(new int[]{curStart, curEnd});

        // Build blocks from merged bands
        List<PixelBlock> blocks = new ArrayList<>();
        for (int[] band : mergedBands) {
            int y1 = band[0], y2 = band[1];
            int x1 = w, x2 = 0;
            for (int y = y1; y <= y2; y++) {
                for (int x = 0; x < w; x++) {
                    if (hasContent[y * w + x]) {
                        x1 = Math.min(x1, x);
                        x2 = Math.max(x2, x);
                    }
                }
            }
            if (x1 > x2) continue;
            int bw = x2 - x1 + 1, bh = y2 - y1 + 1;
            if (bw >= 40 && bh >= 15) blocks.add(new PixelBlock(x1, y1, bw, bh));
        }

        // Merge overlapping blocks
        blocks.sort((a, b) -> a.y != b.y ? a.y - b.y : a.x - b.x);
        List<PixelBlock> finalBlocks = new ArrayList<>();
        for (PixelBlock blk : blocks) {
            boolean merged = false;
            if (!finalBlocks.isEmpty()) {
                PixelBlock prev = finalBlocks.get(finalBlocks.size() - 1);
                int vGap = blk.y - (prev.y + prev.h);
                if (vGap <= 0) {
                    if (!(blk.x + blk.w < prev.x || prev.x + prev.w < blk.x)) {
                        int nx = Math.min(prev.x, blk.x);
                        int nw = Math.max(prev.x + prev.w, blk.x + blk.w) - nx;
                        int nh = Math.max(prev.y + prev.h, blk.y + blk.h) - prev.y;
                        finalBlocks.set(finalBlocks.size() - 1, new PixelBlock(nx, prev.y, nw, nh));
                        merged = true;
                    }
                } else if (vGap <= 80) {
                    int colsCross = continuousColsThroughGap(prev.y + prev.h, blk.y - 1, w, h, hasContent);
                    int ox1 = Math.max(prev.x, blk.x);
                    int ox2 = Math.min(prev.x + prev.w, blk.x + blk.w);
                    float xOverlap = ox1 < ox2 ? (float) (ox2 - ox1) / Math.min(prev.w, blk.w) : 0;
                    boolean prevIsFrag = prev.w < 300 || prev.h < 20;
                    boolean nextIsFrag = blk.w < 300 || blk.h < 20;
                    if (xOverlap >= 0.3f && (prevIsFrag || nextIsFrag) && colsCross >= 2) {
                        int nw = Math.max(prev.x + prev.w, blk.x + blk.w) - Math.min(prev.x, blk.x);
                        int nh = blk.y + blk.h - prev.y;
                        finalBlocks.set(finalBlocks.size() - 1,
                            new PixelBlock(Math.min(prev.x, blk.x), prev.y, nw, nh));
                        merged = true;
                    }
                }
            }
            if (!merged) finalBlocks.add(blk);
        }

        if (finalBlocks.isEmpty()) return new PixelBlock[]{new PixelBlock(0, 0, w, h)};
        return finalBlocks.toArray(new PixelBlock[0]);
    }

    // ── splitBlockIntoLines ──
    private List<LineInfo> splitBlockIntoLines(Bitmap bitmap, PixelBlock block, int[] bgColor, int bgTol) {
        int w = bitmap.getWidth();
        int[] pixels = new int[w * bitmap.getHeight()];
        bitmap.getPixels(pixels, 0, w, 0, 0, w, bitmap.getHeight());

        int bx = block.x, by = block.y, bw = block.w, bh = block.h;

        int[] rowContent = new int[bh];
        for (int y = 0; y < bh; y++) {
            int count = 0;
            for (int x = 0; x < bw; x++) {
                if (pixelDiff(pixels[(by + y) * w + (bx + x)], bgColor) > bgTol) count++;
            }
            rowContent[y] = count;
        }

        int threshold = 8;
        int effectiveMinGap = bh > 100 ? 7 : 12;

        List<int[]> gaps = new ArrayList<>();
        boolean inGap = false;
        int gapStart = 0;
        for (int y = 0; y < bh; y++) {
            if (rowContent[y] < threshold && !inGap) {
                gapStart = y;
                inGap = true;
            } else if (rowContent[y] >= threshold && inGap) {
                if (y - gapStart >= effectiveMinGap) gaps.add(new int[]{gapStart, y});
                inGap = false;
            }
        }
        if (inGap && bh - gapStart >= effectiveMinGap) gaps.add(new int[]{gapStart, bh});

        if (gaps.isEmpty()) {
            List<LineInfo> lines = new ArrayList<>();
            lines.add(new LineInfo(bx, by, bw, bh));
            return lines;
        }

        // Filter gaps: columns crossing check
        boolean[] contentMask = new boolean[bw * bh];
        for (int y = 0; y < bh; y++) {
            for (int x = 0; x < bw; x++) {
                contentMask[y * bw + x] = pixelDiff(pixels[(by + y) * w + (bx + x)], bgColor) > bgTol;
            }
        }

        List<int[]> validGaps = new ArrayList<>();
        for (int[] gap : gaps) {
            int gs = gap[0], ge = gap[1];
            int gapH = ge - gs;
            int needed = Math.max(1, gapH * 3 / 10);
            boolean crossing = false;
            for (int x = 0; x < bw && !crossing; x++) {
                int colCount = 0;
                for (int gy = gs; gy < ge; gy++) {
                    if (contentMask[gy * bw + x]) colCount++;
                }
                if (colCount >= needed) crossing = true;
            }
            if (!crossing) validGaps.add(gap);
        }

        List<LineInfo> lines = new ArrayList<>();
        int prevEnd = 0;
        for (int[] gap : validGaps) {
            int gs = gap[0], ge = gap[1];
            int lh = gs - prevEnd;
            if (lh >= 15) lines.add(new LineInfo(bx, by + prevEnd, bw, lh, new ArrayList<>()));
            prevEnd = ge;
        }
        if (prevEnd < bh) {
            int lh = bh - prevEnd;
            if (lh >= 15) lines.add(new LineInfo(bx, by + prevEnd, bw, lh, new ArrayList<>()));
        }
        if (lines.isEmpty()) lines.add(new LineInfo(bx, by, bw, bh, new ArrayList<>()));
        return lines;
    }

    // ── splitLineIntoChunks ──
    private List<ChunkInfo> splitLineIntoChunks(Bitmap bitmap, LineInfo line, int[] bgColor, int bgTol) {
        int w = bitmap.getWidth(), h = bitmap.getHeight();
        int[] pixels = new int[w * h];
        bitmap.getPixels(pixels, 0, w, 0, 0, w, h);

        int minGap = 12;
        int lx = line.x, ly = line.y, lw = line.w, lh = line.h;

        // Display formulas → single chunk
        if (lh > 100) {
            List<ChunkInfo> chunks = new ArrayList<>();
            chunks.add(new ChunkInfo(lx, ly, lw, lh));
            return chunks;
        }

        int[] colContent = new int[lw];
        for (int x = 0; x < lw; x++) {
            int count = 0;
            for (int y = 0; y < lh; y++) {
                if (pixelDiff(pixels[(ly + y) * w + (lx + x)], bgColor) > bgTol) count++;
            }
            colContent[x] = count;
        }

        boolean[] emptyCols = new boolean[lw];
        for (int x = 0; x < lw; x++) emptyCols[x] = colContent[x] < 1;

        List<int[]> gaps = new ArrayList<>();
        boolean inGap = false;
        int gapStart = 0;
        for (int x = 0; x < lw; x++) {
            if (emptyCols[x] && !inGap) { gapStart = x; inGap = true; }
            else if (!emptyCols[x] && inGap) {
                if (x - gapStart >= minGap) gaps.add(new int[]{gapStart, x});
                inGap = false;
            }
        }
        if (inGap && lw - gapStart >= minGap) gaps.add(new int[]{gapStart, lw});

        int minChunkW = 20;
        List<ChunkInfo> chunks = new ArrayList<>();
        int prevEnd = 0;
        for (int[] gap : gaps) {
            int gs = gap[0], ge = gap[1];
            int cw = gs - prevEnd;
            if (cw >= minChunkW) chunks.add(new ChunkInfo(lx + prevEnd, ly, cw, lh));
            prevEnd = ge;
        }
        if (prevEnd < lw) {
            int cw = lw - prevEnd;
            if (cw >= minChunkW) chunks.add(new ChunkInfo(lx + prevEnd, ly, cw, lh));
        }
        if (chunks.isEmpty()) chunks.add(new ChunkInfo(lx, ly, lw, lh));
        return chunks;
    }

    // ── Helper: continuousColsThroughGap ──
    private int continuousColsThroughGap(int gapY1, int gapY2, int w, int h, boolean[] hasContent) {
        if (gapY1 > gapY2) return 0;
        int gapH = gapY2 - gapY1 + 1;
        int needed = Math.max(1, gapH * 3 / 10);
        int colsCrossing = 0;
        for (int x = 0; x < w; x++) {
            int colContent = 0;
            for (int y = gapY1; y <= gapY2; y++) {
                if (hasContent[y * w + x]) colContent++;
            }
            if (colContent >= needed) colsCrossing++;
        }
        return colsCrossing;
    }

    // ── Helper: xOverlapRatio ──
    private float xOverlapRatio(int y1a, int y2a, int y1b, int y2b, int w, int h, boolean[] hasContent) {
        int ax1 = w, ax2 = 0;
        for (int y = y1a; y <= y2a; y++) {
            for (int x = 0; x < w; x++) {
                if (hasContent[y * w + x]) { ax1 = Math.min(ax1, x); ax2 = Math.max(ax2, x); }
            }
        }
        if (ax1 >= ax2) return 0;
        int aw = ax2 - ax1 + 1;

        int bx1 = w, bx2 = 0;
        for (int y = y1b; y <= y2b; y++) {
            for (int x = 0; x < w; x++) {
                if (hasContent[y * w + x]) { bx1 = Math.min(bx1, x); bx2 = Math.max(bx2, x); }
            }
        }
        if (bx1 >= bx2) return 0;
        int bw = bx2 - bx1 + 1;

        int ox1 = Math.max(ax1, bx1);
        int ox2 = Math.min(ax2, bx2);
        if (ox1 >= ox2) return 0;
        return (float) (ox2 - ox1) / Math.min(aw, bw);
    }

    // ── Helper: isFragment ──
    private boolean isFragment(int y1, int y2, int w, int h, boolean[] hasContent) {
        int x1 = w, x2 = 0;
        for (int y = y1; y <= y2; y++) {
            for (int x = 0; x < w; x++) {
                if (hasContent[y * w + x]) { x1 = Math.min(x1, x); x2 = Math.max(x2, x); }
            }
        }
        int bw = x1 < x2 ? x2 - x1 + 1 : 1;
        return bw < 300 || (y2 - y1 + 1) < 20;
    }

    // ── ONNX Region Classification ──

    /**
     * Classify regions as TEXT (label=1) or FORMULA (label=0).
     * Matches region-detect.js :: classifyRegions().
     */
    private List<RegionInfo> classifyRegions(Bitmap img, List<LineInfo> linesAndChunks, int[] bgColor) {
        if (!runner.isRegionDetReady()) {
            // Fallback: all text
            List<RegionInfo> fallback = new ArrayList<>();
            for (LineInfo lineInfo : linesAndChunks) {
                fallback.add(new RegionInfo(lineInfo.x, lineInfo.y, lineInfo.w, lineInfo.h, 1));
            }
            return fallback;
        }

        List<RegionInfo> allRegions = new ArrayList<>();
        int iw = img.getWidth(), ih = img.getHeight();

        for (LineInfo lineInfo : linesAndChunks) {
            int lx = lineInfo.x, ly = lineInfo.y, lw = lineInfo.w, lh = lineInfo.h;
            List<ChunkInfo> chunks = lineInfo.chunks;

            // ── Display formula (h > 100): multi-strip per-x voting ──
            if (lh > 100 && chunks.size() == 1) {
                int stripH = 64;
                int stripStride = 32;
                int step = 8;
                int numSteps = Math.max(1, (lw + step - 1) / step + 1);
                List<List<Float>> posVotes = new ArrayList<>();
                for (int i = 0; i <= numSteps; i++) posVotes.add(new ArrayList<>());

                List<float[]> allPatches = new ArrayList<>();
                List<int[]> allMeta = new ArrayList<>();

                for (int sy = 0; sy <= lh - stripH; sy += stripStride) {
                    Bitmap stripBmp = cropBitmap(img, lx, ly + sy, lw, stripH);
                    float stripScale = 64.0f / stripH;
                    int newW = Math.max(1, Math.round(lw * stripScale));
                    Bitmap scaled = Bitmap.createScaledBitmap(stripBmp, newW, 64, true);
                    stripBmp.recycle();

                    for (int px = 0; px <= newW - 64; px += 32) {
                        allPatches.add(RegionDetPreProcess.extractPatch(scaled, px, 0));
                        allMeta.add(new int[]{sy, px});
                    }
                    scaled.recycle();
                }

                if (allPatches.isEmpty()) {
                    float scale2 = 64.0f / lh;
                    int newW2 = Math.max(1, Math.round(lw * scale2));
                    Bitmap lineBmp = cropBitmap(img, lx, ly, lw, lh);
                    Bitmap scaled2 = Bitmap.createScaledBitmap(lineBmp, newW2, 64, true);
                    lineBmp.recycle();

                    if (newW2 < 64) {
                        Bitmap padded = Bitmap.createBitmap(64, 64, Bitmap.Config.ARGB_8888);
                        android.graphics.Canvas cv = new android.graphics.Canvas(padded);
                        cv.drawColor(android.graphics.Color.WHITE);
                        cv.drawBitmap(scaled2, (64 - newW2) / 2, 0, null);
                        allPatches.add(RegionDetPreProcess.createPatch(padded));
                        allMeta.add(new int[]{0, 0});
                        padded.recycle();
                    } else {
                        for (int px = 0; px <= newW2 - 64; px += 32) {
                            allPatches.add(RegionDetPreProcess.extractPatch(scaled2, px, 0));
                            allMeta.add(new int[]{0, px});
                        }
                        if (allPatches.isEmpty()) {
                            int px = Math.max(0, (newW2 - 64) / 2);
                            allPatches.add(RegionDetPreProcess.extractPatch(scaled2, px, 0));
                            allMeta.add(new int[]{0, px});
                        }
                    }
                    scaled2.recycle();
                }

                float[] chineseConfs = runBatchRegionInference(allPatches);

                for (int i = 0; i < allMeta.size(); i++) {
                    int metaSy = allMeta.get(i)[0];
                    int metaPx = allMeta.get(i)[1];
                    float cconf = chineseConfs[i];
                    float scale = 64.0f / stripH;
                    int origX1 = lx + Math.round(metaPx / scale);
                    int origX2 = lx + Math.round((metaPx + 64) / scale);
                    int i1 = Math.max(0, Math.round((origX1 - lx) / (float) step));
                    int i2 = Math.min(numSteps, Math.round((origX2 - lx) / (float) step));
                    for (int idx = i1; idx <= i2 && idx < posVotes.size(); idx++) {
                        posVotes.get(idx).add(cconf);
                    }
                }

                // Assign labels
                Integer[] posLabels = new Integer[posVotes.size()];
                for (int i = 0; i < posVotes.size(); i++) {
                    List<Float> votes = posVotes.get(i);
                    if (votes.isEmpty()) continue;
                    float sum = 0;
                    for (float v : votes) sum += v;
                    float avg = sum / votes.size();
                    posLabels[i] = avg >= 0.25f ? 1 : 0;
                }

                // Fill null gaps
                for (int i = 0; i < posLabels.length; i++) {
                    if (posLabels[i] == null) {
                        Integer left = null;
                        for (int j = i - 1; j >= 0; j--) { if (posLabels[j] != null) { left = posLabels[j]; break; } }
                        Integer right = null;
                        for (int j = i + 1; j < posLabels.length; j++) { if (posLabels[j] != null) { right = posLabels[j]; break; } }
                        posLabels[i] = left != null ? left : (right != null ? right : 0);
                    }
                }

                // Remove islands
                for (int pass = 0; pass < 2; pass++) {
                    for (int i = 1; i < posLabels.length - 1; i++) {
                        if (posLabels[i - 1] != null && posLabels[i + 1] != null
                            && posLabels[i - 1].intValue() == posLabels[i + 1].intValue()
                            && posLabels[i].intValue() != posLabels[i - 1].intValue()) {
                            posLabels[i] = posLabels[i - 1];
                        }
                    }
                    for (int i = 1; i < posLabels.length - 2; i++) {
                        if (posLabels[i - 1] != null && posLabels[i + 2] != null
                            && posLabels[i - 1].intValue() == posLabels[i + 2].intValue()
                            && posLabels[i].intValue() != posLabels[i - 1].intValue()
                            && posLabels[i + 1].intValue() != posLabels[i - 1].intValue()) {
                            posLabels[i] = posLabels[i - 1];
                            posLabels[i + 1] = posLabels[i - 1];
                        }
                    }
                }

                // Build sub-regions
                int subStart = 0;
                for (int i = 1; i < posLabels.length; i++) {
                    if (posLabels[i] != posLabels[subStart]) {
                        int sx = lx + subStart * step;
                        int ex = lx + Math.min(lw, i * step);
                        int subW = ex - sx;
                        if (subW >= 20) {
                            allRegions.add(new RegionInfo(sx, ly, subW, lh, posLabels[subStart]));
                        }
                        subStart = i;
                    }
                }
                int sx = lx + subStart * step;
                int ex = lx + lw;
                int subW = ex - sx;
                if (subW >= 20) {
                    allRegions.add(new RegionInfo(sx, ly, subW, lh, posLabels[subStart]));
                }
                continue;
            }

            // ── Tall-ish line (60-100px): half-split classification ──
            if (lh >= 60 && lh <= 100) {
                int midY = lh / 2;

                int topLabel = classifyHalf(img, lx, ly, lw, midY, 0, bgColor);
                int botLabel = classifyHalf(img, lx, ly, lw, lh - midY, midY, bgColor);

                if (topLabel != botLabel) {
                    allRegions.add(new RegionInfo(lx, ly, lw, midY, topLabel));
                    allRegions.add(new RegionInfo(lx, ly + midY, lw, lh - midY, botLabel));
                    continue;
                }
            }

            // ── Normal line: chunk-level classification ──
            float scaleFactor = 64.0f / lh;
            int newW = Math.max(1, Math.round(lw * scaleFactor));

            Bitmap lineBmp = cropBitmap(img, lx, ly, lw, lh);
            Bitmap scaled = Bitmap.createScaledBitmap(lineBmp, newW, 64, true);
            lineBmp.recycle();

            List<float[]> patches = new ArrayList<>();
            List<Integer> positions = new ArrayList<>();

            for (int px = 0; px <= newW - 64; px += 32) {
                patches.add(RegionDetPreProcess.extractPatch(scaled, px, 0));
                positions.add(px);
            }
            if (patches.isEmpty()) {
                if (newW < 64) {
                    Bitmap padded = Bitmap.createBitmap(64, 64, Bitmap.Config.ARGB_8888);
                    android.graphics.Canvas cv = new android.graphics.Canvas(padded);
                    cv.drawColor(android.graphics.Color.WHITE);
                    cv.drawBitmap(scaled, (64 - newW) / 2, 0, null);
                    patches.add(RegionDetPreProcess.createPatch(padded));
                    positions.add(0);
                    padded.recycle();
                } else {
                    int px = Math.max(0, (newW - 64) / 2);
                    patches.add(RegionDetPreProcess.extractPatch(scaled, px, 0));
                    positions.add(px);
                }
            }
            scaled.recycle();

            float[] chineseConfs = runBatchRegionInference(patches);

            // Classify each chunk
            int[] chunkLabels = new int[chunks.size()];
            for (int ci = 0; ci < chunks.size(); ci++) {
                ChunkInfo chunk = chunks.get(ci);
                float textThreshold = chunk.w < 55 ? 0.65f : 0.40f;
                float textWeight = 0, formWeight = 0;
                int chunkX1 = chunk.x - lx;
                int chunkX2 = chunkX1 + chunk.w;

                for (int pi = 0; pi < positions.size(); pi++) {
                    int px = positions.get(pi);
                    float cconf = chineseConfs[pi];
                    int winX1 = Math.round(px / scaleFactor);
                    int winX2 = Math.round((px + 64) / scaleFactor);
                    int overlap = Math.min(winX2, chunkX2) - Math.max(winX1, chunkX1);
                    if (overlap > 0) {
                        if (cconf >= textThreshold) textWeight += overlap;
                        else formWeight += overlap;
                    }
                }
                chunkLabels[ci] = (textWeight + formWeight == 0) ? 0 :
                    (textWeight >= formWeight ? 1 : 0);
            }

            // Build sub-regions from consecutive same-label chunks
            if (chunks.size() > 0) {
                int subStart = 0;
                for (int ci = 1; ci < chunks.size(); ci++) {
                    if (chunkLabels[ci] != chunkLabels[subStart]) {
                        ChunkInfo prev = chunks.get(ci - 1);
                        int subW = (prev.x + prev.w) - chunks.get(subStart).x;
                        if (subW >= 20) {
                            allRegions.add(new RegionInfo(chunks.get(subStart).x, ly, subW, lh, chunkLabels[subStart]));
                        }
                        subStart = ci;
                    }
                }
                ChunkInfo last = chunks.get(chunks.size() - 1);
                int subW = (last.x + last.w) - chunks.get(subStart).x;
                if (subW >= 20) {
                    allRegions.add(new RegionInfo(chunks.get(subStart).x, ly, subW, lh, chunkLabels[subStart]));
                }
            }
        }

        // ── Narrow TEXT reclassification ──
        if (allRegions.size() >= 3) {
            for (int i = 1; i < allRegions.size() - 1; i++) {
                RegionInfo cur = allRegions.get(i);
                if (cur.w >= 55 || cur.label != 1) continue;
                RegionInfo left = allRegions.get(i - 1);
                RegionInfo right = allRegions.get(i + 1);
                if (left.label != 0 || right.label != 0) continue;
                int leftGap = cur.x - (left.x + left.w);
                int rightGap = right.x - (cur.x + cur.w);
                int vDiffL = Math.abs(cur.y - left.y);
                int vDiffR = Math.abs(cur.y - right.y);
                if (leftGap <= 24 && rightGap <= 24
                    && vDiffL <= Math.max(cur.h, left.h) * 0.3f
                    && vDiffR <= Math.max(cur.h, right.h) * 0.3f) {
                    allRegions.set(i, new RegionInfo(cur.x, cur.y, cur.w, cur.h, 0));
                }
            }
        }

        // ── Merge adjacent same-label regions ──
        List<RegionInfo> merged = new ArrayList<>();
        int charGap = 28;
        for (RegionInfo region : allRegions) {
            boolean attached = false;
            if (!merged.isEmpty()) {
                RegionInfo prev = merged.get(merged.size() - 1);
                if (prev.label == region.label) {
                    int hGap = Math.abs((prev.x + prev.w) - region.x);
                    int vDiff = Math.abs(region.y - prev.y);
                    float hRatio = Math.abs(region.h - prev.h) / (float) Math.max(region.h, prev.h);
                    if (hGap <= charGap && vDiff <= Math.max(prev.h, region.h) * 0.3f && hRatio <= 0.3f) {
                        int nx = Math.min(prev.x, region.x);
                        int ny = Math.min(prev.y, region.y);
                        int nw = Math.max(prev.x + prev.w, region.x + region.w) - nx;
                        int nh = Math.max(prev.y + prev.h, region.y + region.h) - ny;
                        merged.set(merged.size() - 1, new RegionInfo(nx, ny, nw, nh, prev.label));
                        attached = true;
                    }
                }
            }
            if (!attached) merged.add(region);
        }

        merged.sort((a, b) -> a.y != b.y ? a.y - b.y : a.x - b.x);
        return merged;
    }

    // ── Classify half of a tall-ish line ──
    private int classifyHalf(Bitmap img, int lx, int ly, int lw, int halfH, int yOffset, int[] bgColor) {
        Bitmap halfBmp = cropBitmap(img, lx, ly + yOffset, lw, halfH);
        float scale = 64.0f / halfH;
        int newW = Math.max(1, Math.round(lw * scale));
        Bitmap scaled = Bitmap.createScaledBitmap(halfBmp, newW, 64, true);
        halfBmp.recycle();

        List<float[]> patches = new ArrayList<>();
        for (int px = 0; px <= newW - 64; px += 32) {
            patches.add(RegionDetPreProcess.extractPatch(scaled, px, 0));
        }
        if (patches.isEmpty()) {
            if (newW < 64) {
                Bitmap padded = Bitmap.createBitmap(64, 64, Bitmap.Config.ARGB_8888);
                android.graphics.Canvas cv = new android.graphics.Canvas(padded);
                cv.drawColor(android.graphics.Color.WHITE);
                cv.drawBitmap(scaled, (64 - newW) / 2, 0, null);
                patches.add(RegionDetPreProcess.createPatch(padded));
                padded.recycle();
            } else {
                int px = Math.max(0, (newW - 64) / 2);
                patches.add(RegionDetPreProcess.extractPatch(scaled, px, 0));
            }
        }
        scaled.recycle();

        float[] confs = runBatchRegionInference(patches);
        int formCount = 0, textCount = 0;
        for (float c : confs) {
            if (c <= 0.5f) formCount++;
            else textCount++;
        }
        return formCount >= textCount ? 0 : 1;
    }

    // ── Batch region inference on chinese_detector.onnx ──

    private float[] runBatchRegionInference(List<float[]> patches) {
        if (patches.isEmpty()) return new float[0];
        int batchSize = 64;
        List<Float> allConfs = new ArrayList<>();

        try {
            for (int start = 0; start < patches.size(); start += batchSize) {
                int end = Math.min(start + batchSize, patches.size());
                int n = end - start;

                float[] tensorData = new float[n * 3 * 64 * 64];
                for (int i = 0; i < n; i++) {
                    System.arraycopy(patches.get(start + i), 0, tensorData, i * 3 * 64 * 64, 3 * 64 * 64);
                }

                ai.onnxruntime.OrtSession.Result result = runner.runRegionDet(
                    FloatBuffer.wrap(tensorData), n);

                float[] logits = tensorData(result, runner.getRegionDetOutputName());

                for (int i = 0; i < n; i++) {
                    float[] pair = {logits[i * 2], logits[i * 2 + 1]};
                    float[] probs = stableSoftmax(pair);
                    allConfs.add(probs[1]); // class 1 = text
                }
            }
        } catch (Exception e) {
            Log.e(TAG, "Region batch inference failed", e);
            for (int i = 0; i < patches.size(); i++) allConfs.add(0.5f);
        }

        float[] result = new float[allConfs.size()];
        for (int i = 0; i < result.length; i++) result[i] = allConfs.get(i);
        return result;
    }

    private static float[] stableSoftmax(float[] logits) {
        float max = Math.max(logits[0], logits[1]);
        double sum = Math.exp(logits[0] - max) + Math.exp(logits[1] - max);
        return new float[]{(float) (Math.exp(logits[0] - max) / sum),
                           (float) (Math.exp(logits[1] - max) / sum)};
    }

    // ══════════════════════════════════════════════
    // BITMAP UTILITIES
    // ══════════════════════════════════════════════

    public static Bitmap cropBitmap(Bitmap src, int x, int y, int w, int h) {
        int cx = Math.max(0, x);
        int cy = Math.max(0, y);
        int cw = Math.min(w, src.getWidth() - cx);
        int ch = Math.min(h, src.getHeight() - cy);
        return Bitmap.createBitmap(src, cx, cy, Math.max(1, cw), Math.max(1, ch));
    }

    public static float[] tensorDataStatic(ai.onnxruntime.OrtSession.Result result, String name) {
        java.nio.FloatBuffer buf = ((ai.onnxruntime.OnnxTensor)
            result.get(name).get()).getFloatBuffer();
        float[] data = new float[buf.remaining()];
        buf.get(data);
        return data;
    }

    public static long[] tensorShapeStatic(ai.onnxruntime.OrtSession.Result result, String name) {
        return ((ai.onnxruntime.OnnxTensor) result.get(name).get()).getInfo().getShape();
    }

    // ══════════════════════════════════════════════
    // INNER CLASSES
    // ══════════════════════════════════════════════

    /** Result of OCR recognition. */
    public static class RecognizeResult {
        public final String text; // LaTeX for formula, plain text for text mode
        public final float confidence;
        public final int regionCount;
        public final int timeMs;

        public RecognizeResult(String text, float confidence, int regionCount, int timeMs) {
            this.text = text;
            this.confidence = confidence;
            this.regionCount = regionCount;
            this.timeMs = timeMs;
        }
    }

    /** Result of mixed-mode recognition. */
    public static class MixedResult {
        public final List<RegionResult> regions;
        public final int timeMs;
        public String formattedText = "";

        public MixedResult(List<RegionResult> regions, int timeMs) {
            this.regions = regions;
            this.timeMs = timeMs;
        }

        public static class RegionResult {
            public final int x, y, w, h;
            public final String type; // "formula" or "text"
            public final String text;
            public final float confidence;

            public RegionResult(int x, int y, int w, int h, String type, String text, float confidence) {
                this.x = x; this.y = y; this.w = w; this.h = h;
                this.type = type;
                this.text = text;
                this.confidence = confidence;
            }
        }
    }

    // ── Internal data classes for layout analysis ──

    static class PixelBlock {
        final int x, y, w, h;
        PixelBlock(int x, int y, int w, int h) { this.x = x; this.y = y; this.w = w; this.h = h; }
    }

    static class LineInfo {
        final int x, y, w, h;
        final List<ChunkInfo> chunks;
        LineInfo(int x, int y, int w, int h) { this(x, y, w, h, new ArrayList<>()); }
        LineInfo(int x, int y, int w, int h, List<ChunkInfo> chunks) {
            this.x = x; this.y = y; this.w = w; this.h = h; this.chunks = chunks;
        }
    }

    static class ChunkInfo {
        final int x, y, w, h;
        ChunkInfo(int x, int y, int w, int h) { this.x = x; this.y = y; this.w = w; this.h = h; }
    }

    static class RegionInfo {
        final int x, y, w, h;
        final int label; // 0=formula, 1=text
        RegionInfo(int x, int y, int w, int h, int label) {
            this.x = x; this.y = y; this.w = w; this.h = h; this.label = label;
        }
    }

    // ── Safe tensor data extraction (ORT 1.21 Result.get() returns Optional) ──

    private static float[] tensorData(ai.onnxruntime.OrtSession.Result result, String name) {
        java.nio.FloatBuffer buf = ((ai.onnxruntime.OnnxTensor)
            result.get(name).get()).getFloatBuffer();
        float[] data = new float[buf.remaining()];
        buf.get(data);
        return data;
    }

    private static long[] tensorShape(ai.onnxruntime.OrtSession.Result result, String name) {
        return ((ai.onnxruntime.OnnxTensor) result.get(name).get()).getInfo().getShape();
    }

    public void release() {
        runner.release();
    }
}
