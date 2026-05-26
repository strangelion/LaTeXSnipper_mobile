# LaTeXSnipper Mobile

基于 ONNX Runtime Web 的完全离线 LaTeX 公式 OCR 识别 PWA 应用。

## 功能

- **公式 OCR 识别** — 图片/PDF/拍照/手写 → LaTeX，浏览器端 ONNX Runtime 本地推理
- **MathLive 公式编辑器** — 所见即所得数学公式编辑，支持片段插入和计算引擎
- **手写画板** — 墨迹平滑、压感、撤销/重做
- **历史记录** — IndexedDB 存储，收藏夹管理
- **多格式导出** — LaTeX / Markdown / MathML / 文本
- **完全离线** — 所有模型和依赖内置，安装后无需网络
- **PWA** — 可安装到手机桌面，Service Worker 离线缓存
- **日/夜主题** — 自动跟随系统或手动切换

## 技术栈

| 组件 | 技术 |
|------|------|
| 构建 | Vite 5 |
| OCR 引擎 | ONNX Runtime Web 1.21 + WASM |
| 公式渲染 | MathJax 3 (tex-svg) |
| 公式编辑 | MathLive 0.98 |
| PDF 渲染 | pdfjs-dist 3.11 |
| 存储 | IndexedDB (idb) |
| 移动打包 | Capacitor 8 (Android + iOS) |
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

## 目录结构

```
LaTeXSnipper_mobile/
├── index.html                  # 单页面入口
├── public/
│   ├── models/                 # ONNX 模型文件 (113MB)
│   ├── vendor/                 # 内置库 (onnxruntime/pdfjs/mathjax/mathlive)
│   ├── ort/                    # ONNX WASM 文件
│   ├── fonts/                  # 中文字体
│   ├── manifest.json           # PWA 清单
│   ├── sw.js                   # Service Worker
│   └── icon.png
├── src/
│   ├── main.js                 # 入口
│   ├── constants.js            # 常量
│   ├── ocr/                    # OCR 引擎 + PDF 处理
│   ├── camera/                 # 相机模块
│   ├── handwriting/            # 手写模块
│   ├── editor/                 # MathLive 配置
│   ├── history/                # IndexedDB 存储
│   ├── export/                 # 导出模块
│   ├── ui/                     # UI 组件
│   └── styles/                 # CSS 样式
├── android/                    # Capacitor Android 项目
├── dist/                       # 构建输出
├── vite.config.js
├── capacitor.config.json
└── package.json
```

## 模型

使用 MathCraft OCR 模型 (`mathcraft-formula-rec`)：

- 编码器: DeiT (Vision Transformer), 12 层, hidden_size=384
- 解码器: TrOCR, 6 层, d_model=256
- 输入: 384×384 RGB
- 模型来源: [MathCraft-Models](https://github.com/SakuraMathcraft/MathCraft-Models)

## 许可证

MIT
