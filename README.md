# LaTeXSnipper Mobile

基于 Android + Java ONNX Runtime 的完全离线 LaTeX 公式 OCR 识别 App。

## 功能

- **公式/文字/混合 OCR 识别** — 图片/PDF/拍照/手写 → LaTeX/文本，Android 端 ONNX Runtime 本地推理
- **MathLive 公式编辑器** — 所见即所得数学公式编辑，支持三态键盘切换（关闭 / MathLive 虚拟键盘 / 系统原生键盘）、智能模式、符号工具栏
- **手写画板** — 墨迹平滑、压感、撤销/重做/调整画布
- **历史记录** — IndexedDB 存储，收藏夹管理，滑动手势（右滑删除、左滑分享/复制/收藏）
- **多格式导出** — PNG / SVG / LaTeX / MathML / Markdown / HTML / Typst / Word (.docx) / Plain Text
- **AI 整理** — 连接 DeepSeek 兼容 API 对识别结果进行纠错和格式化
- **公式渲染引擎切换** — KaTeX（轻量快速）/ MathJax（兼容性更好）
- **完全离线** — 所有模型和依赖内置，安装后无需网络
- **7 套视觉皮肤** — Material 蓝、MIUI 渐变、iOS 蓝、樱花和风、黑客矩阵、暖咖纸墨、极简纤白
- **GPU 加速** — Android NNAPI (OpenGL/Vulkan/NPU) 加速推理
- **日/夜主题** — 自动跟随系统或手动切换
- **多语言** — 简体中文、繁体中文、英文、日文、韩文
- **自动更新检查** — 启动时检测 GitHub Release，有新版本弹窗提示

## 技术栈

| 组件 | 技术 |
|------|------|
| 构建 | Vite 5 + vite-plugin-wasm + top-level-await |
| OCR 引擎 | ONNX Runtime Android (Java) |
| 公式检测 | YOLOv8 (mathcraft-mfd) |
| 公式识别 | TrOCR (DeiT 编码器 + 束搜索解码) |
| 文字检测 | DBNet (PP-OCRv5) + Moore-Neighbor 轮廓追踪 |
| 文字识别 | CRNN (PP-OCRv5) + CTC 解码 |
| 方向检测 | PP-LCNet 文档方向 + EXIF 自动旋转 |
| 公式渲染 | KaTeX 0.17 |
| 公式编辑 | MathLive 0.98 |
| 文档转换 | pandoc-wasm 1.0（Markdown/HTML/LaTeX/MathML/docx 导出） |
| 文本导出 | 纯 JS LaTeX → Typst 转换器（200+ 符号映射 + 结构转换） |
| PDF 渲染 | pdfjs-dist 3.11 |
| 移动框架 | Capacitor 8 (Android/iOS) |
| 存储 | IndexedDB (idb 封装) |

## 快速开始

```bash
npm install        # 安装依赖
npm run dev        # Vite 开发服务器 (:5174)
npm run build      # 构建到 dist/
npx cap sync android  # 同步到 Android
cd android && ./gradlew assembleDebug  # 编译 debug APK
```

## 测试

```bash
conda activate ppocr_finetune
bash test/run_tests.sh   # 全部 10 项测试
```

测试包括：

| # | 测试 | 类型 | 项数 |
|--|------|------|------|
| 1-7 | OCR 模型（公式检测/识别/文字检测/识别/端到端管线/混合排版/方向检测） | Python | 7 |
| 8 | Pandoc WASM 导出 + Typst 转换器 | Node.js | 43 |
| 9 | KaTeX 公式渲染 | Node.js | 35 |
| 10 | 集成测试（结构/模块/配置/国际化） | Node.js | 227 |
| — | E2E 全量测试（20 大类模块） | Node.js | 308 |

## 项目结构

```
LaTeXSnipper_mobile/
├── index.html                 # 单页面 SPA，4 个 Tab 页面
├── public/
│   ├── vendor/                # 内置库 (katex/mathlive/pdfjs)
│   │   ├── katex.min.js       # KaTeX 公式渲染 (265KB)
│   │   ├── katex.min.css      # KaTeX CSS + 字体
│   │   └── fonts/             # KaTeX 符号字体
│   ├── models/                # ONNX 模型文件
│   ├── fonts/                 # 中文字体
│   ├── sw.js                  # Service Worker
│   └── manifest.json          # PWA 清单
├── src/
│   ├── main.js                # 入口：模块组装、事件绑定、启动
│   ├── constants.js           # 全局常量
│   ├── update-checker.js      # GitHub Releases 自动更新检查
│   ├── lang/                  # 多语言 (zh-CN/zh-TW/en/ja/ko)
│   ├── native/                # Android Native Bridge 封装
│   │   └── ocr-native.js      # window.NativeOcr 异步调用封装
│   ├── shared/                # 通用工具
│   │   ├── share.js           # 分享/文件保存
│   │   └── logger.js          # 日志（localStorage + Java 桥接 + DOM 事件）
│   ├── camera/                # 全屏相机：拍照/框选/套索/四角把手/旋转
│   ├── handwriting/           # Canvas 手写板 + 导出
│   ├── editor/                # MathLive 编辑器 + 虚拟键盘 + KaTeX 预览
│   ├── export/                # 导出模块
│   │   └── pandoc-export.js   # 统一导出（Pandoc WASM + KaTeX 图片 + Typst 转换器）
│   ├── history/               # IndexedDB 历史 (idb 封装)
│   ├── settings/              # 设置页面逻辑
│   ├── ui/                    # UI 组件
│   │   ├── ui.js              # 状态栏/拖放/模式切换
│   │   ├── result.js          # 结果显示/KaTeX预览/复制/分享/导出
│   │   ├── recognition.js     # 识别入口（Native/External/PDF）
│   │   ├── splash.js          # 启动加载进度
│   │   ├── custom-select.js   # 自定义下拉选择器
│   │   ├── status.js          # 状态条/进度条/错误显示
│   │   ├── theme.js           # 日/夜主题切换
│   │   ├── polish.js          # AI 整理（DeepSeek API）
│   │   └── dom-refs.js        # DOM 元素引用共享
│   └── styles/                # CSS 样式模块
│       ├── base.css           # CSS 变量、布局、导航、自定义下拉、导出下拉
│       ├── ocr.css            # 识别页面 + 导出下拉样式
│       ├── editor.css         # MathLive + KaTeX 预览 + 符号工具栏 + 键盘按钮
│       ├── handwriting.css    # 手写板
│       ├── history.css        # 历史记录滑动
│       └── mobile.css         # 移动端适配
├── android/                   # Capacitor Android 项目
│   └── app/src/main/java/com/latexsnipper/app/
│       ├── MainActivity.java  # 入口 + NativeOcrBridge 注入
│       └── ocr/               # Java ONNX OCR 引擎
├── test/                      # 测试套件（6 Python + 4 Node.js）
├── vite.config.js             # Vite + wasm 配置
└── capacitor.config.json      # Capacitor 配置
```

## 导出格式

| 格式 | 路径 | 说明 |
|------|------|------|
| PNG | KaTeX → SVG → Canvas | 高清公式图片 |
| SVG | KaTeX → SVG | 矢量公式图片 |
| LaTeX | Pandoc WASM | .tex 格式 |
| MathML | Pandoc WASM | 数学标记语言 |
| Markdown | Pandoc WASM | `markdown+tex_math_dollars` |
| HTML | Pandoc WASM | 网页 |
| **Typst** | **纯 JS 转换器** | 200+ 符号映射 + 结构转换 |
| Word | Pandoc WASM | .docx 格式 |
| Plain Text | Pandoc WASM | 纯文本 |

## 许可证
Apache License 2.0
