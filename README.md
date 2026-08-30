# LaTeXSnipper Mobile

基于 Android + Java ONNX Runtime 的 LaTeX 公式 OCR 识别 App，支持完全离线运行。

## 功能

- **公式/文字/混合 OCR 识别** — 图片/PDF/拍照/手写 → LaTeX/文本，Android 端 ONNX Runtime 本地推理
- **MathLive 公式编辑器** — 所见即所得数学公式编辑，支持三态键盘切换（关闭 / MathLive 虚拟键盘 / 系统原生键盘）、智能模式、符号工具栏
- **手写画板** — 墨迹平滑、压感、撤销/重做/调整画布
- **历史记录** — IndexedDB 存储，收藏夹管理，滑动手势（右滑删除、左滑分享/复制/收藏）
- **Core 统一文档语义** — OCR 后生成 LaTeXSnipper Core Document AST，并由 Core 统一导出 LaTeX / MathML / Markdown / HTML / Typst
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
| 统一文档与语义转换 | LaTeXSnipper Core 3.2.0 (WASM，API v3 / Document schema 1.0.0) |
| 公式检测 | YOLOv8 |
| 公式识别 | TrOCR (DeiT 编码器 + 束搜索解码) |
| 文字检测 | DBNet (PP-OCRv5) + Moore-Neighbor 轮廓追踪 |
| 文字识别 | CRNN (PP-OCRv5) + CTC 解码 |
| 方向检测 | PP-LCNet 文档方向（内置 APK） |
| 公式渲染 | KaTeX 0.17 / MathJax（可切换） |
| 公式编辑 | MathLive 0.104 |
| 文档转换 | pandoc-wasm 1.0（按需下载，不内置 APK） |
| 文本导出 | LaTeXSnipper Core（LaTeX / MathML / Markdown / HTML / Typst）+ pandoc-wasm（DOCX / Plain） |
| PDF 渲染 | pdfjs-dist 4.2 |
| 移动框架 | Capacitor 8 (Android/iOS) |
| 存储 | IndexedDB (idb 封装) |

### Core 接入边界

- Android 识别仍使用已经可工作的 Java ONNX Runtime 管线；识别完成后进入 Core 3 的 API 协商、Document AST 校验与语义导出。
- 浏览器与 Capacitor 都懒加载同一份固定版本 Core WASM，Core 初始化失败会在 `result.meta.core` 中明确记录，但不会丢弃已完成的 OCR 结果。
- 当前 Core Android/iOS FFI 的识别运行时仍是 stub，因此尚未用它替换生产推理。待 Core 提供非 stub 移动运行时后，再将推理节点迁入 native FFI，Document AST 不需要再次改版。

## 快速开始

```bash
npm install           # 安装依赖
npm run dev           # Vite 开发服务器 (:5174)
npm run build         # 构建到 dist/
npm run test:core     # 实际加载 Core WASM，验证 AST、转换与失败回退
```

### Android

```bash
npx cap sync android  # 同步到 Android
cd android && ./gradlew assembleDebug  # 编译 debug APK
```

### iOS（需要 macOS + Xcode）

```bash
# 推荐：构建后自动打开 Xcode，在 Xcode 里选签名后点 Run
bash scripts/build-ios.sh

# 仅构建模拟器版本
bash scripts/build-ios.sh --simulator

# 构建真机 IPA
bash scripts/build-ios.sh --device
```

免费 Apple ID 即可签名（不需要 $99 开发者账号），限制：每 7 天需重新签名，最多同时装 3 个 app。

## 测试

```bash
node test/test_behavior_consistency.js   # 行为一致性（112 项）
node test/test_integration.js            # 项目结构检查（221 项）
node test/test_user_workflows.js         # 全用户流程（154 项）
node test/test_e2e.js                    # 端到端全量（303 项）
npm run test:core                        # Core WASM 契约与失败降级
npm run test:device-core                 # 可选：ADB/CDP 真机原生 OCR → Core smoke
bash test/run_tests.sh                   # 全部 10 项（含 Python OCR 模型测试）
```

| # | 测试 | 类型 | 项数 |
|--|------|------|------|
| 1 | 行为一致性（Pipeline/OcrResult/Registry/目录结构） | Node.js | 112 |
| 2 | 集成测试（结构/模块/配置/国际化） | Node.js | 221 |
| 3 | 用户工作流（Boot→OCR→Result→Export→Editor→History） | Node.js | 154 |
| 4 | E2E 全量测试（20 大类模块） | Node.js | 303 |
| 5-11 | OCR 模型（公式检测/识别/文字检测/识别/端到端管线/混合排版/方向检测） | Python | 7 |

## 项目结构

```
LaTeXSnipper_mobile/
├── index.html                 # 单页面 SPA，4 个 Tab 页面
├── public/
│   ├── vendor/                # 内置库 (katex/mathlive/pdfjs)
│   ├── models/                # 内置模型（doc-ori ONNX + tokenizer/keys fallback）
│   └── ...
├── model-sources/             # 打包用 ONNX 源文件（.gitignore，不进 APK）
├── dist-models/               # 打包输出（.gitignore）
│   ├── model-manifest.json    # 清单文件（含 baseUrl/mirrors/checksums）
│   └── latexsnipper-*.zip     # 模型 ZIP 包
├── src/
│   ├── main.js                # 入口（17 行）：await bootstrap → await createApp → await start
│   ├── core/                  # 基础设施
│   │   ├── bootstrap.js       # 平台初始化（Theme/SW/Tab/PWA）
│   │   ├── app.js             # 模块加载/事件注册/业务逻辑
│   │   ├── core-runtime.js    # Core WASM 协商、Document AST 与语义转换
│   │   ├── logger.js          # 日志收集
│   │   ├── i18n.js            # 国际化引擎
│   │   ├── event-registry.js  # EventRegistry（registerBinding/bindAll）
│   │   └── lang/              # 语言文件（zh-CN/zh-TW/en/ja/ko）
│   ├── ocr/                   # OCR 管线
│   │   ├── pipeline.js        # OcrPipeline 基类（Metadata: id/name/icon/requiredModels）
│   │   ├── pipeline-registry.js # 注册表（Manifest 自发现 + Lazy 加载 + checkPipelineModels）
│   │   ├── ocr-result.js      # OcrResult/OcrBlock 数据模型
│   │   ├── ocr-native.js      # Android Native Bridge 封装
│   │   ├── recognition.js     # 识别协调器（PDF/外部API/Pipeline调度）
│   │   └── pipelines/         # 可插拔 Pipeline
│   │       ├── manifest.json  # Pipeline 声明（自动发现注册）
│   │       ├── formula.js     # 公式识别（lazy chunk）
│   │       ├── text.js        # 文字识别（lazy chunk）
│   │       └── mixed.js       # 混合识别（lazy chunk）
│   ├── model/                 # 模型管理
│   │   ├── model-manager.js   # 清单解析、下载、导入
│   │   ├── model-analyzer.js  # ONNX protobuf 解析
│   │   ├── model-import.js    # ZIP/单文件导入 UI
│   │   ├── model-settings.js  # 设置页模型管理 UI
│   │   └── package-builder.js # 模型包创建器
│   ├── camera/                # 全屏相机：拍照/框选/套索/四角把手
│   ├── handwriting/           # Canvas 手写板
│   ├── editor/                # MathLive 编辑器 + KaTeX 预览
│   ├── history/               # IndexedDB 历史
│   ├── export/                # 导出模块
│   │   ├── pandoc-export.js   # 统一导出系统（下拉菜单 + 9 种格式）
│   │   ├── latex-generator.js # OcrResult → LaTeX
│   │   ├── markdown-generator.js # OcrResult → Markdown
│   │   └── share.js           # 分享功能
│   ├── settings/              # 设置页面
│   ├── ui/                    # UI 组件（结果/状态/主题/下拉/润色）
│   ├── constants.js           # 全局常量
│   └── styles/                # CSS 样式模块
├── android/                   # Capacitor Android 项目
│   └── app/src/main/java/.../ocr/
│       ├── OcrEngine.java     # 主编排器（formula/text/mixed）
│       ├── OnnxRunner.java    # ONNX Runtime 会话管理
│       ├── ModelConfig.java   # config.json 解析 + 模型文件发现
│       └── ...                # 预处理/后处理/检测/识别
├── test/                      # 测试套件（4 套，785+ 项）
├── scripts/                   # 打包脚本
└── .github/workflows/         # CI/CD
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

PNG / SVG / Typst 无需 pandoc，LaTeX / MathML / Markdown / HTML / Word / Plain Text 需要先在设置中下载 pandoc.wasm（~58 MB）。

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
