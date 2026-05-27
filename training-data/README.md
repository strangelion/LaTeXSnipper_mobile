# Training Data for Region Classifier

## Directory Structure

```
training-data/
  formula/       # Formula region crops (64x64 or larger)
  text/          # Text region crops (64x64 or larger)
  labeled/       # Full images with labeled regions (JSON)
```

## How to Collect Training Data

1. Open the app, upload an image
2. Go to Settings -> Developer Options -> "区域标注工具"
3. Draw rectangles:
   - Long-press drag = formula region (red)
   - Right-click drag = text region (blue)
   - Tap on existing box = toggle type
4. Click "识别" to process and save

## Training Pipeline

```bash
# 1. Install dependencies
pip install torch torchvision onnx onnxruntime pillow

# 2. Train classifier
python train_classifier.py --data-dir ./training-data --epochs 30

# 3. Export to ONNX
python train_classifier.py --export --model best_model.pth

# 4. Copy to public/models/
cp region_classifier.onnx ../public/models/
```

## Model Architecture

- Input: 64x64x3 RGB image patch
- Output: 3 classes (formula, text, background)
- Size: < 1MB (MobileNet-tiny)
- Inference: ONNX Runtime Web (WASM)
