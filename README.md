# LaTeXSnipper Mobile

基于 Android + Java ONNX Runtime 的 LaTeX 公式 OCR 识别 App，支持完全离线运行。

## 功能

- **公式/文字/混合 OCR 识别** — 图片/PDF/拍照/手写 → LaTeX/文本，Android 端 ONNX Runtime 本地推理
- **MathLive 公式编辑器** — 所见即所得数学公式编辑，支持三态键盘切换（关闭 / MathLive 虚拟键盘 / 系统原生键盘）、智能模式、符号工具栏
- **手写画板** — 墨迹平滑、压感、撤销/重做/调整画布
- **历史记录** — IndexedDB 存储，收藏夹管理，滑动手势（右滑删除、左滑分享/复制/收藏）
- **多格式导出** — PNG / SVG / LaTeX / MathML / Markdown / HTML / Typst / Word (.docx) / Plain Text
- **AI 整理** — 连接 DeepSeek 兼容 API 对识别结果进行纠错和格式化
- **公式渲染引擎切换** — KaTeX（轻量快速）/ MathJax（兼容性更好）
- **模型按需下载** — doc-ori 方向检测模型内置 APK，其他 OCR 模型通过 ZIP 包下载，支持镜像加速 + 断点续传 + SHA256 校验
- **7 套视觉皮肤** — Material 蓝、MIUI 渐变、iOS 蓝、樱花和风、黑客矩阵、暖咖纸墨、极简纤白
- **GPU 加速** — Android NNAPI (OpenGL/Vulkan/NPU) 加速推理
- **日/夜主题** — 自动跟随系统或手动切换
- **多语言** — 简体中文、繁体中文、英文、日文、韩文
- **自动更新检查** — 启动时检测 GitHub Release，有新版本弹窗提示

## 技术栈

| 组件 | 技术 |
|------|------|
| 构建 | Vite 8 + Rollup 4 |
| OCR 引擎 | ONNX Runtime Android (Java) |
| 公式检测 | YOLOv8 |
| 公式识别 | TrOCR (DeiT 编码器 + 束搜索解码) |
| 文字检测 | DBNet (PP-OCRv5) + Moore-Neighbor 轮廓追踪 |
| 文字识别 | CRNN (PP-OCRv5) + CTC 解码 |
| 方向检测 | PP-LCNet 文档方向（内置 APK） |
| 公式渲染 | KaTeX 0.17 / MathJax（可切换） |
| 公式编辑 | MathLive 0.104 |
| 文档转换 | pandoc-wasm 1.0 |
| 文本导出 | 纯 JS LaTeX → Typst 转换器（200+ 符号映射） |
| PDF 渲染 | pdfjs-dist 4.2 |
| 移动框架 | Capacitor 8 (Android/iOS) |
| 存储 | IndexedDB (idb 封装) |

## 快速开始

```bash
npm install           # 安装依赖
npm run dev           # Vite 开发服务器 (:5174)
npm run build         # 构建到 dist/
npx cap sync android  # 同步到 Android
cd android && ./gradlew assembleDebug  # 编译 debug APK
```

## 测试

```bash
conda activate ppocr_finetune
bash test/run_tests.sh   # 全部 10 项测试
```

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
│   ├── models/                # 内置模型（doc-ori ONNX + tokenizer/keys fallback）
│   ├── fonts/                 # 中文字体
│   └── ...
├── model-sources/             # 打包用 ONNX 源文件（.gitignore，不进 APK）
│   ├── mathcraft-formula-det/ # YOLOv8 公式检测
│   ├── mathcraft-formula-rec/ # TrOCR 公式识别 + tokenizer
│   ├── mathcraft-text-det/    # DBNet 文字检测
│   ├── mathcraft-text-rec/    # CRNN 文字识别 + keys 字典
│   └── mathcraft-doc-ori/     # 方向检测（也内置 APK）
├── dist-models/               # 打包输出（.gitignore）
│   ├── model-manifest.json    # 清单文件（含 baseUrl/mirrors/checksums）
│   └── latexsnipper-*.zip     # 模型 ZIP 包
├── src/
│   ├── main.js                # 入口
│   ├── model-manager.js       # 模型清单、下载（镜像+断点续传+SHA256）、导入
│   ├── camera/                # 全屏相机：拍照/框选/套索/四角把手
│   ├── handwriting/           # Canvas 手写板
│   ├── editor/                # MathLive 编辑器 + KaTeX 预览
│   ├── history/               # IndexedDB 历史
│   ├── settings/              # 设置页面
│   ├── ui/                    # UI 组件（识别/结果/模型管理/导入/打包）
│   ├── lang/                  # 多语言 (zh-CN/zh-TW/en/ja/ko)
│   └── native/                # Android Native Bridge
├── android/                   # Capacitor Android 项目
│   └── app/src/main/java/.../ocr/
│       ├── OcrEngine.java     # 主编排器（formula/text/mixed）
│       ├── OnnxRunner.java    # ONNX Runtime 会话管理
│       ├── ModelConfig.java   # config.json 解析 + 模型文件发现
│       └── ...                # 预处理/后处理/检测/识别
├── scripts/
│   └── package-models.js      # 模型打包（config.json + SHA256 + 镜像）
└── .github/workflows/
    ├── build-apk.yml          # Android APK 构建
    ├── package-models.yml     # 模型打包 + Release 上传
    └── security-scan.yml      # 安全扫描
```

## 模型下载

OCR 模型通过 ZIP 包下载（设置 → 模型管理），doc-ori 方向检测内置 APK。

### 下载源

- **主源**：GitHub Releases
- **镜像**：gh.zwy.one、gh.xxooo.cf（主源失败自动切换）
- **断点续传**：下载中断后重试可从断点继续
- **SHA256 校验**：下载完成后自动验证文件完整性

### 模型包

| 包名 | 大小 | 内容 |
|------|------|------|
| `latexsnipper-formula-det.zip` | 66.5 MB | YOLOv8 公式检测 + config.json |
| `latexsnipper-formula-rec.zip` | 103.7 MB | TrOCR 公式识别 + tokenizer.json + config.json |
| `latexsnipper-text-det.zip` | 4.2 MB | DBNet 文字检测 + config.json |
| `latexsnipper-text-rec.zip` | 13.5 MB | CRNN 文字识别 + ppocrv5_keys.txt + config.json |
| `latexsnipper-models-all.zip` | 187.9 MB | 以上全部合集 |

### manifest 格式

```json
{
  "baseUrl": "https://github.com/.../releases/download/models-v1.3.0",
  "mirrors": ["https://gh.zwy.one/https://github.com/..."],
  "checksums": { "latexsnipper-text-rec.zip": "sha256hex..." },
  "categories": { ... }
}
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

GNU AGPL-3.0。允许学习和个人使用，禁止闭源商业化分发。修改后分发或网络服务必须公开全部源码。
