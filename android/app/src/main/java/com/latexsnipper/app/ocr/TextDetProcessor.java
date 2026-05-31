package com.latexsnipper.app.ocr;

import android.graphics.Bitmap;
import android.util.Log;

import java.util.ArrayList;
import java.util.List;

/**
 * TextDetProcessor — DBNet text detection with contour-based postprocessing.
 * <p>
 * Pipeline: resize (max 960, stride 32) → normalize → infer → threshold (0.3)
 * → dilate → Moore-Neighbor contour tracing → unclip (real perimeter)
 * → box_thresh (0.5) → merge
 * <p>
 * Matches desktop mathcraft_ocr: RapidOCR DetPreProcess + DBPostProcess.
 */
public class TextDetProcessor {

    private static final String TAG = "TextDetProc";
    private static final int MAX_SIDE = 960;
    private static final int STRIDE = 32;
    private static final float DET_THRESH = 0.3f;
    private static final float UNCLIP_RATIO = 1.6f;
    private static final float BOX_THRESH = 0.5f;

    public static class Box {
        public final int x, y, w, h;
        public final float score;
        public Box(int x, int y, int w, int h, float score) {
            this.x = x; this.y = y; this.w = w; this.h = h; this.score = score;
        }
    }

    public static class PreResult {
        public final float[] data;
        public final int width, height;
        public final float scale;
        public final int origW, origH;
        public final long[] inputShape;

        PreResult(float[] data, int width, int height, float scale, int origW, int origH) {
            this.data = data; this.width = width; this.height = height;
            this.scale = scale; this.origW = origW; this.origH = origH;
            this.inputShape = new long[]{1, 3, height, width};
        }
    }

    public static PreResult preprocess(Bitmap bitmap) {
        int iw = bitmap.getWidth(), ih = bitmap.getHeight();
        float scale = Math.min(1.0f, (float) MAX_SIDE / Math.max(iw, ih));
        int newW = Math.round(iw * scale), newH = Math.round(ih * scale);
        int pw = (int) (Math.ceil(newW / (float) STRIDE) * STRIDE);
        int ph = (int) (Math.ceil(newH / (float) STRIDE) * STRIDE);

        Bitmap resized = Bitmap.createScaledBitmap(bitmap, newW, newH, true);
        Bitmap padded = Bitmap.createBitmap(pw, ph, Bitmap.Config.ARGB_8888);
        android.graphics.Canvas cv = new android.graphics.Canvas(padded);
        cv.drawColor(android.graphics.Color.WHITE);
        cv.drawBitmap(resized, 0, 0, null);
        if (resized != bitmap) resized.recycle();

        int[] argb = new int[pw * ph];
        padded.getPixels(argb, 0, pw, 0, 0, pw, ph);
        padded.recycle();

        int n = pw * ph;
        float[] fd = new float[3 * n];
        for (int i = 0; i < n; i++) {
            int pixel = argb[i];
            fd[i]       = (((pixel         & 0xFF) / 255.0f - 0.5f) / 0.5f);  // B
            fd[n + i]   = (((pixel >> 8)   & 0xFF) / 255.0f - 0.5f) / 0.5f;  // G
            fd[2 * n + i] = (((pixel >> 16) & 0xFF) / 255.0f - 0.5f) / 0.5f; // R
        }
        return new PreResult(fd, pw, ph, scale, iw, ih);
    }

    /**
     * Postprocess DBNet prob map → text boxes.
     * Uses Moore-Neighbor contour tracing + real perimeter for unclip.
     */
    public static List<Box> postprocess(float[] probData, int probH, int probW,
                                         float scale, int origW, int origH) {
        final float invScale = 1.0f / scale;

        // Step 1: Binary threshold
        byte[] binary = new byte[probH * probW];
        for (int i = 0; i < probH * probW; i++)
            binary[i] = probData[i] > DET_THRESH ? (byte) 1 : 0;

        // Step 2: Dilation (3×3)
        byte[] dilated = new byte[probH * probW];
        for (int y = 0; y < probH; y++) {
            for (int x = 0; x < probW; x++) {
                if (binary[y * probW + x] == 1) {
                    for (int dy = -1; dy <= 1; dy++)
                        for (int dx = -1; dx <= 1; dx++) {
                            int ny = y + dy, nx = x + dx;
                            if (ny >= 0 && ny < probH && nx >= 0 && nx < probW)
                                dilated[ny * probW + nx] = 1;
                        }
                }
            }
        }

        // Step 3: Trace contours on dilated image
        boolean[] visited = new boolean[probH * probW];
        List<List<int[]>> contours = findContours(dilated, probH, probW, visited);

        // Step 4: Boxes from contours
        List<Box> candidates = new ArrayList<>();

        for (List<int[]> contour : contours) {
            if (contour.size() < 4) continue;  // min 4 points for a meaningful contour

            // Real area via Shoelace formula
            float area = shoelaceArea(contour);
            if (area < 4) continue;

            // Real perimeter via cumulative edge length
            float perimeter = contourPerimeter(contour);
            if (perimeter < 0.5) continue;

            // Unclip distance = area * unclip_ratio / perimeter  (RapidOCR formula)
            float dist = area * UNCLIP_RATIO / perimeter;

            // Bounding box of contour
            int minX = Integer.MAX_VALUE, minY = Integer.MAX_VALUE;
            int maxX = Integer.MIN_VALUE, maxY = Integer.MIN_VALUE;
            for (int[] pt : contour) {
                if (pt[0] < minX) minX = pt[0];
                if (pt[0] > maxX) maxX = pt[0];
                if (pt[1] < minY) minY = pt[1];
                if (pt[1] > maxY) maxY = pt[1];
            }

            // Expand bounding box by unclip distance
            float cx = (minX + maxX) / 2.0f;
            float cy = (minY + maxY) / 2.0f;
            float bw = maxX - minX + 1;
            float bh = maxY - minY + 1;
            float hw = bw / 2.0f + dist;
            float hh = bh / 2.0f + dist;

            // Score: mean prob over dilated component pixels within bounding box
            float confSum = 0;
            int confCount = 0;
            for (int y = minY; y <= maxY; y++) {
                for (int x = minX; x <= maxX; x++) {
                    if (dilated[y * probW + x] == 1) {
                        confSum += probData[y * probW + x];
                        confCount++;
                    }
                }
            }
            float score = confCount > 0 ? confSum / confCount : 0;
            if (score < BOX_THRESH) continue;

            // Scale back to original image
            int rx = Math.max(0, Math.round((cx - hw) * invScale));
            int ry = Math.max(0, Math.round((cy - hh) * invScale));
            int rw = Math.round(bw * invScale + 2 * dist * invScale);
            int rh = Math.max(8, Math.round(bh * invScale + 2 * dist * invScale));

            if (rw <= 4 || rh <= 4) continue;

            candidates.add(new Box(rx, ry, rw, rh, score));
        }

        // Merge nearby boxes (same as before)
        candidates.sort((a, b) -> a.y != b.y ? a.y - b.y : a.x - b.x);
        List<Box> merged = mergeHorizontal(candidates);
        merged = mergeVertical(merged);
        return merged;
    }

    // ══════════════════════════════════════════════
    // Moore-Neighbor contour tracing
    // ══════════════════════════════════════════════

    // 8-direction offsets (clockwise): 0=right, 1=down-right, 2=down, 3=down-left,
    //                                  4=left, 5=up-left, 6=up, 7=up-right
    private static final int[] DX8 = {0, 1, 1, 1, 0, -1, -1, -1};
    private static final int[] DY8 = {1, 1, 0, -1, -1, -1, 0, 1};

    /**
     * Find all outer contours in a binary image using Moore-Neighbor tracing.
     * Returns each contour as a list of [x, y] points.
     */
    private static List<List<int[]>> findContours(byte[] binary, int h, int w,
                                                   boolean[] visited) {
        List<List<int[]>> contours = new ArrayList<>();

        for (int y = 0; y < h; y++) {
            for (int x = 0; x < w; x++) {
                int idx = y * w + x;
                if (binary[idx] == 1 && !visited[idx]) {
                    List<int[]> contour = traceContour(binary, w, h, x, y, visited);
                    if (contour != null && contour.size() >= 4) {
                        contours.add(contour);
                    }
                }
            }
        }
        return contours;
    }

    /**
     * Trace a single outer contour using Moore-Neighbor algorithm.
     * Starting search direction is west (4) from the first pixel.
     * Stop when we return to the start pixel.
     */
    private static List<int[]> traceContour(byte[] binary, int w, int h,
                                             int startX, int startY,
                                             boolean[] visited) {
        List<int[]> contour = new ArrayList<>();
        int cx = startX, cy = startY;
        int dir = 4; // initial search direction: west
        int maxPoints = Math.min(w * h, 50000);

        for (int iter = 0; iter < maxPoints; iter++) {
            contour.add(new int[]{cx, cy});
            visited[cy * w + cx] = true;

            boolean found = false;
            int nextDir = -1;
            int nx = -1, ny = -1;

            // Search 8 neighbors clockwise starting from (dir + 1) % 8
            for (int i = 1; i <= 8; i++) {
                int checkDir = (dir + i) % 8;
                int tx = cx + DX8[checkDir];
                int ty = cy + DY8[checkDir];

                if (tx >= 0 && tx < w && ty >= 0 && ty < h
                    && binary[ty * w + tx] == 1) {
                    found = true;
                    // new dir = opposite of checkDir (direction from new pixel back to current)
                    nextDir = (checkDir + 4) % 8;
                    nx = tx;
                    ny = ty;
                    break;
                }
            }

            if (!found) break; // isolated pixel

            // Check if we returned to start (but only if we've traced at least 6 points)
            if (nx == startX && ny == startY && contour.size() >= 6) {
                break;
            }

            cx = nx;
            cy = ny;
            dir = nextDir;
        }

        if (contour.size() < 4) return null;
        return contour;
    }

    /**
     * Compute area of a polygon using the Shoelace formula.
     * Returns positive area in pixel units.
     */
    private static float shoelaceArea(List<int[]> contour) {
        int n = contour.size();
        if (n < 3) return 0;
        double area = 0;
        for (int i = 0; i < n; i++) {
            int j = (i + 1) % n;
            area += (double) contour.get(i)[0] * contour.get(j)[1];
            area -= (double) contour.get(j)[0] * contour.get(i)[1];
        }
        return (float) Math.abs(area) / 2.0f;
    }

    /**
     * Compute perimeter of a polygon as sum of edge lengths.
     */
    private static float contourPerimeter(List<int[]> contour) {
        int n = contour.size();
        double perim = 0;
        for (int i = 0; i < n; i++) {
            int j = (i + 1) % n;
            double dx = contour.get(i)[0] - contour.get(j)[0];
            double dy = contour.get(i)[1] - contour.get(j)[1];
            perim += Math.sqrt(dx * dx + dy * dy);
        }
        return (float) perim;
    }

    // ══════════════════════════════════════════════
    // Box merging (same as before)
    // ══════════════════════════════════════════════

    private static List<Box> mergeHorizontal(List<Box> boxes) {
        List<Box> merged = new ArrayList<>();
        for (Box box : boxes) {
            boolean found = false;
            for (int i = 0; i < merged.size(); i++) {
                Box m = merged.get(i);
                float yDist = Math.abs(box.y + box.h / 2.0f - (m.y + m.h / 2.0f));
                float avgH = (m.h + box.h) / 2.0f;
                float gap = box.x - (m.x + m.w);
                if (yDist < avgH * 0.5f && gap < avgH * 1.2f) {
                    int nx = Math.min(m.x, box.x);
                    int ny = Math.min(m.y, box.y);
                    int nw = Math.max(m.x + m.w, box.x + box.w) - nx;
                    int nh = Math.max(m.y + m.h, box.y + box.h) - ny;
                    merged.set(i, new Box(nx, ny, nw, nh, Math.max(m.score, box.score)));
                    found = true; break;
                }
            }
            if (!found) merged.add(box);
        }
        return merged;
    }

    private static List<Box> mergeVertical(List<Box> boxes) {
        boolean changed = true;
        List<Box> merged = new ArrayList<>(boxes);
        while (changed) {
            changed = false;
            for (int i = 0; i < merged.size(); i++) {
                for (int j = i + 1; j < merged.size(); j++) {
                    Box a = merged.get(i), b = merged.get(j);
                    int yOverlap = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
                    int xOverlap = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
                    if (yOverlap > 0 && xOverlap > 0) {
                        int nx = Math.min(a.x, b.x), ny = Math.min(a.y, b.y);
                        int nw = Math.max(a.x + a.w, b.x + b.w) - nx;
                        int nh = Math.max(a.y + a.h, b.y + b.h) - ny;
                        merged.set(i, new Box(nx, ny, nw, nh, Math.max(a.score, b.score)));
                        merged.remove(j);
                        changed = true; break;
                    }
                }
                if (changed) break;
            }
        }
        return merged;
    }
}
