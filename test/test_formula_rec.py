"""
test_formula_rec.py — TrOCR formula recognition test.
Verifies the full encoder-decoder pipeline + tokenizer decode.
"""
import sys, os, json, time
import numpy as np
from PIL import Image, ImageDraw, ImageFont

sys.path.insert(0, os.path.dirname(__file__))

MODEL_DIR = os.path.join(os.path.dirname(__file__), '..', 'public', 'models')
REC_DIR = os.path.join(MODEL_DIR, 'mathcraft-formula-rec')

ENCODER = os.path.join(REC_DIR, 'encoder_model.onnx')
DECODER = os.path.join(REC_DIR, 'decoder_model.onnx')
TOKENIZER = os.path.join(REC_DIR, 'tokenizer.json')

# Common formulas to test
TEST_FORMULAS = [
    "y = mx + b",
    "E = mc^2",
    "a^2 + b^2 = c^2",
    "x = (-b + sqrt(b^2 - 4ac)) / 2a",
    "sin^2(x) + cos^2(x) = 1",
]

def create_test_image(text, size=(800, 200)):
    """Create a formula image similar to camera/upload input."""
    img = Image.new('RGB', size, (255, 255, 255))
    d = ImageDraw.Draw(img)
    try:
        font = ImageFont.truetype("C:/Windows/Fonts/arial.ttf", 40)
    except:
        font = ImageFont.load_default()
    d.text((20, 20), text, fill=(0, 0, 0), font=font)
    return img

def preprocess(img):
    """Match Java FormulaRecPreProcess: direct 384x384 stretch."""
    resized = img.resize((384, 384), Image.BILINEAR)
    arr = np.array(resized, dtype=np.float32) / 255.0
    arr = (arr - 0.5) / 0.5
    return np.transpose(arr, (2, 0, 1))[np.newaxis, :, :, :]

def decode_tokens(token_ids, id2token):
    parts = []
    for tid in token_ids:
        t = id2token.get(tid, "")
        if t.startswith("<") and t.endswith(">"): continue
        if t.startswith("Ġ"): parts.append(" " + t[1:])
        elif t.startswith("▁"): parts.append(" " + t[1:])
        else: parts.append(t)
    return "".join(parts).strip()

def test_formula_rec():
    print(f"  Models: encoder={os.path.getsize(ENCODER)/1024/1024:.1f}MB, "
          f"decoder={os.path.getsize(DECODER)/1024/1024:.1f}MB")

    import onnxruntime as ort
    enc = ort.InferenceSession(ENCODER, providers=['CPUExecutionProvider'])
    dec = ort.InferenceSession(DECODER, providers=['CPUExecutionProvider'])

    with open(TOKENIZER, encoding='utf-8') as f:
        tok = json.load(f)['model']['vocab']
    id2token = {v: k for k, v in tok.items()}

    enc_in = enc.get_inputs()[0].name
    dec_ins = [i.name for i in dec.get_inputs()]
    print(f"  Encoder input: {enc_in}")
    print(f"  Decoder inputs: {dec_ins}")

    total_time = 0
    passed = 0

    for formula in TEST_FORMULAS:
        img = create_test_image(formula)
        input_tensor = preprocess(img)

        t0 = time.time()
        enc_out = enc.run(None, {enc_in: input_tensor})[0]

        input_ids = np.array([[2]], dtype=np.int64)
        token_ids, scores = [], []

        for _ in range(256):
            logits = dec.run(None, {dec_ins[0]: input_ids, dec_ins[1]: enc_out})[0]
            sl = logits[0, -1, :] - np.max(logits[0, -1, :])
            probs = np.exp(sl) / np.sum(np.exp(sl))
            next_id = int(np.argmax(probs))
            if next_id == 2: break
            token_ids.append(next_id)
            scores.append(float(probs[next_id]))
            input_ids = np.concatenate([input_ids, [[next_id]]], axis=1)

        elapsed = (time.time() - t0) * 1000
        total_time += elapsed

        text = decode_tokens(token_ids, id2token)
        score = sum(scores) / len(scores) if scores else 0

        ok = len(text) > 5
        if ok: passed += 1
        status = "OK" if ok else "SHORT"
        print(f"  {status} ({elapsed:.0f}ms, conf={score:.3f}) '{formula}' -> '{text[:80]}'")

    avg = total_time / len(TEST_FORMULAS)
    print(f"  {passed}/{len(TEST_FORMULAS)} passed, avg {avg:.0f}ms/image")
    assert passed >= len(TEST_FORMULAS) * 0.8, f"Too many failures: {passed}/{len(TEST_FORMULAS)}"

if __name__ == '__main__':
    test_formula_rec()
