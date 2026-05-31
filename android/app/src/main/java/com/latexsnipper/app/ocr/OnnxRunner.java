package com.latexsnipper.app.ocr;

import android.content.Context;
import android.util.Log;

import java.io.InputStream;
import java.nio.ByteBuffer;
import java.nio.FloatBuffer;
import java.util.Collections;
import java.util.Map;

import ai.onnxruntime.OnnxTensor;
import ai.onnxruntime.OrtEnvironment;
import ai.onnxruntime.OrtException;
import ai.onnxruntime.OrtSession;

/**
 * OnnxRunner — manages ONNX Runtime Android sessions for all OCR models.
 *
 * Provides load/run/release lifecycle. Each model (encoder, decoder, det, etc.)
 * gets its own OrtSession. All sessions share a single OrtEnvironment.
 */
public class OnnxRunner {

    private static final String TAG = "OnnxRunner";

    // Acceleration mode: "gpu" (NNAPI) or "cpu"
    private String accelerationMode = "gpu";

    private OrtEnvironment env;
    private boolean initialized = false;

    // Sessions (null = not loaded)
    private OrtSession formulaDetSession;
    private OrtSession encoderSession;
    private OrtSession decoderSession;
    private OrtSession textDetSession;
    private OrtSession textRecSession;
    private OrtSession regionDetSession;
    private OrtSession docOriSession;

    // Cached input/output names
    private String formulaDetInput;
    private String formulaDetOutput;
    private String encoderInput;
    private String encoderOutput;
    private String decoderInputIds;
    private String decoderInputHidden;
    private String decoderOutput;
    private String textDetInput;
    private String textDetOutput;
    private String textRecInput;
    private String textRecOutput;
    private String regionDetInput;
    private String regionDetOutput;
    private String docOriInput;
    private String docOriOutput;

    public OnnxRunner() {}

    /** Set acceleration mode before loading models. "gpu" (NNAPI) or "cpu". */
    public void setAccelerationMode(String mode) {
        this.accelerationMode = (mode != null && mode.equals("cpu")) ? "cpu" : "gpu";
        Log.d(TAG, "Acceleration mode: " + this.accelerationMode);
    }

    /** Initialize the ONNX Runtime environment (call once). */
    public synchronized void init() {
        if (initialized) return;
        env = OrtEnvironment.getEnvironment();
        initialized = true;
        Log.d(TAG, "OrtEnvironment initialized");
    }

    // ── Model loading helpers ──

    private ByteBuffer loadAsset(Context ctx, String assetPath) {
        try {
            InputStream is = ctx.getAssets().open(assetPath);
            byte[] bytes = new byte[is.available()];
            int offset = 0;
            while (offset < bytes.length) {
                int read = is.read(bytes, offset, bytes.length - offset);
                if (read < 0) break;
                offset += read;
            }
            is.close();
            ByteBuffer bb = ByteBuffer.allocateDirect(bytes.length);
            bb.put(bytes);
            bb.rewind();
            return bb;
        } catch (Exception e) {
            throw new RuntimeException("Failed to load asset: " + assetPath, e);
        }
    }

    private OrtSession createSession(ByteBuffer modelData) {
        try {
            OrtSession.SessionOptions opts = new OrtSession.SessionOptions();
            opts.setIntraOpNumThreads(4);
            opts.setOptimizationLevel(OrtSession.SessionOptions.OptLevel.ALL_OPT);

            if ("gpu".equals(accelerationMode)) {
                // GPU acceleration via Android NNAPI (uses OpenGL/Vulkan/NPU under the hood)
                try {
                    opts.addNnapi();
                } catch (Exception e) {
                    Log.w(TAG, "NNAPI not available, using CPU: " + e.getMessage());
                }
            } else {
                Log.d(TAG, "CPU mode (NNAPI disabled)");
            }

            return env.createSession(modelData, opts);
        } catch (OrtException e) {
            throw new RuntimeException("Failed to create ONNX session", e);
        }
    }

    private String getInputName(OrtSession session) {
        return session.getInputNames().iterator().next();
    }

    private String getOutputName(OrtSession session) {
        return session.getOutputNames().iterator().next();
    }

    // ── Individual model loaders ──

    public void loadFormulaDetModel(Context ctx) {
        init();
        formulaDetSession = createSession(loadAsset(ctx,
            "public/models/mathcraft-formula-det/mathcraft-mfd.onnx"));
        formulaDetInput = getInputName(formulaDetSession);
        formulaDetOutput = getOutputName(formulaDetSession);
        Log.d(TAG, "FormulaDet loaded: " + formulaDetInput + " -> " + formulaDetOutput);
    }

    public void loadFormulaRecModels(Context ctx) {
        init();
        encoderSession = createSession(loadAsset(ctx,
            "public/models/mathcraft-formula-rec/encoder_model.onnx"));
        encoderInput = getInputName(encoderSession);
        encoderOutput = getOutputName(encoderSession);
        Log.d(TAG, "Encoder loaded: " + encoderInput + " -> " + encoderOutput);

        decoderSession = createSession(loadAsset(ctx,
            "public/models/mathcraft-formula-rec/decoder_model.onnx"));

        // Decoder has 2 inputs: input_ids and encoder_hidden_states
        String[] decNames = decoderSession.getInputNames().toArray(new String[0]);
        decoderInputIds = decNames[0];
        decoderInputHidden = decNames[1];
        decoderOutput = getOutputName(decoderSession);
        Log.d(TAG, "Decoder loaded: inputs=" + decoderInputIds + "," + decoderInputHidden
            + " output=" + decoderOutput);
    }

    public void loadTextDetModel(Context ctx) {
        init();
        textDetSession = createSession(loadAsset(ctx,
            "public/models/mathcraft-text-det/ppocrv5_mobile_det.onnx"));
        textDetInput = getInputName(textDetSession);
        textDetOutput = getOutputName(textDetSession);
        Log.d(TAG, "TextDet loaded: " + textDetInput + " -> " + textDetOutput);
    }

    public void loadTextRecModel(Context ctx) {
        init();
        textRecSession = createSession(loadAsset(ctx,
            "public/models/mathcraft-text-rec/ppocrv5_mobile_rec.onnx"));
        textRecInput = getInputName(textRecSession);
        textRecOutput = getOutputName(textRecSession);
        Log.d(TAG, "TextRec loaded: " + textRecInput + " -> " + textRecOutput);
    }

    public void loadRegionDetModel(Context ctx) {
        init();
        regionDetSession = createSession(loadAsset(ctx,
            "public/models/chinese_detector.onnx"));
        regionDetInput = getInputName(regionDetSession);
        regionDetOutput = getOutputName(regionDetSession);
        Log.d(TAG, "RegionDet loaded: " + regionDetInput + " -> " + regionDetOutput);
    }

    public void loadDocOriModel(Context ctx) {
        init();
        docOriSession = createSession(loadAsset(ctx,
            "public/models/mathcraft-text-rec/pplcnet_doc_ori.onnx"));
        docOriInput = getInputName(docOriSession);
        docOriOutput = getOutputName(docOriSession);
        Log.d(TAG, "DocOri loaded: " + docOriInput + " -> " + docOriOutput);
    }

    // ── Inference methods ──

    /** Run formula detection: [1,3,768,768] float32 → output tensor. */
    public OrtSession.Result runFormulaDet(FloatBuffer input) throws OrtException {
        long[] shape = {1, 3, DetPreProcess.TARGET_SIZE, DetPreProcess.TARGET_SIZE};
        OnnxTensor tensor = OnnxTensor.createTensor(env, input, shape);
        try {
            return formulaDetSession.run(Collections.singletonMap(formulaDetInput, tensor));
        } finally {
            tensor.close();
        }
    }

    /** Run encoder: [1,3,384,384] float32 → encoder_hidden_states. */
    public OrtSession.Result runEncoder(FloatBuffer input) throws OrtException {
        long[] shape = {1, 3, 384, 384};
        OnnxTensor tensor = OnnxTensor.createTensor(env, input, shape);
        try {
            return encoderSession.run(Collections.singletonMap(encoderInput, tensor));
        } finally {
            tensor.close();
        }
    }

    /** Run decoder step: input_ids + encoder_hidden_states → logits. */
    public OrtSession.Result runDecoder(long[] inputIds, int[] inputShape,
                                         float[] encoderStates, int[] encShape) throws OrtException {
        OnnxTensor idsTensor = OnnxTensor.createTensor(env,
            java.nio.LongBuffer.wrap(inputIds), toLongArray(inputShape));
        OnnxTensor hiddenTensor = OnnxTensor.createTensor(env,
            FloatBuffer.wrap(encoderStates), toLongArray(encShape));
        try {
            Map<String, OnnxTensor> inputs = new java.util.LinkedHashMap<>();
            inputs.put(decoderInputIds, idsTensor);
            inputs.put(decoderInputHidden, hiddenTensor);
            return decoderSession.run(inputs);
        } finally {
            idsTensor.close();
            hiddenTensor.close();
        }
    }

    /** Run text detection: [1,3,H,W] → probability map. */
    public OrtSession.Result runTextDet(FloatBuffer input, long[] shape) throws OrtException {
        OnnxTensor tensor = OnnxTensor.createTensor(env, input, shape);
        try {
            return textDetSession.run(Collections.singletonMap(textDetInput, tensor));
        } finally {
            tensor.close();
        }
    }

    /** Run text recognition: [1,3,48,320] → logits. */
    public OrtSession.Result runTextRec(FloatBuffer input) throws OrtException {
        long[] shape = {1, 3, TextRecPreProcess.TARGET_H, TextRecPreProcess.MAX_W};
        OnnxTensor tensor = OnnxTensor.createTensor(env, input, shape);
        try {
            return textRecSession.run(Collections.singletonMap(textRecInput, tensor));
        } finally {
            tensor.close();
        }
    }

    /** Run region classification (batch): [N,3,64,64] → [N,2] logits. */
    public OrtSession.Result runRegionDet(FloatBuffer input, int batchSize) throws OrtException {
        long[] shape = {batchSize, 3, 64, 64};
        OnnxTensor tensor = OnnxTensor.createTensor(env, input, shape);
        try {
            return regionDetSession.run(Collections.singletonMap(regionDetInput, tensor));
        } finally {
            tensor.close();
        }
    }

    /** Run doc orientation: [1,3,224,224] → [1,4] logits. */
    public OrtSession.Result runDocOri(FloatBuffer input) throws OrtException {
        long[] shape = {1, 3, 224, 224};
        OnnxTensor tensor = OnnxTensor.createTensor(env, input, shape);
        try {
            return docOriSession.run(Collections.singletonMap(docOriInput, tensor));
        } finally {
            tensor.close();
        }
    }

    // ── Info accessors needed by FormulaRecPostProcess ──

    public String getEncoderOutputName() { return encoderOutput; }
    public String getDecoderOutputName() { return decoderOutput; }
    public String getDecoderInputIdsName() { return decoderInputIds; }
    public String getDecoderInputHiddenName() { return decoderInputHidden; }
    public String getFormulaDetOutputName() { return formulaDetOutput; }
    public String getTextDetOutputName() { return textDetOutput; }
    public String getTextRecOutputName() { return textRecOutput; }
    public String getRegionDetOutputName() { return regionDetOutput; }
    public String getDocOriOutputName() { return docOriOutput; }

    // ── Status checks ──

    public boolean isFormulaDetReady() { return formulaDetSession != null; }
    public boolean isEncoderReady() { return encoderSession != null; }
    public boolean isDecoderReady() { return decoderSession != null; }
    public boolean isFormulaRecReady() { return encoderSession != null && decoderSession != null; }
    public boolean isTextDetReady() { return textDetSession != null; }
    public boolean isTextRecReady() { return textRecSession != null; }
    public boolean isRegionDetReady() { return regionDetSession != null; }
    public boolean isDocOriReady() { return docOriSession != null; }

    // ── Cleanup ──

    public void release() {
        try {
            if (formulaDetSession != null) formulaDetSession.close();
            if (encoderSession != null) encoderSession.close();
            if (decoderSession != null) decoderSession.close();
            if (textDetSession != null) textDetSession.close();
            if (textRecSession != null) textRecSession.close();
            if (regionDetSession != null) regionDetSession.close();
            if (docOriSession != null) docOriSession.close();
        } catch (OrtException e) {
            Log.e(TAG, "Error closing sessions", e);
        }
        // OrtEnvironment is a singleton, don't close it
    }

    // ── Utilities ──

    private static long[] toLongArray(int[] arr) {
        long[] result = new long[arr.length];
        for (int i = 0; i < arr.length; i++) result[i] = arr[i];
        return result;
    }
}
