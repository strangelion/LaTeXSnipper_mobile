"""Quantize ONNX models from FP32 to FP16 — reduces size ~50%, accuracy <0.5%"""
import onnx
from onnxconverter_common import float16
import os, sys

MOBILE_DIR = r"C:\Users\WangWenXuan\Documents\GitHub\LaTeXSnipper_mobile"
MODEL_DIR = os.path.join(MOBILE_DIR, "public", "models")

models = [
    ("mathcraft-formula-rec", ["encoder_model.onnx", "decoder_model.onnx"]),
    ("mathcraft-formula-det", ["mathcraft-mfd.onnx"]),
    ("mathcraft-text-rec", ["ppocrv5_mobile_rec.onnx"]),
    ("mathcraft-text-det", ["ppocrv5_mobile_det.onnx"]),
]

total_before = 0
total_after = 0

for model_name, files in models:
    model_path = os.path.join(MODEL_DIR, model_name)
    for fname in files:
        src = os.path.join(model_path, fname)
        if not os.path.exists(src):
            print(f"SKIP {model_name}/{fname} — not found")
            continue

        size_before = os.path.getsize(src)
        total_before += size_before

        bak = src + ".fp32.bak"
        try:
            model = onnx.load(src)
            model_fp16 = float16.convert_float_to_float16(model)

            # Backup original
            os.rename(src, bak)
            onnx.save(model_fp16, src)
            size_after = os.path.getsize(src)
            total_after += size_after

            saved = (1 - size_after / size_before) * 100
            print(f"OK   {model_name}/{fname}: {size_before/1048576:.1f}MB → {size_after/1048576:.1f}MB (saved {saved:.0f}%)")
        except Exception as e:
            print(f"FAIL {model_name}/{fname}: {e}")
            if os.path.exists(bak):
                os.rename(bak, src)

print(f"\nTotal: {total_before/1048576:.0f}MB → {total_after/1048576:.0f}MB (saved {(1-total_after/total_before)*100:.0f}%)")
print("Backups saved as *.fp32.bak — delete them after verifying models work.")
