"""
Test utilities — shared functions for postprocessing matches.
Implements the same logic as Java FormulaDetPostProcess for comparison.
"""
import numpy as np

def compute_num_anchors(input_size=768):
    s8 = int(np.ceil(input_size / 8.0))
    s16 = int(np.ceil(input_size / 16.0))
    s32 = int(np.ceil(input_size / 32.0))
    return s8 * s8 + s16 * s16 + s32 * s32

def formula_det_postprocess(raw_output, orig_w, orig_h, scale, pad_x, pad_y):
    """
    Match Java FormulaDetPostProcess:
      transpose [6,N] -> [N,6], filter at 0.25, de-scale, NMS at 0.45.
    """
    num_anchors = compute_num_anchors(768)
    preds = raw_output.T  # [N, 6] where N = num_anchors

    conf_thresh = 0.25
    iou_thresh = 0.45

    boxes = []
    for i in range(num_anchors):
        cx, cy, w, h, s0, s1 = preds[i]
        score = max(s0, s1)
        if score < conf_thresh:
            continue

        x1 = (cx - w / 2 - pad_x) / scale
        y1 = (cy - h / 2 - pad_y) / scale
        x2 = (cx + w / 2 - pad_x) / scale
        y2 = (cy + h / 2 - pad_y) / scale

        bx1 = max(0, min(orig_w, int(np.floor(x1))))
        by1 = max(0, min(orig_h, int(np.floor(y1))))
        bx2 = max(0, min(orig_w, int(np.ceil(x2))))
        by2 = max(0, min(orig_h, int(np.ceil(y2))))

        boxes.append({
            'x': bx1, 'y': by1, 'w': bx2 - bx1, 'h': by2 - by1,
            'confidence': float(score)
        })

    # NMS
    boxes.sort(key=lambda b: b['confidence'], reverse=True)
    keep = []
    while boxes:
        current = boxes.pop(0)
        keep.append(current)
        boxes = [b for b in boxes if iou(current, b) <= iou_thresh]

    keep.sort(key=lambda b: (b['y'], b['x']))
    return keep

def iou(a, b):
    xx1 = max(a['x'], b['x'])
    yy1 = max(a['y'], b['y'])
    xx2 = min(a['x'] + a['w'], b['x'] + b['w'])
    yy2 = min(a['y'] + a['h'], b['y'] + b['h'])
    inter = max(0, xx2 - xx1) * max(0, yy2 - yy1)
    area_a = a['w'] * a['h']
    area_b = b['w'] * b['h']
    union = area_a + area_b - inter
    return inter / union if union > 0 else 0
