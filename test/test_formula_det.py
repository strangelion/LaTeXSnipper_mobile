"""
test_formula_det.py — YOLOv8 formula detection throughput test.
Verifies the model loads, runs inference, and produces the expected output shape.
"""
import sys, os, json, time
import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(__file__))

MODEL_DIR = os.path.join(os.path.dirname(__file__), '..', 'public', 'models')
DET_MODEL = os.path.join(MODEL_DIR, 'mathcraft-formula-det', 'mathcraft-mfd.onnx')

def test_formula_det():
    print(f"  Model: {os.path.getsize(DET_MODEL)/1024/1024:.1f} MB")

    import onnxruntime as ort
    sess = ort.InferenceSession(DET_MODEL, providers=['CPUExecutionProvider'])

    inp = sess.get_inputs()[0]
    out = sess.get_outputs()[0]
    print(f"  Input: {inp.name} {inp.shape}")
    print(f"  Output: {out.name} {out.shape}")

    # Create test input: 768x768 letterbox with noise
    img = np.random.randint(0, 255, (768, 768, 3), dtype=np.uint8).astype(np.float32) / 255.0
    img_chw = np.transpose(img, (2, 0, 1))[np.newaxis, :, :, :].astype(np.float32)

    t0 = time.time()
    output = sess.run([out.name], {inp.name: img_chw})
    elapsed = time.time() - t0

    print(f"  Time: {elapsed*1000:.0f}ms")
    print(f"  Output shape: {output[0].shape}")

    # Expected: [1, 6, N] where N is anchor count (12096 for 768x768)
    assert len(output[0].shape) == 3, f"Expected 3D output, got {output[0].shape}"
    assert output[0].shape[1] == 6, f"Expected 6 channels, got {output[0].shape[1]}"

    # Check postprocessing
    from test_utils import formula_det_postprocess
    boxes = formula_det_postprocess(output[0][0], 768, 768, 1.0, 0, 0)
    print(f"  Boxes after postprocess: {len(boxes)}")

    print("  OK OK")

if __name__ == '__main__':
    test_formula_det()
