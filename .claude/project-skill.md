# LaTeXSnipper Mobile — 项目维护指南

## 代码规范
- JS 使用 ES Module (`import`/`export`)
- CSS 使用 `src/styles/` 分模块管理（base/ocr/editor/handwriting/mobile）
- HTML 标签内联事件用 `pointerdown` 而不是 `click`（WebView 兼容）
- 所有用户可见文本使用 `data-i18n` 属性 + `t()` 函数，禁止硬编码中文
- 语言包在 `src/lang/` 统一管理，新增文本只需加键值对
- 新增功能归到所属模块，不要跨模块散落
- 修改 `public/` 下文件后需重新 `npm run build`
- 提交时**不添加 `Co-Authored-By` 署名行**

---

## 一、项目架构

```
LaTeXSnipper_mobile/
├── index.html                 # 单页面 SPA，4 个 Tab 页面
├── public/
│   ├── vendor/                # 内置库
│   │   ├── katex.min.js       # KaTeX 公式渲染 (265KB)
│   │   ├── katex.min.css      # KaTeX CSS + fonts/ 字体
│   │   ├── mathlive/          # MathLive 编辑器
│   │   └── pdf.min.js         # PDF.js
│   ├── models/                # 模型目录（.gitignore，不打包进 APK）
│   │   └── .gitignore         # 模型文件通过 GitHub Releases 下载
│   ├── fonts/                 # 中文字体
│   ├── sw.js                  # Service Worker
│   └── manifest.json          # PWA 清单
├── src/
│   ├── main.js                # 入口：模块组装、事件绑定、启动
│   ├── constants.js           # 全局常量
│   ├── update-checker.js      # GitHub Releases 自动更新检查
│   ├── lang/                  # 多语言（zh-CN/zh-TW/en/ja/ko）
│   ├── native/                # Android Native Bridge 封装
│   │   └── ocr-native.js      # window.NativeOcr 异步调用封装
│   ├── shared/                # 通用工具模块
│   │   ├── share.js           # 分享功能（Capacitor → 下载降级）
│   │   └── logger.js          # 日志收集（localStorage + Java 桥接 + DOM 事件）
│   ├── camera/                # 全屏相机：拍照/框选/套索/四角把手/旋转
│   ├── handwriting/           # Canvas 手写板 + 导出
│   ├── editor/                # MathLive 编辑器 + 虚拟键盘 + KaTeX 预览
│   ├── export/                # 导出模块
│   │   └── pandoc-export.js   # 统一导出系统（下拉菜单 + 9 种格式）
│   ├── history/               # IndexedDB 存储（idb 封装）
│   ├── settings/              # 设置页面逻辑
│   ├── ui/                    # UI 组件
│   │   ├── ui.js              # 状态栏/进度条/拖放/模式切换
│   │   ├── recognition.js     # 识别入口（Native → External API，模型可用性检查）
│   │   ├── result.js          # 结果显示/KaTeX预览/复制/分享/PDF分页/导出
│   │   ├── splash.js          # 启动加载进度
│   │   ├── custom-select.js   # 自定义下拉选择器
│   │   ├── status.js          # 状态栏（带图标）
│   │   ├── theme.js           # 日/夜主题切换
│   │   ├── polish.js          # AI 整理（DeepSeek API）
│   │   ├── model-settings.js  # 设置页模型管理 UI（源/变体选择/下载/删除/导入）
│   │   ├── model-import.js    # ZIP/单文件导入 UI
│   │   ├── package-builder.js # 模型包创建器（拖入 .onnx → ZIP 导出/直接安装）
│   │   └── dom-refs.js        # DOM 元素引用共享
│   ├── model-manager.js       # 模型清单解析、CRUD、下载、导入、变体合并
│   ├── model-analyzer.js      # ONNX protobuf 解析器（自动推断模型类别）
│   └── styles/                # CSS 样式模块
│       ├── base.css           # CSS 变量、布局、导航、自定义下拉
│       ├── ocr.css            # 识别页面 + 导出下拉菜单样式
│       ├── editor.css         # MathLive + KaTeX 预览 + 符号工具栏
│       ├── handwriting.css    # 手写板
│       ├── history.css        # 历史记录滑动
│       └── mobile.css         # 移动端适配
├── android/                   # Capacitor Android 项目
│   └── app/src/main/java/com/latexsnipper/app/
│       ├── MainActivity.java  # 入口 + NativeOcrBridge 注入
│       └── ocr/               # Java ONNX OCR 引擎
│           ├── NativeOcrBridge.java    # @JavascriptInterface 桥接
│           ├── OnnxRunner.java         # ONNX Runtime 会话管理
│           ├── OcrEngine.java          # 主编排器（formula/text/mixed）
│           ├── DetPreProcess.java      # 公式检测预处理
│           ├── FormulaDetPostProcess.java  # YOLOv8 后处理
│           ├── FormulaRecPreProcess.java   # TrOCR 预处理
│           ├── FormulaRecPostProcess.java  # 束搜索解码
│           ├── FormulaLineSplitter.java    # 多行公式行分割
│           ├── TextDetProcessor.java       # DBNet 轮廓追踪
│           ├── TextRecPreProcess.java      # CRNN 预处理
│           ├── TextRecPostProcess.java     # CTC 解码
│           ├── DocOriPreProcess.java       # 方向检测
│           ├── ModelConfig.java            # config.json 解析 + 模型文件发现
│           └── ImagePreProcess.java        # 图像增强
├── test/                      # 测试套件
│   ├── run_tests.sh           # 一键运行全部（10 项）
│   ├── test_*.py              # OCR 模型测试（7 项 Python）
│   ├── test_pandoc_export.js  # Pandoc WASM + Typst 导出（45 项）
│   ├── test_katex.js          # KaTeX 公式渲染（35 项）
│   ├── test_integration.js    # 集成/模块/配置检查（227 项）
│   └── test_e2e.js            # 全量 E2E（20 大类 309 项）
├── scripts/
│   ├── package-models.js      # 模型打包脚本（生成 per-category + 完整 ZIP）
│   └── quantize.py            # 模型量化
├── vite.config.js             # Vite 8 配置（wasm + top-level-await 原生支持）
├── SECURITY.md                # 安全政策
├── capacitor.config.json      # Capacitor 配置
└── .github/workflows/
    ├── build-apk.yml                  # Android APK 构建（workflow_dispatch）
    ├── build-ios.yml                  # iOS 模拟器构建
    ├── package-models.yml             # 模型打包 + 上传 GitHub Releases
    └── security-scan.yml              # 安全扫描
```

---

## 二、Tab 页面结构

| Tab | ID | 功能 |
|-----|-----|------|
| 识别 | `#page-ocr` | 图片/PDF/拍照/手写识别，模式选择（公式/文本/混合） |
| 编辑器 | `#page-editor` | MathLive 所见即所得编辑，KaTeX 预览，虚拟键盘，符号工具栏，导出 |
| 历史 | `#page-history` | IndexedDB 列表，收藏筛选，滑动删除/分享/复制，点击填入编辑器 |
| 设置 | `#page-settings` | 识别引擎选择、加速模式、外部 API 配置、预设、皮肤、语言、AI 整理配置、开发者模式、更新检查 |

---

## 三、识别引擎架构

Android 端使用纯 Java ONNX Runtime 管线，桌面端 Python `mathcraft-ocr` 实现对标。

### 公式识别 (formula mode)
```
图片 → FormulaDetPreProcess (768×768 letterbox)
  → 公式检测 (YOLOv8) → 结果区域 → 每个区域:
    → FormulaRecPreProcess (短边384+中心裁剪) → TrOCR 编码器(DeiT) → 束搜索解码(beam=3)
    → LaTeX 修复 → 输出
```

### 文字识别 (text mode)
```
图片 → TextDetPreProcess (最长边960, stride32对齐)
  → DBNet 推理 → Moore-Neighbor 轮廓追踪 → unclip → box_thresh=0.5
  → 每个文本框 → TextRecPreProcess (BGR 48×320) → CRNN 推理 → CTC 解码
  → 输出文本
```

### 混合模式 (mixed mode)
```
图片 → 公式检测 (YOLOv8) + 文字检测 (DBNet)
  → splitTextBoxAroundFormulas (按公式 x 范围 + y 重叠分割)
    → 公式段 → crop 使用 formulaDet 框坐标 → 公式行分割/单行识别
    → 文字段 → crop 使用 textDet 框坐标 → 直接 CRNN 识别
  → 独立显示公式加入 → overlap check 去重（使用正确坐标避免重复）
  → 行分组（union box y-overlap≥0.45）
  → 版面输出（inline 用 $…$，display 用 $$\n…\n$$）
```

### 桥接通信

```
JS → window.NativeOcr.recognizeFormula(base64) → NativeOcrBridge (后台线程)
  → OcrEngine → ONNX Runtime Android
  → 结果 JSON → JS 轮询 getResult(key) 获取
```

- 识别异步：Java 后台线程执行，JS 每 200ms 轮询
- 结果 JSON 含 `text`/`latex`/`confidence`/`timeMs`/`regions`（混合模式）

---

## 四、ONNX 模型清单（按需下载，doc-ori 内置）

模型通过 ZIP 包下载导入，doc-ori 方向检测模型内置 APK（6.5 MB）。
ZIP 包格式对齐 HuggingFace ONNX + PaddleOCR 规范，每个包含 `config.json`。

| 类别 | 默认 variant ID | 模型文件 | 分发方式 |
|------|----------------|----------|----------|
| `formula-det` | `yolov8-mfd` | `mathcraft-mfd.onnx` | 下载 ZIP |
| `formula-rec` | `trocr-deit` | `encoder_model.onnx` + `decoder_model.onnx` + `tokenizer.json` | 下载 ZIP |
| `text-det` | `ppocrv5-mobile` | `ppocrv5_mobile_det.onnx` | 下载 ZIP |
| `text-rec` | `ppocrv5-mobile` | `ppocrv5_mobile_rec.onnx` + `ppocrv5_keys.txt` | 下载 ZIP |
| `doc-ori` | `pplcnet-doc-ori` | `pplcnet_doc_ori.onnx` | **内置 APK** |

### ZIP 包结构

```
{category}/{variantId}/
  model.onnx (或 encoder_model.onnx + decoder_model.onnx)  — ONNX 模型权重
  config.json                                               — 模型自描述（类型/输入/输出/预处理/后处理）
  tokenizer.json / ppocrv5_keys.txt                         — 解码器字典文件
```

### ModelConfig.java — config.json 解析

```java
ModelConfig.load(modelDir)       // 从模型目录读取 config.json
ModelConfig.findModelFile(dir)   // 发现 ONNX 文件（model.onnx → *.onnx）
ModelConfig.findEncoderFile(dir) // 发现编码器 ONNX（encoder.onnx → encoder_model.onnx）
ModelConfig.findDecoderFile(dir) // 发现解码器 ONNX
ModelConfig.findTokenizerFile(dir) // 发现字典文件（tokenizer.json → ppocr_keys.txt）
```

注意：已知模型加载使用**硬编码文件名**（避免多 ONNX 目录误选），`findModelFile` 仅供第三方模型发现使用。

### 模型管理系统

```
JS 端:
  model-manager.js    — 清单解析、CRUD、下载、导入、变体合并
  model-analyzer.js   — ONNX protobuf 解析，自动推断类别
  model-import.js     — ZIP/单文件导入 UI
  model-settings.js   — 设置页模型管理（源/变体/下载/删除）
  package-builder.js  — 应用内模型包创建器

Java 端:
  ModelManager.java   — 文件路径、活跃变体（SharedPreferences）、安装状态
  OnnxRunner.java     — 动态加载（文件系统优先 → 资产回退 → null）
  NativeOcrBridge.java — getModelStatus() 返回各模型可用状态
```

### 存储路径

- JS: `localStorage` (sources/active/installed/manifests) + Capacitor Filesystem (`DATA/models/{category}/{variantId}/`)
- Java: `SharedPreferences "ModelManagerPrefs"` + `ctx.getFilesDir()/models/{category}/{variantId}/`

### 打包脚本

```bash
node scripts/package-models.js --output dist-models
# 生成: dist-models/latexsnipper-{category}.zip + model-manifest.json
# ONNX 源文件在 model-sources/（不被 Vite 清理）
# 每个 ZIP 包含 config.json（自动从 CATEGORY_MAP 生成）
```

### 模型目录结构

```
model-sources/          ← 打包源文件（.gitignore，不在 git 中）
  mathcraft-formula-det/
  mathcraft-formula-rec/
  mathcraft-text-det/
  mathcraft-text-rec/
  mathcraft-doc-ori/

public/models/          ← 仅含内置 APK 的文件
  mathcraft-doc-ori/pplcnet_doc_ori.onnx  ← 内置方向检测（6.5 MB）
  mathcraft-formula-rec/tokenizer.json     ← 公式 tokenizer fallback
  mathcraft-text-rec/ppocrv5_keys.txt      ← 文字 CTC 字典 fallback
```

---

## 五、关键参数

| 参数 | 值 | 说明 |
|------|-----|------|
| det 置信度阈值 | 0.25 | 匹配桌面端 |
| det NMS IoU | 0.45 | 匹配桌面端 |
| rec max_tokens | 512 | 匹配桌面端 |
| det thresh | 0.3 | RapidOCR 默认 |
| box_thresh | 0.5 | RapidOCR 默认 |
| unclip_ratio | 1.6 | RapidOCR 默认 |
| min_text_score | 0.45 | 文字置信度过滤 |
| largeHeap | true | AndroidManifest.xml |

---

## 六、多语言系统

```
用户切换语言 → setLang(code) → 加载语言包 → translateDOM() 批量更新
                                  └→ onLangChange 回调（更新动态文本）
```

- 静态 HTML：`data-i18n` / `data-i18n-html` / `data-i18n-title`
- 动态 JS：`import { t } from './lang/i18n.js'`
- 新增语言：复制 zh-CN.js → 翻译 → 在 LANG_MAP 注册 → 加 HTML 选项
- 所有用户可见文本必须通过 i18n 系统，禁止硬编码

### 现有语言

| 语言 | 文件 |
|------|------|
| 简体中文 | `src/lang/zh-CN.js` |
| 繁体中文 | `src/lang/zh-TW.js` |
| 英文 | `src/lang/en.js` |
| 日文 | `src/lang/ja.js` |
| 韩文 | `src/lang/ko.js` |

---

## 七、导出系统

导出下拉菜单位于 OCR 结果卡和编辑器底部，共 9 种格式：

| 格式 | 转换引擎 | 说明 |
|------|---------|------|
| PNG | KaTeX → SVG → Canvas | 高清公式图片 |
| SVG | KaTeX → SVG | 矢量公式图片 |
| LaTeX | Pandoc WASM | .tex 格式 |
| MathML | Pandoc WASM | 数学标记语言 |
| Markdown | Pandoc WASM | `markdown+tex_math_dollars` |
| HTML | Pandoc WASM | 网页 |
| **Typst** | **纯 JS 转换器** | 符号表 + 结构转换，不依赖 Pandoc |
| Word | Pandoc WASM | .docx 格式 |
| Plain Text | Pandoc WASM | 纯文本 |

Typst 转换器（`pandoc-export.js`）：
- 200+ LaTeX→Typst 符号映射（希腊字母、运算符、箭头、关系符、函数名）
- 结构转换：`\frac`、`\sqrt`、`\binom`、`\begin{cases}`、矩阵环境、`\text`、`\underline`、`\hat`/`\vec` 等
- 混合内容分段：`$...$`/`$$...$$` 解析，只转换公式段，文本段保留
- 预处理：`\textcolor`、`\cfrac`、`\sideset`、`\varnothing`、`#?` 等修复

---

## 八、构建与部署

```bash
npm install            # 安装依赖
npm run dev            # Vite 开发服务器（:5174）
npm run build          # 构建到 dist/
npx cap sync android   # 同步到 Android
cd android && ./gradlew assembleDebug  # 编译 debug APK

# 安全合规检查
npx eslint . --no-eslintrc --config <(echo '{"parserOptions":{"ecmaVersion":2022,"sourceType":"module"},"env":{"browser":true,"es2022":true},"rules":{"no-eval":"error","no-implied-eval":"error","no-undef":"error","no-debugger":"error"}}')||true

# GitHub Actions 打包（Release）
# Actions → Build Android APK → 输入版本号 + 勾选 Release → Run workflow
```

### 测试
```bash
# Node.js 测试（无需 conda）
node test/test_pandoc_export.js   # Pandoc + Typst 导出
node test/test_katex.js           # KaTeX 渲染
node test/test_integration.js     # 项目结构检查
node test/test_e2e.js             # 全量 E2E

# 全部测试（含 OCR 模型）
conda activate ppocr_finetune
bash test/run_tests.sh
```

### 注意事项
1. **模型按需下载** — ONNX 模型不再内置 APK（~220MB），通过设置页下载 ZIP 包导入，或使用外部 API
2. **模型加载优雅失败** — 缺失模型不崩溃，`loadModelData` 返回 null，`createSession` 返回 null，OcrEngine 跳过并记录
3. **外部 API 独立** — 选择外部 API 模式时不加载本地模型，`initModels()` 直接跳过
4. **图片解码** — `is.available()` 在 APK 压缩资产中返回压缩后大小，必须用 `ByteArrayOutputStream` 分段读取
5. **文件分享** — Capacitor Share 传 base64 文件在某些 Android 版本失败时，直接触发下载而非弹系统分享
6. **MathLive 自定义元素** — `<mathlive-field>` 在部分 WebView 中不注册，改用 `new MathfieldElement()` 创建
7. **虚拟键盘策略** — 三态切换：`manual`(关闭) → `manual` + `toggleVirtualKeyboard`(MathLive 键盘) → `sandboxed`(系统键盘)
8. **相机按钮** — 必须用 `pointerdown` + `stopPropagation`，`click` 在 WebView 中不可靠
9. **COOP/COEP 头** — Capacitor 和 Vite 中已配置
10. **iOS 构建** — 需要 Apple Developer（$99/年），CI 只能验证模拟器编译
11. **大图拍照** — >500KB 自动压缩到最长边 1920px
12. **KaTeX 替换 MathJax** — 公式渲染使用 KaTeX HTML 渲染，轻量快速
13. **Typst 不经过 Pandoc WASM** — Typst 导出使用纯 JS 符号映射 + 结构转换器
