---
name: latexsnipper-mobile
description: |
  LaTeXSnipper Mobile 项目完整维护指南。
  包含项目架构、文件用途、构建流程、开发规范。
  当需要修改代码、排查构建问题、或理解项目结构时使用。
metadata:
  type: project
---

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
├── index.html              # 单页面 SPA，4 个 Tab 页面
├── src/
│   ├── main.js             # 入口：组装模块、事件绑定、启动
│   ├── constants.js        # 全局常量（模型路径、阈值等）
│   ├── update-checker.js   # GitHub Releases 自动更新检查
│   ├── lang/
│   │   ├── i18n.js         # 多语言引擎（自动检测、t()、translateDOM）
│   │   ├── zh-CN.js        # 简体中文（同时也是回退语言）
│   │   ├── zh-TW.js        # 繁體中文
│   │   ├── en.js           # English
│   │   ├── ja.js           # 日本語
│   │   └── ko.js           # 한국어
│   ├── ocr/
│   │   ├── ocr-engine.js   # ONNX 公式推理管线
│   │   ├── region-detect.js # 版面分析 + 中文/公式分类
│   │   ├── text-recognition.js # PP-OCRv5 文字识别
│   │   ├── text-detection.js   # 文字检测
│   │   ├── tesseract-recognition.js # Tesseract WASM 文字识别
│   │   ├── image-preprocess.js # 图像预处理 + 手写增强
│   │   ├── pdf-processor.js    # PDF 逐页渲染 + OCR
│   │   ├── simplify.js         # 繁简转换
│   │   └── doc-preprocess.js   # 文档方向检测
│   ├── camera/
│   │   └── camera.js       # 全屏相机：拍照/框选/套索/四角把手
│   ├── handwriting/
│   │   └── handwrite.js    # Canvas 手写板 + 导出
│   ├── editor/
│   │   └── mathlive-config.js # MathLive 编辑器 + 中文翻译
│   ├── history/
│   │   └── history-db.js  # IndexedDB 存储（idb 封装）
│   ├── export/
│   │   └── exporter.js     # 多格式导出
│   ├── ui/
│   │   ├── ui.js           # 状态栏/进度条/结果展示/外部API调用/图片处理
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
│   ├── models/             # ONNX 模型文件
│   ├── vendor/             # 内置库（ort/pdfjs/mathjax/mathlive）
│   ├── ort/                # ONNX WASM 文件
│   ├── fonts/              # 中文字体
│   ├── manifest.json       # PWA 清单
│   ├── sw.js               # Service Worker
│   └── icon.png            # App 图标
├── android/                # Capacitor Android 项目
├── vite.config.js          # Vite 配置（含 COOP/COEP 头）
├── capacitor.config.json   # Capacitor 配置
└── .github/workflows/
    ├── build-apk.yml       # Android APK 构建
    └── build-ios.yml       # iOS 模拟器构建
```

---

## 二、Tab 页面结构

| Tab | ID | 功能 |
|-----|-----|------|
| 识别 | `#page-ocr` | 图片/PDF/拍照/手写识别，模式选择（公式/文本/混合） |
| 编辑器 | `#page-editor` | MathLive 输入，MathJax 预览，复制 |
| 历史 | `#page-history` | IndexedDB 列表，收藏筛选，点击填入编辑器 |
| 设置 | `#page-settings` | 识别引擎选择、外部模型配置、预设、皮肤、语言、更新检查 |

---

## 三、多语言系统

### 架构

```
用户切换语言 → setLang(code) → 加载语言包 → translateDOM() 批量更新
                                  └→ onLangChange 回调（更新动态文本）
```

### 使用方式

**静态 HTML**：
```html
<button data-i18n="btn.saveSettings">保存设置</button>
<!-- 含子元素的用 data-i18n-html -->
<div data-i18n="recog.intro" data-i18n-html>...</div>
<!-- 带标题的元素 -->
<button data-i18n-title="theme.toggle" title="切换主题">
```

**动态 JS**：
```js
import { t } from './lang/i18n.js';
el.textContent = t('status.ready');
el.textContent = t('update.available', { version: '2.0.0' });
```

### 新增语言

1. 复制 `zh-CN.js` 为 `新语言代码.js`
2. 翻译所有键值
3. 在 `i18n.js` 的 `LANG_MAP` 中注册
4. 在 `index.html` 的语言下拉菜单中添加选项

---

## 四、外部模型调用

支持 OpenAI 兼容 API（`/v1/chat/completions`）和 MinerU 原生 API。
预设值在 `src/main.js` 的 `PRESETS` 对象中配置。
大图（>1MB）自动压缩到最长 1024px 再上传。

---

## 五、更新检查

- `src/update-checker.js`：后台自动检测（启动后 30s）
- 设置页"检查更新"按钮：手动检查
- 有新版本弹窗提示，可选择"此版本不再提醒"
- 从 GitHub Releases API 获取版本信息

---

## 六、识别流程

```
图片输入
  → 外部模型？（设置中引擎 ≠ builtin）
    → 是：processImageExternal() → POST API
    → 否：
      → mode = 'formula'  → 公式 OCR (encoder-decoder)
      → mode = 'text'     → PP-OCRv5 文字检测 + 识别 / Tesseract
      → mode = 'mixed'    → region-detect 版面分析 → 分别识别
      → PDF               → 逐页渲染 → 逐页识别
```

---

## 七、构建与部署

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

## 八、APK 签名

- CI 有 Secrets → 用用户提供的 keystore
- CI 无 Secrets → 自动生成临时 keystore
- 本地签名：`android/app/keystore.properties`
- 本地 keystore：`release.keystore`
- V1+V2+V3+V4 全方案签名

---

## 九、已知注意事项

1. **MathLive 自定义元素** — `<mathlive-field>` 在部分 WebView 中不注册，改用 `new MathfieldElement()` 创建
2. **相机按钮** — 必须用 `pointerdown` + `stopPropagation`，`click` 在 WebView 中不可靠
3. **HTML ID 属性** — 不要用中文 ID，JS 引用靠英文 ID
4. **COOP/COEP 头** — Capacitor 配置和 Vite 配置中都已加，启用多线程 WASM
5. **iOS 构建** — 需要 Apple Developer（$99/年），CI 只能验证模拟器编译
6. **`ios/` 目录** — CI 中 `rm -rf ios && npx cap add ios` 重建，不提交到仓库
7. **角落触控** — 阈值 44px 起步（Apple HIG）
8. **手写识别** — 深色模式自动反色，全画布直出不做裁剪
9. **模型加载** — 所有模型内置在 `public/models/` 中，不依赖网络
10. **国际化** — 所有文本必须通过 i18n 系统，禁止硬编码语言相关字符串
11. **Tesseract WASM** — 浏览器版功能受限，部分参数会自动忽略（WARNING 不影响使用）
12. **模型缓存** — 首次加载从本地文件读取到 WASM 内存，后续启用 Service Worker 缓存
