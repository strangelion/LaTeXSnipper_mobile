"""
test_text_rec_pipeline.py — Full text recognition pipeline test (DBNet + CRNN end-to-end).
Verifies that the detection and recognition models work together:
  det → postprocess (contour tracing, unclip) → rec → CTC decode
This matches the Java TextDetProcessor + TextRecPostProcess flow.
"""
import sys, os, time, math
import numpy as np
from PIL import Image, ImageDraw, ImageFont

sys.path.insert(0, os.path.dirname(__file__))

MODEL_DIR = os.path.join(os.path.dirname(__file__), '..', 'public', 'models')
DET_MODEL = os.path.join(MODEL_DIR, 'mathcraft-text-det', 'ppocrv5_mobile_det.onnx')
REC_MODEL = os.path.join(MODEL_DIR, 'mathcraft-text-rec', 'ppocrv5_mobile_rec.onnx')
KEYS_FILE = os.path.join(MODEL_DIR, 'mathcraft-text-rec', 'ppocrv5_keys.txt')

# ── DBNet Preprocess (matching Java TextDetProcessor.preprocess) ──

def det_preprocess(img, max_side=960, stride=32):
    w, h = img.size
    scale = min(1.0, max_side / max(w, h))
    new_w, new_h = int(round(w * scale)), int(round(h * scale))
    pw = int(math.ceil(new_w / stride) * stride)
    ph = int(math.ceil(new_h / stride) * stride)

    resized = img.resize((new_w, new_h), Image.BILINEAR)
    canvas = Image.new('RGB', (pw, ph), (255, 255, 255))
    canvas.paste(resized, (0, 0))

    arr = np.array(canvas, dtype=np.float32)
    # BGR order matching Java: B, G, R
    b = arr[:, :, 0] / 255.0
    g = arr[:, :, 1] / 255.0
    r = arr[:, :, 2] / 255.0
    b = (b - 0.5) / 0.5
    g = (g - 0.5) / 0.5
    r = (r - 0.5) / 0.5
    result = np.stack([b, g, r], axis=0)[np.newaxis, :, :, :]
    return result.astype(np.float32), scale, new_w, new_h, pw, ph


# ── DBNet Postprocess (matching Java TextDetProcessor.postprocess) ──

DET_THRESH = 0.3
UNCLIP_RATIO = 1.6
BOX_THRESH = 0.5


def det_postprocess(prob_map, prob_h, prob_w, scale, orig_w, orig_h):
    inv_scale = 1.0 / scale

    # Step 1: Binary threshold
    binary = (prob_map > DET_THRESH).astype(np.uint8)

    # Step 2: Dilation 3x3
    from scipy.ndimage import binary_dilation
    struct = np.ones((3, 3), dtype=bool)
    dilated = binary_dilation(binary, struct).astype(np.uint8)

    # Step 3: Find contours
    from skimage.measure import find_contours
    contours = find_contours(dilated, level=0.5)

    boxes = []
    for contour in contours:
        if len(contour) < 4:
            continue

        # Contour from skimage is (row, col) → swap to (x, y)
        contour_xy = contour[:, ::-1]

        # Shoelace area
        area = 0.0
        n = len(contour_xy)
        for i in range(n):
            j = (i + 1) % n
            area += contour_xy[i, 0] * contour_xy[j, 1]
            area -= contour_xy[j, 0] * contour_xy[i, 1]
        area = abs(area) / 2.0
        if area < 4:
            continue

        # Perimeter
        perim = 0.0
        for i in range(n):
            j = (i + 1) % n
            dx = contour_xy[i, 0] - contour_xy[j, 0]
            dy = contour_xy[i, 1] - contour_xy[j, 1]
            perim += math.sqrt(dx * dx + dy * dy)
        if perim < 0.5:
            continue

        dist = area * UNCLIP_RATIO / perim

        min_x = int(np.min(contour_xy[:, 0]))
        max_x = int(np.max(contour_xy[:, 0]))
        min_y = int(np.min(contour_xy[:, 1]))
        max_y = int(np.max(contour_xy[:, 1]))

        # Score: mean prob over dilated pixels inside bounding box
        mask = dilated[min_y:max_y+1, min_x:max_x+1]
        if mask.sum() == 0:
            continue
        score = float((prob_map[min_y:max_y+1, min_x:max_x+1] * mask).sum() / mask.sum())
        if score < BOX_THRESH:
            continue

        cx = (min_x + max_x) / 2.0
        cy = (min_y + max_y) / 2.0
        bw = max_x - min_x + 1
        bh = max_y - min_y + 1
        hw = bw / 2.0 + dist
        hh = bh / 2.0 + dist

        rx = max(0, int(round((cx - hw) * inv_scale)))
        ry = max(0, int(round((cy - hh) * inv_scale)))
        rw = int(round(bw * inv_scale + 2 * dist * inv_scale))
        rh = max(8, int(round(bh * inv_scale + 2 * dist * inv_scale)))

        if rw <= 4 or rh <= 4:
            continue
        boxes.append({'x': rx, 'y': ry, 'w': rw, 'h': rh, 'score': score})

    # Sort by y then x
    boxes.sort(key=lambda b: (b['y'], b['x']))

    # Merge horizontal
    merged = []
    for b in boxes:
        found = False
        for i, m in enumerate(merged):
            y_dist = abs(b['y'] + b['h']/2 - (m['y'] + m['h']/2))
            avg_h = (m['h'] + b['h']) / 2.0
            gap = b['x'] - (m['x'] + m['w'])
            if y_dist < avg_h * 0.5 and gap < avg_h * 1.2:
                nx = min(m['x'], b['x'])
                ny = min(m['y'], b['y'])
                nw = max(m['x'] + m['w'], b['x'] + b['w']) - nx
                nh = max(m['y'] + m['h'], b['y'] + b['h']) - ny
                merged[i] = {'x': nx, 'y': ny, 'w': nw, 'h': nh, 'score': max(m['score'], b['score'])}
                found = True
                break
        if not found:
            merged.append(b)

    # Merge vertical (overlapping)
    changed = True
    while changed:
        changed = False
        for i in range(len(merged)):
            for j in range(i + 1, len(merged)):
                a, b = merged[i], merged[j]
                y_overlap = min(a['y'] + a['h'], b['y'] + b['h']) - max(a['y'], b['y'])
                x_overlap = min(a['x'] + a['w'], b['x'] + b['w']) - max(a['x'], b['x'])
                if y_overlap > 0 and x_overlap > 0:
                    nx = min(a['x'], b['x'])
                    ny = min(a['y'], b['y'])
                    nw = max(a['x'] + a['w'], b['x'] + b['w']) - nx
                    nh = max(a['y'] + a['h'], b['y'] + b['h']) - ny
                    merged[i] = {'x': nx, 'y': ny, 'w': nw, 'h': nh, 'score': max(a['score'], b['score'])}
                    merged.pop(j)
                    changed = True
                    break
            if changed:
                break
    return merged


# ── CRNN Recognition (matching Java TextRecPreProcess + TextRecPostProcess) ──

def rec_preprocess(box_img, max_w=320, target_h=48):
    """Match Java TextRecPreProcess: resize to h=48, pad right with zeros to 320."""
    iw, ih = box_img.size
    ratio = iw / ih
    target_w = min(max_w, max(4, int(np.ceil(target_h * ratio))))

    resized = box_img.resize((target_w, target_h), Image.BILINEAR)
    canvas = Image.new('RGB', (max_w, target_h), (0, 0, 0))
    canvas.paste(resized, (0, 0))

    arr = np.array(canvas, dtype=np.float32)
    b = arr[:, :, 0] / 255.0
    g = arr[:, :, 1] / 255.0
    r = arr[:, :, 2] / 255.0
    b = (b - 0.5) / 0.5
    g = (g - 0.5) / 0.5
    r = (r - 0.5) / 0.5
    result = np.stack([b, g, r], axis=0)[np.newaxis, :, :, :]
    return result.astype(np.float32)


def ctc_decode(logits, keys):
    """Greedy CTC decode matching Java TextRecPostProcess."""
    seq_len = logits.shape[1]
    vocab_size = logits.shape[2]
    space_id = len(keys) + 1

    text = []
    prev = -1
    for t in range(seq_len):
        step = logits[0, t, :]
        max_idx = int(np.argmax(step))
        if max_idx != prev and max_idx > 0:
            if max_idx == space_id:
                text.append(' ')
            elif max_idx <= len(keys):
                text.append(keys[max_idx - 1])
        prev = max_idx
    return ''.join(text).strip()


def create_test_image(size=(800, 320)):
    """Create test image with multiple text blocks."""
    img = Image.new('RGB', size, (255, 255, 255))
    d = ImageDraw.Draw(img)
    try:
        font = ImageFont.truetype("C:/Windows/Fonts/arial.ttf", 38)
        cn_font = ImageFont.truetype("C:/Windows/Fonts/msyh.ttf", 38)
    except:
        font = ImageFont.load_default()
        cn_font = font
    texts = [
        ("Hello World OCR test", font),
        ("LaTeX formula recognition", font),
        ("Text detection pipeline test", font),
        ("abcdefghij ABCDEFGHIJ", font),
    ]
    for i, (t, f) in enumerate(texts):
        d.text((20, 18 + i * 80), t, fill=(0, 0, 0), font=f)
    return img


def test_text_rec_pipeline():
    import onnxruntime as ort

    # Load models
    det_sess = ort.InferenceSession(DET_MODEL, providers=['CPUExecutionProvider'])
    print(f"  Det model: {os.path.getsize(DET_MODEL)/1024/1024:.1f} MB")

    rec_sess = ort.InferenceSession(REC_MODEL, providers=['CPUExecutionProvider'])
    print(f"  Rec model: {os.path.getsize(REC_MODEL)/1024/1024:.1f} MB")

    # Load keys
    with open(KEYS_FILE, encoding='utf-8') as f:
        keys = [l.rstrip('\n\r') for l in f]
    print(f"  Keys: {len(keys)} chars")

    # Create test image
    img = create_test_image()
    w, h = img.size
    print(f"  Test image: {w}x{h}")

    # Step 1: Detection
    t0 = time.time()
    input_tensor, scale, nw, nh, pw, ph = det_preprocess(img)
    det_inputs = {det_sess.get_inputs()[0].name: input_tensor}
    det_output = det_sess.run(None, det_inputs)[0]
    det_time = time.time() - t0

    prob_map = det_output[0, 0]
    print(f"  Det time: {det_time*1000:.0f}ms")
    print(f"  Prob map: {prob_map.shape}, range=[{prob_map.min():.4f}, {prob_map.max():.4f}]")

    # Step 2: Postprocess
    t1 = time.time()
    boxes = det_postprocess(prob_map, ph, pw, scale, w, h)
    post_time = time.time() - t1
    print(f"  Postprocess: {post_time*1000:.0f}ms, {len(boxes)} boxes found")

    assert len(boxes) >= 2, f"Expected >=2 text boxes, got {len(boxes)}"
    for b in boxes:
        print(f"    box ({b['x']},{b['y']} {b['w']}x{b['h']}) score={b['score']:.3f}")

    # Step 3: Recognize each box
    rec_times = []
    recognized = []
    for b in boxes:
        crop = img.crop((b['x'], b['y'], b['x'] + b['w'], b['y'] + b['h']))
        if crop.size[0] < 4 or crop.size[1] < 4:
            continue
        input_data = rec_preprocess(crop)
        t2 = time.time()
        rec_out = rec_sess.run(None, {rec_sess.get_inputs()[0].name: input_data})[0]
        rec_times.append(time.time() - t2)

        decoded = ctc_decode(rec_out, keys)
        recognized.append(decoded)

    avg_rec_time = sum(rec_times) / max(len(rec_times), 1) * 1000
    print(f"  Avg rec per box: {avg_rec_time:.0f}ms")

    # Verify at least some boxes produced non-empty text
    non_empty = sum(1 for r in recognized if r)
    print(f"  Non-empty recognitions: {non_empty}/{len(recognized)}")
    for i, t in enumerate(recognized):
        print(f"    [{i}] -> '{t[:60]}'")

    assert non_empty >= len(boxes) * 0.25, f"Too many empty recognitions ({non_empty}/{len(boxes)})"

    total_time = (time.time() - t0) * 1000
    print(f"  Total pipeline: {total_time:.0f}ms")
    print("  OK OK")


if __name__ == '__main__':
    test_text_rec_pipeline()
