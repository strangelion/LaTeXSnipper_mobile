# LaTeXSnipper Mobile — 项目维护指南

## 代码规范
- JS 使用 ES Module (`import`/`export`)
- CSS 使用 `src/styles/` 分模块管理（base/ocr/editor/handwriting/mobile）
- HTML 标签内联事件用 `pointerdown` 而不是 `click`（WebView 兼容）
- 所有用户可见文本使用 `data-i18n` 属性 + `t()` 函数，禁止硬编码中文
- 语言包在 `src/lang/` 统一管理，新增文本只需加键值对
- 新增功能归到所属模块，不要跨模块散落
- 修改 `public/` 下文件后需重新 `npm run build`

---

## 一、项目架构

```
LaTeXSnipper_mobile/
├── index.html                 # 单页面 SPA，4 个 Tab 页面
├── public/
│   ├── models/                # ONNX 模型文件
│   │   ├── mathcraft-formula-det/   # YOLOv8 公式检测
│   │   ├── mathcraft-formula-rec/   # TrOCR 公式识别
│   │   ├── mathcraft-text-det/      # DBNet 文字检测
│   │   ├── mathcraft-text-rec/      # CRNN 文字识别 + 方向检测
│   │   └── chinese_detector.onnx    # 中文/公式分类
│   ├── vendor/                # 内置库 (mathjax/mathlive/pdfjs)
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
│   │   ├── share.js           # 分享功能（Capacitor → WebShare → 剪贴板）
│   │   └── logger.js          # 日志收集与诊断导出
│   ├── camera/                # 全屏相机：拍照/框选/套索/四角把手
│   ├── handwriting/           # Canvas 手写板 + 导出
│   ├── editor/                # MathLive 编辑器 + 中文翻译
│   ├── history/               # IndexedDB 存储（idb 封装）
│   ├── settings/              # 设置页面逻辑
│   ├── ui/                    # UI 组件
│   │   ├── ui.js              # 状态栏/进度条/结果展示等
│   │   ├── recognition.js     # 识别入口（Native → External API → fallback）
│   │   ├── result.js          # 结果显示/分享/PNG/SVG导出
│   │   ├── splash.js          # 启动加载进度
│   │   └── custom-select.js   # 自定义下拉选择器
│   └── styles/                # CSS 样式模块
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
├── vite.config.js           # Vite 配置
├── capacitor.config.json    # Capacitor 配置
└── .github/workflows/
    ├── build-apk.yml         # Android APK 构建
    └── build-ios.yml         # iOS 模拟器构建
```

---

## 二、Tab 页面结构

| Tab | ID | 功能 |
|-----|-----|------|
| 识别 | `#page-ocr` | 图片/PDF/拍照/手写识别，模式选择（公式/文本/混合） |
| 编辑器 | `#page-editor` | MathLive 输入，MathJax 预览，复制 |
| 历史 | `#page-history` | IndexedDB 列表，收藏筛选，点击填入编辑器 |
| 设置 | `#page-settings` | 识别引擎选择、加速模式、外部模型配置、预设、皮肤、语言、更新检查 |

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
图片 → autoOrient → 公式检测 → 原图文字检测 → splitTextBoxAroundFormulas
  → 公式段 → 公式行分割（投影→逐行识别→重组{aligned}）
  → 文字段 → 直接 CRNN 识别
  → 版面输出（行分组 + $$包裹 + 段落合并）
```

### 桥接通信

```
JS → window.NativeOcr.recognizeFormula(base64) → NativeOcrBridge (后台线程)
  → OcrEngine → ONNX Runtime Android
  → 结果 JSON → JS 轮询 getResult(key) 获取
```

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

---

## 六、多语言系统

```
用户切换语言 → setLang(code) → 加载语言包 → translateDOM() 批量更新
                                  └→ onLangChange 回调（更新动态文本）
```

- 静态 HTML：`data-i18n` / `data-i18n-html` / `data-i18n-title`
- 动态 JS：`import { t } from './lang/i18n.js'`
- 新增语言：复制 zh-CN.js → 翻译 → 在 LANG_MAP 注册 → 加 HTML 选项

---

## 七、构建与部署

```bash
npm run dev              # Vite 开发服务器（:5174）
npm run build            # 构建到 dist/
npx cap sync android     # 同步到 Android
cd android && ./gradlew assembleDebug  # 编译 APK

# GitHub Actions
# Actions → Build Android APK → 输入版本号 + 勾选 Release → Run workflow
```

### 本地测试模型
```bash
conda activate ppocr_finetune
python -c "import onnxruntime as ort; print(ort.__version__, ort.get_available_providers())"
```

---

## 八、注意事项

1. **MathLive 自定义元素** — `<mathlive-field>` 在部分 WebView 中不注册，改用 `new MathfieldElement()` 创建
2. **相机按钮** — 必须用 `pointerdown` + `stopPropagation`，`click` 在 WebView 中不可靠
3. **COOP/COEP 头** — Capacitor 和 Vite 中已配置
4. **iOS 构建** — 需要 Apple Developer（$99/年），CI 只能验证模拟器编译
5. **模型加载** — 所有模型内置在资产文件中，不依赖网络
6. **国际化** — 所有文本必须通过 i18n 系统
7. **大图拍照** — >500KB 自动压缩到最长边 1920px
8. **分享** — 三阶段降级（Capacitor Share → Web Share API → 剪贴板）
