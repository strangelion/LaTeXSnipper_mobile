---
name: latexsnipper-mobile
description: |
  LaTeXSnipper Mobile 项目完整维护指南。
  包含项目架构、文件用途、构建流程、已知问题。
  当需要修改代码、排查构建问题、或理解项目结构时使用。
metadata:
  type: project
---

# LaTeXSnipper Mobile — 项目维护指南

## 代码规范
- JS 使用 ES Module (`import`/`export`)
- CSS 使用 `src/styles/` 分模块管理（base/ocr/editor/handwriting/mobile）
- HTML 标签内联事件用 `pointerdown` 而不是 `click`（WebView 兼容）
- 新增功能归到所属模块，不要跨模块散落
- 修改 `public/` 下文件后需重新 `npm run build`

---

## 一、项目架构

```
LaTeXSnipper_mobile/
├── index.html              # 单页面 SPA，4 个 Tab 页面
├── src/
│   ├── main.js             # 入口：组装模块、事件绑定、启动
│   ├── constants.js        # 全局常量（模型路径、阈值等）
│   ├── ocr/
│   │   ├── ocr-engine.js   # ONNX 推理管线（加载/预处理/编码/解码/修复）
│   │   └── pdf-processor.js # PDF 逐页渲染 + OCR
│   ├── camera/
│   │   └── camera.js       # 全屏相机：拍照/框选/套索/四角把手/边缘拖拽
│   ├── handwriting/
│   │   └── handwrite.js    # Canvas 手写板 + 深色模式反色
│   ├── editor/
│   │   └── mathlive-config.js # MathLive 编辑器初始化 + 中文翻译
│   ├── history/
│   │   └── history-db.js   # IndexedDB 存储（idb 封装）
│   ├── export/
│   │   └── exporter.js     # 多格式导出
│   ├── ui/
│   │   ├── ui.js           # 状态栏/进度条/结果展示/图片处理入口
│   │   ├── theme.js        # 日/夜主题切换
│   │   └── particles.js    # 数学粒子背景（已禁用）
│   └── styles/
│       ├── base.css        # CSS 变量、布局、导航、设置页
│       ├── ocr.css         # 识别页、相机、按钮、裁剪 UI
│       ├── editor.css      # 编辑器
│       ├── handwriting.css # 手写板
│       ├── history.css     # 历史记录列表
│       └── mobile.css      # 响应式、安全区域、PWA 增强
├── public/
│   ├── models/             # ONNX 模型（83+29MB）
│   ├── vendor/             # 内置库（ort/pdfjs/mathjax/mathlive）
│   ├── ort/                # ONNX WASM 文件
│   ├── fonts/              # 中文字体
│   ├── manifest.json       # PWA 清单
│   ├── sw.js               # Service Worker
│   └── icon.png            # App 图标
├── android/                # Capacitor Android 项目（CI 在 macOS 上重建 ios/）
├── vite.config.js          # Vite 配置（含 COOP/COEP 头）
├── capacitor.config.json   # Capacitor 配置（http 服务 + COOP/COEP）
└── .github/workflows/
    ├── build-apk.yml       # Android APK 构建（手动触发，版本号+Release）
    └── build-ios.yml       # iOS 模拟器构建
```

---

## 二、Tab 页面结构

| Tab | ID | 功能 |
|-----|-----|------|
| 识别 | `#page-ocr` | 图片/PDF/拍照/手写识别，模式选择（公式/文本/混合） |
| 编辑器 | `#page-editor` | MathLive 输入，MathJax 预览，复制 |
| 历史 | `#page-history` | IndexedDB 列表，收藏筛选，点击填入编辑器 |
| 设置 | `#page-settings` | 识别引擎选择，外部模型配置，预设自动填充 |

---

## 三、关键文件说明

### `src/ocr/ocr-engine.js`
- `recognize(img, mode)` — 主推理函数，mode 可选 `'formula'`/`'text'`/`'mixed'`
- `isImageEmpty(img)` — 空图预检，动态阈值
- `preprocessImage(img)` — 缩放到 384×384 + 归一化 [-1,1]
- `repairLatex(tex)` — LaTeX 修复（括号/分式/left-right/begin-end）
- `CONFIDENCE_MIN = 0.15` — 低于此阈值丢弃结果
- 解码循环每 8 步 `setTimeout(0)` 让步主线程
- 防并发锁 `running` 变量 + `try/finally`

### `src/camera/camera.js`
- `openCamera()` / `closeCamera()` / `capturePhoto()`
- 竖屏自动旋转 90°（检测 `isPortrait && videoLandscape`）
- `drawCropOverlay(hoverCorner, hoverEdge, hovering)` — 裁剪叠加层 + 角落圆球
- 角落吸附阈值 44px 起（`cornerHit`），边缘 28px 起（`edgeHit`）
- 支持 drawing/moving/resizing/edge-resizing 四种操作
- 按钮自动隐藏：手指靠近上 15% 或下 18% 时淡出
- `confirmCrop()` — 套索路径外填白，框选直接裁剪

### `src/editor/mathlive-config.js`
- `initEditor()` — 同步函数，立即绑定 textarea 监听器
- `initMathLiveAsync()` — 异步加载 MathLive 自定义元素
- `MATHLIVE_ZH` — 完整中文翻译表（来自桌面端）
- `setEditorContent(latex)` — 外部填入公式并跳转编辑器

### `src/ui/ui.js`
- `processImage(file)` — 图片/PDF 处理入口，调用 `recognize()`
- `initModels(onProgress)` — 加载分词器 + 编码器 + 解码器
- 多线程检测：`crossOriginIsolated` → 4 线程 + SIMD，否则单线程

### `src/main.js`
- 底部 4 个 Tab 切换
- 相机事件绑定（`pointerdown` + `stopPropagation`）
- 识别模式选择器（`window.__recogMode`）
- 设置页：预设填充 + localStorage 持久化
- Capacitor 返回键拦截（相机内关闭相机，非首页回到识别页）

---

## 四、构建与部署

```bash
npm run dev          # Vite 开发服务器（:5174，带 COOP/COEP）
npm run build        # 构建到 dist/
npm run preview      # 预览构建产物

# Android APK 本地构建（需要 Android Studio + Java 21）
npx cap sync android
cd android && ./gradlew assembleRelease

# GitHub Actions
# Actions → Build Android APK → 输入版本号 + 勾选 Release → Run workflow
```

---

## 五、APK 签名

- CI 有 Secrets → 用用户提供的 keystore
- CI 无 Secrets → 自动生成临时 keystore（`latexsnipper/latexsnipper`）
- 本地签名：`android/app/keystore.properties`（密码 `LsMobile2026!`）
- 本地 keystore：`release.keystore`（别名 `latexsnipper`）
- V1+V2+V3+V4 全方案签名

---

## 六、已知注意事项

1. **MathLive 自定义元素** — `<mathlive-field>` 在部分 WebView 中不注册，改用 `new MathfieldElement()` 创建
2. **相机按钮** — 必须用 `pointerdown` + `stopPropagation`，`click` 在 WebView 中不可靠
3. **HTML ID 属性** — 不要用中文 ID（`sed` 批量翻译曾破坏过），JS 引用靠英文 ID
4. **COOP/COEP 头** — Capacitor 配置和 Vite 配置中都已加，启用多线程 WASM
5. **iOS 构建** — 需要 Apple Developer（$99/年），CI 只能验证模拟器编译
6. **`ios/` 目录** — CI 中 `rm -rf ios && npx cap add ios` 重建，不提交到仓库
7. **角落触控** — 阈值 44px 起步（Apple HIG），太小手指点不到
8. **手写识别** — 深色模式自动反色（非白像素取反），全画布直出不做裁剪
9. **PDF 无页数限制** — 离线场景不需要配额控制
10. **图片图标** — 256×256 源 → 自动生成 48/72/96/144/192 五档
