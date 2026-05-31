package com.latexsnipper.app.ocr;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

/**
 * FormulaDetPostProcess — YOLOv8 formula detection post-processing.
 * Matches desktop mathcraft_ocr/adapters/formula_detector.py.
 * <p>
 * confidence_threshold = 0.25 (desktop default, not 0.5)
 * iou_threshold = 0.45
 * No minimum area filter, no max results cap.
 */
public class FormulaDetPostProcess {

    private static final int CHANNELS = 6;
    private static final float CONF_THRESH = 0.25f;
    private static final float IOU_THRESH = 0.45f;

    public static final String[] LABELS = {"embedding", "isolated"};

    public static int computeNumAnchors(int inputSize) {
        int s8  = (int) Math.ceil(inputSize / 8.0);
        int s16 = (int) Math.ceil(inputSize / 16.0);
        int s32 = (int) Math.ceil(inputSize / 32.0);
        return s8 * s8 + s16 * s16 + s32 * s32;
    }

    public static class Box {
        public final int x, y, w, h;
        public final float confidence;
        public final int classId;
        public final String label;

        public Box(int x, int y, int w, int h, float confidence, int classId) {
            this.x = x; this.y = y; this.w = w; this.h = h;
            this.confidence = confidence;
            this.classId = classId;
            this.label = (classId >= 0 && classId < LABELS.length) ? LABELS[classId] : String.valueOf(classId);
        }
    }

    public static List<Box> run(float[] rawOutput, int origW, int origH,
                                 float scale, int padX, int padY) {
        int numAnchors = computeNumAnchors(768);
        float[] preds = transpose(rawOutput, numAnchors);
        List<Box> candidates = decodePredictions(preds, numAnchors, origW, origH, scale, padX, padY);
        List<Integer> keep = nms(candidates);
        List<Box> results = new ArrayList<>(keep.size());
        for (int idx : keep) results.add(candidates.get(idx));
        sortByPosition(results);
        return results;
    }

    private static float[] transpose(float[] raw, int numAnchors) {
        float[] preds = new float[numAnchors * CHANNELS];
        for (int i = 0; i < numAnchors; i++)
            for (int c = 0; c < CHANNELS; c++)
                preds[i * CHANNELS + c] = raw[c * numAnchors + i];
        return preds;
    }

    private static List<Box> decodePredictions(float[] preds, int numAnchors,
                                                int origW, int origH,
                                                float scale, int padX, int padY) {
        List<Box> boxes = new ArrayList<>();
        for (int i = 0; i < numAnchors; i++) {
            int base = i * CHANNELS;
            float s0 = preds[base + 4], s1 = preds[base + 5];
            int classId = (s0 >= s1) ? 0 : 1;
            float score = Math.max(s0, s1);
            if (score < CONF_THRESH) continue;

            float cx = preds[base], cy = preds[base + 1];
            float w = preds[base + 2], h = preds[base + 3];

            float x1 = (cx - w / 2.0f - padX) / scale;
            float y1 = (cy - h / 2.0f - padY) / scale;
            float x2 = (cx + w / 2.0f - padX) / scale;
            float y2 = (cy + h / 2.0f - padY) / scale;

            int bx1 = clamp((int) Math.floor(x1), 0, origW);
            int by1 = clamp((int) Math.floor(y1), 0, origH);
            int bx2 = clamp((int) Math.ceil(x2), 0, origW);
            int by2 = clamp((int) Math.ceil(y2), 0, origH);

            boxes.add(new Box(bx1, by1, bx2 - bx1, by2 - by1, score, classId));
        }
        return boxes;
    }

    private static List<Integer> nms(List<Box> boxes) {
        if (boxes.isEmpty()) return Collections.emptyList();
        int n = boxes.size();
        float[] areas = new float[n];
        for (int i = 0; i < n; i++) areas[i] = boxes.get(i).w * boxes.get(i).h;

        List<Integer> order = new ArrayList<>(n);
        for (int i = 0; i < n; i++) order.add(i);
        order.sort((a, b) -> Float.compare(boxes.get(b).confidence, boxes.get(a).confidence));

        List<Integer> keep = new ArrayList<>();
        while (!order.isEmpty()) {
            int current = order.get(0);
            keep.add(current);
            List<Integer> rest = order.subList(1, order.size());
            if (rest.isEmpty()) break;
            List<Integer> survivors = new ArrayList<>();
            Box cur = boxes.get(current);
            for (int idx : rest) {
                Box other = boxes.get(idx);
                int xx1 = Math.max(cur.x, other.x), yy1 = Math.max(cur.y, other.y);
                int xx2 = Math.min(cur.x + cur.w, other.x + other.w);
                int yy2 = Math.min(cur.y + cur.h, other.y + other.h);
                int iw = Math.max(0, xx2 - xx1), ih = Math.max(0, yy2 - yy1);
                float iou = (float) (iw * ih) / (areas[current] + areas[idx] - (float) (iw * ih));
                if (iou <= IOU_THRESH) survivors.add(idx);
            }
            order = survivors;
        }
        return keep;
    }

    private static void sortByPosition(List<Box> results) {
        results.sort((a, b) -> { int d = a.y - b.y; return d != 0 ? d : a.x - b.x; });
    }

    private static int clamp(int v, int min, int max) { return Math.max(min, Math.min(max, v)); }
}
