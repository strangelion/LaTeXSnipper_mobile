package com.latexsnipper.app.ocr;

import android.util.Log;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.File;
import java.io.FileInputStream;
import java.io.InputStreamReader;

/**
 * ModelConfig — standard model metadata from config.json.
 *
 * Follows HuggingFace ONNX + PaddleOCR conventions.
 * Every model package should include a config.json describing:
 *   - model_type: architecture type (trocr, dbnet, crnn_ctc, yolov8, pplcnet)
 *   - input: shape, dtype, normalization params
 *   - output: name, shape
 *   - preprocessing: resize, padding, color format
 *   - postprocessing/decoding: type-specific parameters
 *
 * Third-party models can be used by providing config.json + model.onnx
 * in the standard directory structure: {category}/{variantId}/
 */
public class ModelConfig {

    private static final String TAG = "ModelConfig";

    public final String modelType;
    public final String modelFamily;
    public final InputConfig input;
    public final OutputConfig output;
    public final PreprocessConfig preprocessing;
    public final JSONObject raw; // Full config for type-specific fields

    private ModelConfig(String modelType, String modelFamily,
                        InputConfig input, OutputConfig output,
                        PreprocessConfig preprocessing, JSONObject raw) {
        this.modelType = modelType;
        this.modelFamily = modelFamily;
        this.input = input;
        this.output = output;
        this.preprocessing = preprocessing;
        this.raw = raw;
    }

    // ── Sub-configs ──

    public static class InputConfig {
        public final String name;
        public final long[] shape;   // negative = dynamic dimension
        public final String dtype;
        public final float[] mean;   // normalization mean, null if none
        public final float[] std;    // normalization std, null if none

        public InputConfig(String name, long[] shape, String dtype,
                           float[] mean, float[] std) {
            this.name = name;
            this.shape = shape;
            this.dtype = dtype;
            this.mean = mean;
            this.std = std;
        }

        /** Get fixed spatial dimensions (H, W) from shape. Returns null if dynamic. */
        public int[] getFixedSpatialDims() {
            if (shape.length >= 4 && shape[2] > 0 && shape[3] > 0) {
                return new int[]{(int) shape[2], (int) shape[3]};
            }
            return null;
        }
    }

    public static class OutputConfig {
        public final String name;
        public final long[] shape;

        public OutputConfig(String name, long[] shape) {
            this.name = name;
            this.shape = shape;
        }
    }

    public static class PreprocessConfig {
        public final int resizeWidth;
        public final int resizeHeight;
        public final boolean keepRatio;
        public final int padValue;
        public final int divisibleBy;

        public PreprocessConfig(int resizeWidth, int resizeHeight,
                                boolean keepRatio, int padValue, int divisibleBy) {
            this.resizeWidth = resizeWidth;
            this.resizeHeight = resizeHeight;
            this.keepRatio = keepRatio;
            this.padValue = padValue;
            this.divisibleBy = divisibleBy;
        }
    }

    // ── Loading ──

    /**
     * Load config.json from model directory.
     * @param modelDir e.g., /data/data/.../models/formula-rec/trocr-deit/
     */
    public static ModelConfig load(File modelDir) {
        File configFile = new File(modelDir, "config.json");
        if (!configFile.exists()) {
            Log.w(TAG, "No config.json in " + modelDir.getAbsolutePath());
            return null;
        }
        try {
            FileInputStream fis = new FileInputStream(configFile);
            BufferedReader br = new BufferedReader(new InputStreamReader(fis, "UTF-8"));
            StringBuilder sb = new StringBuilder();
            String line;
            while ((line = br.readLine()) != null) sb.append(line);
            br.close();
            return parse(sb.toString());
        } catch (Exception e) {
            Log.e(TAG, "Failed to read config.json: " + e.getMessage());
            return null;
        }
    }

    /**
     * Parse config.json string into ModelConfig.
     */
    public static ModelConfig parse(String json) {
        try {
            JSONObject root = new JSONObject(json);

            String modelType = root.optString("model_type", "unknown");
            String modelFamily = root.optString("model_family", "");

            // Parse input
            InputConfig input = null;
            if (root.has("input")) {
                JSONObject inp = root.getJSONObject("input");
                String name = inp.optString("name", "input");
                long[] shape = parseShape(inp.optJSONArray("shape"));
                String dtype = inp.optString("dtype", "float32");
                float[] mean = parseFloatArray(inp.optJSONArray("mean"));
                float[] std = parseFloatArray(inp.optJSONArray("std"));
                input = new InputConfig(name, shape, dtype, mean, std);
            }

            // Parse output
            OutputConfig output = null;
            if (root.has("output")) {
                JSONObject out = root.getJSONObject("output");
                String name = out.optString("name", "output");
                long[] shape = parseShape(out.optJSONArray("shape"));
                output = new OutputConfig(name, shape);
            }

            // Parse preprocessing
            PreprocessConfig preprocessing = new PreprocessConfig(0, 0, true, 0, 0);
            if (root.has("preprocessing")) {
                JSONObject pre = root.getJSONObject("preprocessing");
                JSONObject resize = pre.optJSONObject("resize");
                int rw = resize != null ? resize.optInt("width", 0) : 0;
                int rh = resize != null ? resize.optInt("height", 0) : 0;
                boolean kr = resize != null ? resize.optBoolean("keep_ratio", true) : true;
                int pv = resize != null ? resize.optInt("pad_value", 0) : 0;
                int db = pre.optInt("divisible_by", 0);
                preprocessing = new PreprocessConfig(rw, rh, kr, pv, db);
            }

            return new ModelConfig(modelType, modelFamily, input, output, preprocessing, root);
        } catch (Exception e) {
            Log.e(TAG, "Failed to parse config.json: " + e.getMessage());
            return null;
        }
    }

    /**
     * Find the primary ONNX model file in a model directory.
     * Tries standard names in order: model.onnx, *.onnx (first found).
     * For encoder/decoder pairs (TroCR): returns null (use findEncoderFile/findDecoderFile).
     */
    public static File findModelFile(File modelDir) {
        // Standard single-model name
        File model = new File(modelDir, "model.onnx");
        if (model.exists()) return model;

        // Fallback: find any .onnx file that isn't encoder/decoder
        File[] onnxFiles = modelDir.listFiles((dir, name) ->
            name.endsWith(".onnx") && !name.startsWith("encoder_") && !name.startsWith("decoder_"));
        if (onnxFiles != null && onnxFiles.length > 0) return onnxFiles[0];

        return null;
    }

    /**
     * Find encoder ONNX file (for multi-file models like TroCR).
     */
    public static File findEncoderFile(File modelDir) {
        File f = new File(modelDir, "encoder.onnx");
        if (f.exists()) return f;
        f = new File(modelDir, "encoder_model.onnx");
        if (f.exists()) return f;
        // Find any file with "encoder" in name
        File[] matches = modelDir.listFiles((dir, name) ->
            name.contains("encoder") && name.endsWith(".onnx"));
        if (matches != null && matches.length > 0) return matches[0];
        return null;
    }

    /**
     * Find decoder ONNX file (for multi-file models like TroCR).
     */
    public static File findDecoderFile(File modelDir) {
        File f = new File(modelDir, "decoder.onnx");
        if (f.exists()) return f;
        f = new File(modelDir, "decoder_model.onnx");
        if (f.exists()) return f;
        File[] matches = modelDir.listFiles((dir, name) ->
            name.contains("decoder") && name.endsWith(".onnx"));
        if (matches != null && matches.length > 0) return matches[0];
        return null;
    }

    /**
     * Find tokenizer/vocabulary file in model directory.
     * Returns the File if found, null otherwise.
     */
    public static File findTokenizerFile(File modelDir) {
        // HuggingFace convention
        File f = new File(modelDir, "tokenizer.json");
        if (f.exists()) return f;
        // PP-OCR convention
        f = new File(modelDir, "ppocr_keys.txt");
        if (f.exists()) return f;
        f = new File(modelDir, "ppocrv5_keys.txt");
        if (f.exists()) return f;
        // Generic dictionary file
        f = new File(modelDir, "dict.txt");
        if (f.exists()) return f;
        f = new File(modelDir, "keys.txt");
        if (f.exists()) return f;
        return null;
    }

    // ── Helpers ──

    private static long[] parseShape(JSONArray arr) {
        if (arr == null) return new long[0];
        long[] shape = new long[arr.length()];
        for (int i = 0; i < arr.length(); i++) {
            shape[i] = arr.optLong(i, -1);
        }
        return shape;
    }

    private static float[] parseFloatArray(JSONArray arr) {
        if (arr == null) return null;
        float[] result = new float[arr.length()];
        for (int i = 0; i < arr.length(); i++) {
            result[i] = (float) arr.optDouble(i, 0);
        }
        return result;
    }

    @Override
    public String toString() {
        return "ModelConfig{type=" + modelType + ", family=" + modelFamily
            + ", input=" + (input != null ? input.name : "null") + "}";
    }
}
