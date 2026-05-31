package com.latexsnipper.app.ocr;

import android.content.Context;
import android.util.Log;

import org.json.JSONException;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.nio.FloatBuffer;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;

/**
 * FormulaRecPostProcess — tokenization, beam search decoding and LaTeX post-processing
 * for TrOCR formula recognition.
 * <p>
 * Matches ocr-engine.js: loadTokenizer() + recognize() + repairLatex() + sanitizeLatex().
 */
public class FormulaRecPostProcess {

    private static final String TAG = "FormulaRecPost";

    // Tokenizer constants (from config.json / generation_config.json)
    private static final int PAD_ID = 0;
    private static final int BOS_ID = 1;
    private static final int DECODER_START_ID = 2;
    private static final int EOS_ID = 2;
    // Desktop uses eos_id (2) for padding finished beams, NOT pad_id (0)
    private static final int PAD_FINISHED_ID = EOS_ID;

    // Beam search
    private static final int BEAM_WIDTH = 3;
    private static final int TOP_K = 5;
    private static final int MAX_TOKENS = 512; // Match desktop FORMULA_MAX_NEW_TOKENS (was 256)

    // id → token mapping
    private Map<Integer, String> vocab;
    private boolean tokenizerLoaded = false;

    /**
     * Load the HuggingFace tokenizer.json from assets.
     */
    public void loadTokenizer(Context ctx) {
        try {
            InputStream is = ctx.getAssets().open(
                "public/models/mathcraft-formula-rec/tokenizer.json");
            BufferedReader br = new BufferedReader(new InputStreamReader(is));
            StringBuilder sb = new StringBuilder();
            String line;
            while ((line = br.readLine()) != null) sb.append(line);
            br.close();

            JSONObject root = new JSONObject(sb.toString());
            JSONObject model = root.getJSONObject("model");
            JSONObject v = model.getJSONObject("vocab");

            // Invert vocab: {token: id} → {id: token}
            vocab = new TreeMap<>();
            java.util.Iterator<String> it = v.keys();
            while (it.hasNext()) {
                String key = it.next();
                int id = v.getInt(key);
                vocab.put(id, key);
            }

            tokenizerLoaded = true;
            Log.d(TAG, "Tokenizer loaded: " + vocab.size() + " tokens");
        } catch (Exception e) {
            Log.e(TAG, "Failed to load tokenizer", e);
            // Build a minimal fallback vocab
            vocab = new TreeMap<>();
            vocab.put(0, "<pad>");
            vocab.put(1, "<s>");
            vocab.put(2, "</s>");
            tokenizerLoaded = true;
        }
    }

    public boolean isTokenizerReady() { return tokenizerLoaded; }

    /**
     * Run beam search decoder on the encoder hidden states.
     * <p>
     * Matches ocr-engine.js recognize() beam search logic.
     *
     * @param runner      OnnxRunner with decoder session loaded.
     * @param encOutput   Encoder output data (float array, shape [1, 577, 384]=[1, hsD1, hsD2]).
     * @param encDims     Encoder output dimensions: [1, hsD1, hsD2].
     * @return Decoded LaTeX string.
     */
    public DecodeResult decode(OnnxRunner runner, float[] encOutput, int[] encDims) {
        // Beam state
        List<Beam> beams = new ArrayList<>();
        beams.add(new Beam(new long[]{DECODER_START_ID}, 0.0, false));

        int hsD1 = encDims[1];
        int hsD2 = encDims[2];

        try {
            for (int step = 0; step < MAX_TOKENS; step++) {
                // If all beams finished, stop
                boolean allFinished = true;
                for (Beam b : beams) {
                    if (!b.finished) { allFinished = false; break; }
                }
                if (allFinished) break;

                // Collect active (unfinished) beams
                List<Beam> active = new ArrayList<>();
                for (Beam b : beams) {
                    if (!b.finished) active.add(b);
                }
                if (active.isEmpty()) break;

                int batchSize = active.size();

                // Find max sequence length among active beams
                int maxLen = 0;
                for (Beam b : active) maxLen = Math.max(maxLen, b.tokens.length);
                int padLen = maxLen;

                // Build batched input_ids [batchSize, padLen]
                long[] batchIds = new long[batchSize * padLen];
                for (int i = 0; i < batchSize; i++) {
                    long[] seq = active.get(i).tokens;
                    for (int j = 0; j < padLen; j++) {
                        batchIds[i * padLen + j] = j < seq.length ? seq[j] : 0;
                    }
                }

                // Tile encoder hidden states to match batch size
                int numEnc = hsD1 * hsD2;
                float[] tiled = new float[batchSize * numEnc];
                for (int i = 0; i < batchSize; i++) {
                    System.arraycopy(encOutput, 0, tiled, i * numEnc, numEnc);
                }

                // Run decoder
                ai.onnxruntime.OrtSession.Result result = runner.runDecoder(
                    batchIds, new int[]{batchSize, padLen},
                    tiled, new int[]{batchSize, hsD1, hsD2});

                // Get logits
                OnnxTensorAccess logits = new OnnxTensorAccess(
                    (ai.onnxruntime.OnnxTensor) result.get(runner.getDecoderOutputName()).get());
                int vocabSize = (int) logits.shape[2];
                int seqLen = (int) logits.shape[1];

                // Collect candidates
                List<Candidate> candidates = new ArrayList<>();

                for (int i = 0; i < batchSize; i++) {
                    Beam currentBeam = active.get(i);
                    double baseScore = currentBeam.score;

                    // Get last step logits
                    int offset = (i * seqLen + (seqLen - 1)) * vocabSize;
                    float[] stepLogits = new float[vocabSize];
                    for (int v = 0; v < vocabSize; v++) {
                        stepLogits[v] = logits.data[offset + v];
                    }

                    // Softmax
                    float[] probs = softmax(stepLogits);

                    // Find top-K
                    int[] topIndices = new int[TOP_K * 2];
                    float[] topProbs = new float[TOP_K * 2];
                    int depth = step < 3 ? TOP_K * 2 : TOP_K;

                    for (int k = 0; k < depth; k++) {
                        int bestIdx = -1;
                        float bestVal = -Float.MAX_VALUE;
                        for (int v = 0; v < vocabSize; v++) {
                            if (probs[v] > bestVal) {
                                // Check if already selected
                                boolean dup = false;
                                for (int p = 0; p < k; p++) {
                                    if (topIndices[p] == v) { dup = true; break; }
                                }
                                if (!dup) { bestVal = probs[v]; bestIdx = v; }
                            }
                        }
                        if (bestIdx >= 0) {
                            topIndices[k] = bestIdx;
                            topProbs[k] = bestVal;
                        }
                    }

                    int effectiveDepth = Math.min(depth, vocabSize);
                    for (int k = 0; k < effectiveDepth; k++) {
                        if (topProbs[k] < 0.01f) break;
                        long[] newTokens = new long[currentBeam.tokens.length + 1];
                        System.arraycopy(currentBeam.tokens, 0, newTokens, 0, currentBeam.tokens.length);
                        newTokens[currentBeam.tokens.length] = topIndices[k];

                        candidates.add(new Candidate(
                            newTokens,
                            baseScore + Math.log(Math.max(topProbs[k], 1e-10)),
                            topIndices[k] == EOS_ID || topIndices[k] == PAD_ID
                        ));
                    }
                }

                if (candidates.isEmpty()) break;

                // Sort by score descending
                candidates.sort((a, b) -> Double.compare(b.score, a.score));

                // Keep top BEAM_WIDTH, deduplicate
                List<Beam> newBeams = new ArrayList<>();
                java.util.Set<String> seen = new java.util.HashSet<>();

                for (Candidate c : candidates) {
                    if (newBeams.size() >= BEAM_WIDTH) break;
                    StringBuilder key = new StringBuilder();
                    for (int i = 1; i < c.tokens.length; i++) {
                        if (i > 1) key.append(',');
                        key.append(c.tokens[i]);
                    }
                    if (!seen.contains(key.toString())) {
                        seen.add(key.toString());
                        newBeams.add(new Beam(c.tokens, c.score, c.finished));
                    }
                }

                // Merge with finished beams from previous steps
                List<Beam> prevFinished = new ArrayList<>();
                for (Beam b : beams) {
                    if (b.finished) prevFinished.add(b);
                }

                beams = new ArrayList<>();
                beams.addAll(prevFinished);
                beams.addAll(newBeams);

                // Keep top (BEAM_WIDTH + 2)
                beams.sort((a, b) -> Double.compare(b.score, a.score));
                while (beams.size() > BEAM_WIDTH + 2) {
                    beams.remove(beams.size() - 1);
                }
            }

            // Pick best beam (prefer finished over not, by score)
            beams.sort((a, b) -> {
                if (a.finished != b.finished) return a.finished ? -1 : 1;
                return Double.compare(b.score, a.score);
            });

            Beam best = beams.get(0);
            int tokenCount = Math.max(best.tokens.length - 1, 1);
            double avgScore = Math.exp(best.score / tokenCount);

            // Decode tokens (skip start token at index 0)
            long[] tokenIds = new long[best.tokens.length - 1];
            System.arraycopy(best.tokens, 1, tokenIds, 0, best.tokens.length - 1);
            String rawLatex = decodeTokens(tokenIds);

            // Post-process
            String latex = sanitizeLatex(repairLatex(rawLatex));

            // Repetitive pattern detection
            if (latex.length() > 20) {
                String deduped = removeRepetitivePatterns(latex);
                if (deduped.length() < latex.length() * 0.4) {
                    Log.d(TAG, "Repetitive pattern detected, clearing");
                    latex = "";
                }
            }

            return new DecodeResult(latex, (float) avgScore, tokenIds.length);

        } catch (Exception e) {
            Log.e(TAG, "Decoder inference failed", e);
            return new DecodeResult("", 0, 0);
        }
    }

    // ── Token decoding ──

    private String decodeTokens(long[] tokenIds) {
        if (vocab == null || vocab.isEmpty()) {
            StringBuilder sb = new StringBuilder();
            for (long id : tokenIds) {
                if (sb.length() > 0) sb.append(", ");
                sb.append(id);
            }
            return sb.toString();
        }

        StringBuilder text = new StringBuilder();
        for (long idLong : tokenIds) {
            int id = (int) idLong;
            String token = vocab.get(id);
            if (token == null) continue;

            // Skip special tokens: <pad>, <s>, </s>, etc.
            if (token.startsWith("<") && token.endsWith(">")) continue;

            // GPT-2 BPE style space prefix
            if (token.startsWith("Ġ")) {
                text.append(' ').append(token.substring(1));
            }
            // SentencePiece style space prefix
            else if (token.startsWith("▁")) {
                text.append(' ').append(token.substring(1));
            } else {
                text.append(token);
            }
        }

        return text.toString().trim();
    }

    // ── LaTeX repair (matches ocr-engine.js repairLatex()) ──

    public static String repairLatex(String tex) {
        if (tex == null) return null;
        String s = tex.replace("\r\n", "\n").trim();

        // Strip trailing isolated backslashes
        s = s.replaceAll("(?:\\\\\\s*)+$", "").trim();
        while (s.endsWith("\\") && !s.endsWith("\\\\")) {
            s = s.substring(0, s.length() - 1).trim();
        }

        // Remove excess closing braces
        int depth = 0;
        StringBuilder cleaned = new StringBuilder();
        for (int i = 0; i < s.length(); i++) {
            char ch = s.charAt(i);
            if (ch == '{') { depth++; cleaned.append(ch); }
            else if (ch == '}') { if (depth > 0) { depth--; cleaned.append(ch); } }
            else { cleaned.append(ch); }
        }
        s = cleaned.toString();

        // Complete \frac, \binom, \dfrac, \tfrac missing args
        // Find all command positions
        java.util.regex.Pattern cmdPat = java.util.regex.Pattern.compile(
            "\\\\(?:dfrac|tfrac|frac|binom)\\b");
        java.util.regex.Matcher m = cmdPat.matcher(s);

        // Build list of edits (position, textToInsert)
        // Since we're modifying positions, collect them first then apply in reverse
        List<Edit> edits = new ArrayList<>();

        while (m.find()) {
            int pos = m.end();
            // Skip spaces
            while (pos < s.length() && s.charAt(pos) == ' ') pos++;
            if (pos >= s.length() || s.charAt(pos) != '{') {
                edits.add(new Edit(pos, " {} {}"));
                continue;
            }
            // Find matching close brace for first arg
            int d = 0, end = -1;
            for (int j = pos; j < s.length(); j++) {
                if (s.charAt(j) == '{') d++;
                else if (s.charAt(j) == '}') { d--; if (d == 0) { end = j + 1; break; } }
            }
            if (end < 0) {
                edits.add(new Edit(pos, " {}"));
                continue;
            }
            pos = end;
            while (pos < s.length() && s.charAt(pos) == ' ') pos++;
            if (pos >= s.length() || s.charAt(pos) != '{') {
                edits.add(new Edit(end, " {}"));
            }
        }

        // Apply edits in reverse
        for (int ei = edits.size() - 1; ei >= 0; ei--) {
            Edit e = edits.get(ei);
            s = s.substring(0, e.position) + e.text + s.substring(e.position);
        }

        // Complete \left / \begin environments
        java.util.List<Integer> leftStack = new java.util.ArrayList<>();
        java.util.List<String> beginStack = new java.util.ArrayList<>();

        java.util.regex.Pattern envPat = java.util.regex.Pattern.compile(
            "\\\\(left|right)\\b|\\\\(begin|end)\\s*\\{([A-Za-z*]+)\\s*\\}");
        java.util.regex.Matcher m2 = envPat.matcher(s);

        while (m2.find()) {
            String type = m2.group(1); // "left" or "right" or null
            String envType = m2.group(2); // "begin" or "end" or null
            String envName = m2.group(3); // environment name or null

            if ("left".equals(type)) {
                leftStack.add(m2.start());
            } else if ("right".equals(type)) {
                if (!leftStack.isEmpty()) leftStack.remove(leftStack.size() - 1);
            } else if ("begin".equals(envType)) {
                beginStack.add(envName);
            } else if ("end".equals(envType) && !beginStack.isEmpty()) {
                // Pop matching begin
                for (int bi = beginStack.size() - 1; bi >= 0; bi--) {
                    if (beginStack.get(bi).equals(envName)) {
                        beginStack.subList(bi, beginStack.size()).clear();
                        break;
                    }
                }
            }
        }

        StringBuilder suffix = new StringBuilder();
        while (!leftStack.isEmpty()) {
            suffix.append(" \\right.");
            leftStack.remove(leftStack.size() - 1);
        }
        for (int bi = beginStack.size() - 1; bi >= 0; bi--) {
            suffix.append("\n\\end{").append(beginStack.get(bi)).append("}");
        }
        while (depth > 0) {
            s += "}";
            depth--;
        }

        s = (s + suffix.toString()).trim();
        // Normalize \left. \right. -> \left.\right.
        s = s.replace(". .", "..");
        return s;
    }

    // ── LaTeX sanitize (matches ocr-engine.js sanitizeLatex()) ──

    public static String sanitizeLatex(String tex) {
        if (tex == null) return null;
        String s = tex;

        s = s.replaceAll("\\\\textsc\\b", "\\\\text");
        s = s.replaceAll("\\\\textup\\b", "\\\\text");
        s = s.replaceAll("\\\\textbf\\b", "\\\\mathbf");
        s = s.replaceAll("\\\\textit\\b", "\\\\mathit");
        s = s.replaceAll("\\\\texttt\\b", "\\\\mathtt");

        // Remove space between \command and {: \text {x} → \text{x}
        s = s.replaceAll("(\\\\[a-zA-Z*]+)\\s+(\\{)", "$1$2");

        // Collapse spaces within small braces: { d e t } → {det}
        s = s.replaceAll("\\{\\s+([a-zA-Z0-9])\\s+([a-zA-Z0-9])\\s*\\}", "{$1$2}");
        s = s.replaceAll("\\{\\s+([a-zA-Z0-9])\\s+([a-zA-Z0-9])\\s+([a-zA-Z0-9])\\s*\\}", "{$1$2$3}");

        return s;
    }

    // ── Repetitive pattern detection (matches ocr-engine.js) ──

    private static String removeRepetitivePatterns(String text) {
        for (int patternLen = 3; patternLen <= Math.floor(text.length() / 3); patternLen++) {
            String pattern = text.substring(0, patternLen);
            int repeatCount = 0;
            int pos = 0;
            while (pos + patternLen <= text.length()
                    && text.substring(pos, pos + patternLen).equals(pattern)) {
                repeatCount++;
                pos += patternLen;
            }
            if (repeatCount >= 3) {
                return pattern;
            }
        }
        return text;
    }

    // ── Utility functions ──

    private static float[] softmax(float[] logits) {
        float max = Float.NEGATIVE_INFINITY;
        for (float v : logits) max = Math.max(max, v);
        double sum = 0;
        float[] exp = new float[logits.length];
        for (int i = 0; i < logits.length; i++) {
            exp[i] = (float) Math.exp(logits[i] - max);
            sum += exp[i];
        }
        for (int i = 0; i < logits.length; i++) {
            exp[i] /= sum;
        }
        return exp;
    }

    // ── Helper classes ──

    /** Helper to extract data/dims from an OnnxTensor without checked exceptions. */
    private static class OnnxTensorAccess {
        final float[] data;
        final long[] shape;
        OnnxTensorAccess(ai.onnxruntime.OnnxTensor tensor) throws ai.onnxruntime.OrtException {
            java.nio.FloatBuffer buf = tensor.getFloatBuffer();
            this.data = new float[buf.remaining()];
            buf.get(this.data);
            this.shape = tensor.getInfo().getShape();
        }
    }

    private static class Beam {
        final long[] tokens;
        final double score;
        final boolean finished;
        Beam(long[] tokens, double score, boolean finished) {
            this.tokens = tokens;
            this.score = score;
            this.finished = finished;
        }
    }

    private static class Candidate {
        final long[] tokens;
        final double score;
        final boolean finished;
        Candidate(long[] tokens, double score, boolean finished) {
            this.tokens = tokens;
            this.score = score;
            this.finished = finished;
        }
    }

    private static class Edit {
        final int position;
        final String text;
        Edit(int position, String text) {
            this.position = position;
            this.text = text;
        }
    }

    /** Result of formula recognition decoding. */
    public static class DecodeResult {
        public final String latex;
        public final float confidence;
        public final int numTokens;
        public DecodeResult(String latex, float confidence, int numTokens) {
            this.latex = latex;
            this.confidence = confidence;
            this.numTokens = numTokens;
        }
    }
}
