# LaTeXSnipper Mobile

基于 Android + Java ONNX Runtime 的完全离线 LaTeX 公式 OCR 识别 App。

## 功能

- **公式/文字/混合 OCR 识别** — 图片/PDF/拍照/手写 → LaTeX/文本，Android 端 ONNX Runtime 本地推理
- **MathLive 公式编辑器** — 所见即所得数学公式编辑，支持片段插入和计算引擎
- **手写画板** — 墨迹平滑、压感、撤销/重做
- **历史记录** — IndexedDB 存储，收藏夹管理
- **多格式导出** — LaTeX / Markdown / MathML / 文本
- **完全离线** — 所有模型和依赖内置，安装后无需网络
- **GPU 加速** — Android NNAPI (OpenGL/Vulkan/NPU) 加速推理
- **日/夜主题** — 自动跟随系统或手动切换

## 技术栈

| 组件 | 技术 |
|------|------|
| 构建 | Vite 5 |
| OCR 引擎 | ONNX Runtime Android (Java) |
| 公式检测 | YOLOv8 (mathcraft-mfd) |
| 公式识别 | TrOCR (DeiT 编码器 + 束搜索解码) |
| 文字检测 | DBNet (PP-OCRv5) + Moore-Neighbor 轮廓追踪 |
| 文字识别 | CRNN (PP-OCRv5) + CTC 解码 |
| 方向检测 | PP-LCNet 文档方向 |
| 公式渲染 | MathJax 3 (tex-svg) |
| 公式编辑 | MathLive 0.98 |
| PDF 渲染 | pdfjs-dist 3.11 |
| 存储 | IndexedDB (idb) |
| 移动打包 | Capacitor 8 (Android + iOS) |
| Android 桥接 | @JavascriptInterface (NativeOcrBridge)
| 部署 | Cloudflare Pages / Workers |

## 开发

```bash
npm install
npm run dev      # 开发服务器 (localhost:5174)
npm run build    # 构建到 dist/
npm run preview  # 预览构建产物
```

## 构建手机 App

```bash
npm run build                       # 构建 Web 资源
npx cap sync android                # 同步到 Android
npx cap open android                # 在 Android Studio 中打开
cd android && ./gradlew assembleDebug  # 构建 APK
```

APK 约 192MB（含全部模型和离线资源）。

## 桌面端 vs 移动端引擎对比

Android 端使用纯 Java ONNX Runtime 管线，与桌面端 Python `mathcraft-ocr` 实现对标：

| 管线 | 桌面端 (Python) | 移动端 (Java) | 状态 |
|------|----------------|---------------|------|
| **公式检测** | YOLOv8, thresh=0.25, IoU=0.45 | 同左，动态 anchor 数 | ✅ 一致 |
| **公式识别** | TrOCR 贪心解码, max_tokens=512 | TrOCR 束搜索(beam=3), same max_tokens | ✅ 一致 |
| **公式预处理** | 短边 384 + 中心裁剪 | 同左 | ✅ 一致 |
| **文字检测** | RapidOCR DBPostProcess (OpenCV 轮廓追踪) | Moore-Neighbor 轮廓追踪 (纯 Java) | ✅ 一致 |
| **文字预处理** | BGR 48×320, mean=0.5, std=0.5 | 同左 | ✅ 一致 |
| **文字识别** | CRNN CTC 解码 | 同左 + 繁简转换 | ✅ 一致 |
| **混合模式** | 原图检测 → 公式分割 → 行分割 → 版面输出 | 同左 | ✅ 一致 |
| **公式行分割** | 投影分析 → 逐行识别 → `\begin{aligned}` | 同左 | ✅ 一致 |
| **版面输出** | 行分组 + 段落合并 + `$$` 包裹 | 同左 | ✅ 一致 |
| **方向检测** | PP-LCNet 0°/90°/180°/270° + EXIF | 同左 | ✅ 一致 |
| **GPU 加速** | CUDA / CoreML | NNAPI (OpenGL/Vulkan/NPU) | ✅ |
| **推理延迟** | GPU ~2s/图 | NNAPI ~3-5s/图 | ⚠️ 略慢 |

## 目录结构

```
LaTeXSnipper_mobile/
├── index.html                  # 单页面入口
├── public/
│   ├── models/                 # ONNX 模型文件 (249MB)
│   │   ├── mathcraft-formula-det/   # YOLOv8 公式检测
│   │   ├── mathcraft-formula-rec/   # TrOCR 公式识别
│   │   ├── mathcraft-text-det/      # DBNet 文字检测
│   │   └── mathcraft-text-rec/      # CRNN + 方向检测
│   ├── vendor/                 # 内置库 (mathjax/mathlive/pdfjs)
│   ├── fonts/                  # 中文字体
│   ├── sw.js                   # Service Worker
│   └── manifest.json           # PWA 清单
├── src/
│   ├── main.js                 # 入口
│   ├── constants.js            # 常量
│   ├── native/                 # Android 桥接封装
│   ├── shared/                 # 分享/日志工具
│   ├── camera/                 # 相机模块
│   ├── handwriting/            # 手写模块
│   ├── editor/                 # MathLive 配置
│   ├── history/                # IndexedDB 存储
│   ├── settings/               # 设置页面
│   └── ui/                     # UI 组件 + 识别入口
├── android/                    # Capacitor Android 项目
│   └── app/src/main/java/com/latexsnipper/app/ocr/
│       ├── NativeOcrBridge.java        # @JavascriptInterface 桥接
│       ├── OnnxRunner.java             # ONNX Runtime 会话管理
│       ├── OcrEngine.java              # 主编排器
│       ├── DetPreProcess.java          # 公式检测预处理
│       ├── FormulaDetPostProcess.java  # YOLOv8 后处理
│       ├── FormulaRecPreProcess.java   # TrOCR 预处理
│       ├── FormulaRecPostProcess.java  # 束搜索解码
│       ├── FormulaLineSplitter.java    # 多行公式分割
│       ├── TextDetProcessor.java       # DBNet + 轮廓追踪
│       ├── TextRecPreProcess.java      # CRNN 预处理
│       ├── TextRecPostProcess.java     # CTC 解码
│       └── DocOriPreProcess.java       # 方向检测
├── dist/                       # 构建输出
├── vite.config.js
├── capacitor.config.json
└── package.json
```

## 模型

| 模型 | 来源 | 用途 |
|------|------|------|
| `mathcraft-mfd.onnx` | MathCraft | YOLOv8 公式检测 |
| `encoder_model.onnx` + `decoder_model.onnx` | MathCraft (pix2text-mfr) | TrOCR 公式识别 (DeiT + 6层解码器) |
| `ppocrv5_mobile_det.onnx` | PaddleOCR | DBNet 文字检测 |
| `ppocrv5_mobile_rec.onnx` | PaddleOCR | CRNN 文字识别 |
| `pplcnet_doc_ori.onnx` | PaddleOCR | PP-LCNet 文档方向检测 |
| `chinese_detector.onnx` | 自定义训练 | 中文/公式二分类 |

所有模型内置在 `public/models/` 中，安装后完全离线使用。

## 致谢

本项目基于以下优秀的开源项目构建：

- **[LaTeXSnipper](https://github.com/SakuraMathcraft/LaTeXSnipper)** — 桌面端数学公式 OCR 与编辑工具，提供了 OCR 引擎设计、MathLive 中文翻译和完整的公式识别工作流参考
- **[MathCraft OCR](https://github.com/SakuraMathcraft/MathCraft-Models)** — ONNX 公式识别模型（formula-rec），基于 DeiT + TrOCR 架构
- **[ONNX Runtime Web](https://github.com/microsoft/onnxruntime)** — 浏览器端 ONNX 推理引擎，支持 WebGPU/WASM 后端
- **[MathLive](https://cortexjs.io/mathlive/)** — 所见即所得数学公式编辑器，提供虚拟键盘和计算引擎
- **[MathJax](https://www.mathjax.org/)** — LaTeX 公式 SVG 渲染
- **[PDF.js](https://mozilla.github.io/pdf.js/)** — PDF 文档解析与渲染
- **[Capacitor](https://capacitorjs.com/)** — 跨平台 WebView 原生打包
- **[Vite](https://vitejs.dev/)** — 前端构建工具
- **[idb](https://github.com/jakearchibald/idb)** — IndexedDB 异步封装

## 许可证

Apache License 2.0
