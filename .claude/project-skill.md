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
│   ├── models/                # ONNX 模型文件
│   │   ├── mathcraft-formula-det/   # YOLOv8 公式检测
│   │   ├── mathcraft-formula-rec/   # TrOCR 公式识别
│   │   ├── mathcraft-text-det/      # DBNet 文字检测
│   │   ├── mathcraft-text-rec/      # CRNN 文字识别 + 方向检测 + 区域分类
│   │   └── chinese_detector.onnx    # 中文/公式分类
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
│   │   ├── recognition.js     # 识别入口（Native → External API → fallback）
│   │   ├── result.js          # 结果显示/KaTeX预览/复制/分享/PDF分页/导出
│   │   ├── splash.js          # 启动加载进度
│   │   ├── custom-select.js   # 自定义下拉选择器
│   │   ├── status.js          # 状态栏（带图标）
│   │   ├── theme.js           # 日/夜主题切换
│   │   ├── polish.js          # AI 整理（DeepSeek API）
│   │   └── dom-refs.js        # DOM 元素引用共享
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
│           └── ImagePreProcess.java        # 图像增强
├── test/                      # 测试套件
│   ├── run_tests.sh           # 一键运行全部（10 项）
│   ├── test_*.py              # OCR 模型测试（7 项 Python）
│   ├── test_pandoc_export.js  # Pandoc WASM + Typst 导出（45 项）
│   ├── test_katex.js          # KaTeX 公式渲染（35 项）
│   ├── test_integration.js    # 集成/模块/配置检查（227 项）
│   └── test_e2e.js            # 全量 E2E（20 大类 309 项）
├── vite.config.js             # Vite + wasm + top-level-await 配置
├── capacitor.config.json      # Capacitor 配置
└── .github/workflows/
    ├── build-apk.yml         # Android APK 构建（workflow_dispatch）
    └── build-ios.yml         # iOS 模拟器构建
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
图片 → autoOrient (EXIF + PP-LCNet) → FormulaDetPreProcess (768×768 letterbox)
  → 公式检测 (YOLOv8) → 结果区域 → 每个区域:
    → FormulaRecPreProcess (短边384+中心裁剪) → TrOCR 编码器(DeiT) → 束搜索解码(beam=3)
    → LaTeX 修复 → 输出
```

### 文字识别 (text mode)
```
图片 → autoOrient → TextDetPreProcess (最长边960, stride32对齐)
  → DBNet 推理 → Moore-Neighbor 轮廓追踪 → unclip → box_thresh=0.5
  → 每个文本框 → TextRecPreProcess (BGR 48×320) → CRNN 推理 → CTC 解码
  → 输出文本
```

### 混合模式 (mixed mode)
```
图片 → autoOrient → 公式检测 (YOLOv8) → 原图文字检测 (DBNet)
  → splitTextBoxAroundFormulas (按公式 x 范围裁剪)
    → 公式段 → 公式行分割（投影→逐行识别→重组{aligned}）
    → 文字段 → 直接 CRNN 识别
  → 独立显示公式加入 → 去重 → 行分组（union box y-overlap≥0.45）
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

## 四、ONNX 模型清单

| 模型 | 输入 | 输出 | 用途 |
|------|------|------|------|
| `mathcraft-mfd.onnx` | [1,3,768,768] | [1,6,N] | YOLOv8 公式检测 |
| `encoder_model.onnx` | [1,3,384,384] | [1,577,384] | TrOCR 编码器 (DeiT) |
| `decoder_model.onnx` | input_ids + hidden | logits | TrOCR 解码器 |
| `ppocrv5_mobile_det.onnx` | [1,3,H,W] | [1,1,H,W] | DBNet 文字检测 |
| `ppocrv5_mobile_rec.onnx` | [1,3,48,320] | [1,seq,vocab] | CRNN 文字识别 |
| `chinese_detector.onnx` | [N,3,64,64] | [N,2] | 中文/公式分类 |
| `pplcnet_doc_ori.onnx` | [1,3,224,224] | [1,4] | 0°/90°/180°/270° 方向检测 |

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
| Markdown | Pandoc WASM | `markdown+tex_math_dollars` |
| Plain Text | Pandoc WASM | 纯文本 |
| HTML | Pandoc WASM | 网页 |
| **Typst** | **纯 JS 转换器** | 符号表 + 结构转换，不依赖 Pandoc |
| AsciiDoc | Pandoc WASM | 轻量标记语言 |
| reStructuredText | Pandoc WASM | Python 文档生态 |
| OPML | Pandoc WASM | 大纲/思维导图 |

Typst 转换器（`pandoc-export.js`）：
- 200+ LaTeX→Typst 符号映射（希腊字母、运算符、箭头、关系符、函数名）
- 结构转换：`\frac`、`\sqrt`、`\binom`、`\begin{cases}`、矩阵环境、`\text`、`\underline`、`\hat`/`\vec` 等
- 混合内容分段：`$...$`/`$$...$$` 解析，只转换公式段，文本段保留
- 预处理：`\textcolor`、`\cfrac`、`\sideset`、`\varnothing`、`#?` 等修复

---

## 八、构建与部署

```bash
npm run dev              # Vite 开发服务器（:5174）
npm run build            # 构建到 dist/
npx cap sync android     # 同步到 Android
cd android && ./gradlew assembleDebug  # 编译 debug APK

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
1. **模型非常庞大** — encoder_model.onnx 87MB，总模型 ~220MB。低端设备可能 OOM，已启用 `largeHeap` + 模型加载失败自动清理 session
2. **图片解码** — `is.available()` 在 APK 压缩资产中返回压缩后大小，必须用 `ByteArrayOutputStream` 分段读取
3. **文件分享** — Capacitor Share 传 base64 文件在某些 Android 版本失败时，直接触发下载而非弹系统分享（避免"没有应用可执行此操作"）
4. **MathLive 自定义元素** — `<mathlive-field>` 在部分 WebView 中不注册，改用 `new MathfieldElement()` 创建
5. **虚拟键盘策略** — `mathVirtualKeyboardPolicy = 'manual'`，点击键盘按钮弹出，不自动弹出
6. **相机按钮** — 必须用 `pointerdown` + `stopPropagation`，`click` 在 WebView 中不可靠
7. **COOP/COEP 头** — Capacitor 和 Vite 中已配置
8. **iOS 构建** — 需要 Apple Developer（$99/年），CI 只能验证模拟器编译
9. **模型加载** — 所有模型内置在资产文件中，不依赖网络
10. **大图拍照** — >500KB 自动压缩到最长边 1920px
11. **KaTeX 替换 MathJax** — 公式渲染不再依赖 MathJax SVG 模式，使用 KaTeX HTML 渲染，轻量快速，中文字体由页面 CSS 控制
12. **Typst 不经过 Pandoc WASM** — pandoc-wasm WASM 二进制不支持完整 LaTeX math mode，Typst 导出使用纯 JS 符号映射 + 结构转换器
