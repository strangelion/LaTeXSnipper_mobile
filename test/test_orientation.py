"""
test_orientation.py — PP-LCNet document orientation test.
Verifies the orientation model loads and classifies 0/90/180/270.
"""
import sys, os, time
import numpy as np
from PIL import Image

MODEL_DIR = os.path.join(os.path.dirname(__file__), '..', 'public', 'models')
REC_DIR = os.path.join(MODEL_DIR, 'mathcraft-text-rec')
ORI_MODEL = os.path.join(REC_DIR, 'pplcnet_doc_ori.onnx')

def preprocess(img):
    """Match Java DocOriPreProcess: center crop 224x224 + ImageNet norm."""
    w, h = img.size
    if w < h:
        new_w, new_h = 256, int(round(h * 256 / w))
    else:
        new_h, new_w = 256, int(round(w * 256 / h))

    resized = img.resize((new_w, new_h), Image.BILINEAR)
    cx = (new_w - 224) // 2
    cy = (new_h - 224) // 2
    cropped = resized.crop((cx, cy, cx + 224, cy + 224))

    arr = np.array(cropped, dtype=np.float32) / 255.0
    mean = np.array([0.485, 0.456, 0.406])
    std = np.array([0.229, 0.224, 0.225])
    arr = (arr - mean) / std
    arr = np.transpose(arr, (2, 0, 1))[np.newaxis, :, :, :]
    return arr.astype(np.float32)

def test_orientation():
    import onnxruntime as ort

    print(f"  Model: {os.path.getsize(ORI_MODEL)/1024/1024:.1f} MB")
    sess = ort.InferenceSession(ORI_MODEL, providers=['CPUExecutionProvider'])

    inp = sess.get_inputs()[0]
    out = sess.get_outputs()[0]
    print(f"  Input: {inp.name} {inp.shape}")
    print(f"  Output: {out.name} {out.shape}")

    # Create test images at each rotation
    img = Image.new('RGB', (400, 300), (255, 255, 255))
    from PIL import ImageDraw, ImageFont
    d = ImageDraw.Draw(img)
    try: font = ImageFont.truetype("C:/Windows/Fonts/arial.ttf", 36)
    except: font = ImageFont.load_default()
    d.text((20, 20), "Test", fill=(0, 0, 0), font=font)

    for angle in [0, 90, 180, 270]:
        rotated = img.rotate(angle, expand=True) if angle > 0 else img
        input_tensor = preprocess(rotated)

        t0 = time.time()
        output = sess.run([out.name], {inp.name: input_tensor})[0]
        elapsed = time.time() - t0

        probs = np.exp(output[0] - np.max(output[0]))
        probs = probs / np.sum(probs)
        predicted = np.argmax(probs)
        angles = [0, 90, 180, 270]
        print(f"  {angle:3d}° input -> predicted {angles[predicted]:3d}° "
              f"(conf={probs[predicted]:.3f}, {elapsed*1000:.0f}ms)")

    print("  OK OK")

if __name__ == '__main__':
    test_orientation()
