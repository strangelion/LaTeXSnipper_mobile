"""
test_text_det.py — DBNet text detection test.
Verifies the model runs and produces probability maps.
"""
import sys, os, time
import numpy as np
from PIL import Image

MODEL_DIR = os.path.join(os.path.dirname(__file__), '..', 'public', 'models')
DET_MODEL = os.path.join(MODEL_DIR, 'mathcraft-text-det', 'ppocrv5_mobile_det.onnx')

def create_test_text_image(size=(640, 480)):
    """Create an image with text blocks for detection."""
    from PIL import ImageDraw, ImageFont
    img = Image.new('RGB', size, (255, 255, 255))
    d = ImageDraw.Draw(img)
    try: font = ImageFont.truetype("C:/Windows/Fonts/arial.ttf", 36)
    except: font = ImageFont.load_default()
    texts = ["This is a test sentence.", "Another line of text here.",
             "Chinese: 这是一个测试", "OCR text detection test"]
    for i, t in enumerate(texts):
        d.text((30, 30 + i * 100), t, fill=(0, 0, 0), font=font)
    return img

def preprocess(img, max_side=960, stride=32):
    w, h = img.size
    scale = min(1.0, max_side / max(w, h))
    new_w, new_h = int(round(w * scale)), int(round(h * scale))
    pw = int(np.ceil(new_w / stride) * stride)
    ph = int(np.ceil(new_h / stride) * stride)

    resized = img.resize((new_w, new_h), Image.BILINEAR)
    canvas = Image.new('RGB', (pw, ph), (255, 255, 255))
    canvas.paste(resized, (0, 0))

    arr = np.array(canvas, dtype=np.float32)
    arr = (arr / 255.0 - 0.5) / 0.5
    arr = np.transpose(arr, (2, 0, 1))[np.newaxis, :, :, :]
    return arr, scale, new_w, new_h, pw, ph

def test_text_det():
    import onnxruntime as ort

    print(f"  Model: {os.path.getsize(DET_MODEL)/1024/1024:.1f} MB")
    sess = ort.InferenceSession(DET_MODEL, providers=['CPUExecutionProvider'])

    inp = sess.get_inputs()[0]
    out = sess.get_outputs()[0]
    print(f"  Input: {inp.name} {inp.shape}")
    print(f"  Output: {out.name} {out.shape}")

    img = create_test_text_image()
    input_tensor, scale, nw, nh, pw, ph = preprocess(img)
    print(f"  Original: {img.size[0]}x{img.size[1]}")
    print(f"  Preprocessed: {pw}x{ph}, scale={scale:.4f}")

    t0 = time.time()
    output = sess.run([out.name], {inp.name: input_tensor.astype(np.float32)})[0]
    elapsed = time.time() - t0

    prob_map = output[0, 0]
    print(f"  Time: {elapsed*1000:.0f}ms")
    print(f"  Prob map: {prob_map.shape}, "
          f"range=[{prob_map.min():.4f}, {prob_map.max():.4f}], "
          f"mean={prob_map.mean():.4f}")

    # Check that prob map has reasonable values
    assert prob_map.shape == (ph, pw), f"Shape mismatch: {prob_map.shape} vs {(ph, pw)}"
    assert prob_map.max() >= 0, f"All negative max: {prob_map.max()}"
    assert prob_map.min() >= -1e-5, f"Too negative: {prob_map.min()}"

    # Basic flood-fill / contour check
    binary = (prob_map > 0.3).astype(np.uint8)
    foreground_pct = binary.sum() / binary.size * 100
    print(f"  Foreground (>0.3): {foreground_pct:.1f}% of image")
    print("  OK OK")

if __name__ == '__main__':
    test_text_det()
