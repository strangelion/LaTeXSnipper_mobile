import sys, os, paddle
from paddle.static import InputSpec

model_dir = '/mnt/c/Users/WangWenXuan/AppData/Local/Temp/ppocrv5/PP-OCRv5_mobile_rec_infer'
save_file = '/mnt/c/Users/WangWenXuan/Documents/GitHub/LaTeXSnipper_mobile/public/models/mathcraft-text-rec/ppocrv5_official_rec.onnx'

print('Loading model...')
model = paddle.jit.load(model_dir + '/inference')
print('Model loaded, exporting to ONNX...')

paddle.onnx.export(
    model,
    save_file,
    input_spec=[InputSpec(shape=[1, 3, 48, 320], dtype='float32')],
    opset_version=14,
)
print(f'Exported: {save_file}')
print(f'Size: {os.path.getsize(save_file)} bytes')
