## v1.3.0 — 动态模型管理、移除内置模型、官方模型包 (2026-06-13)

### 架构变更

- **移除内置模型** — ONNX 模型不再打包进 APK（节省 ~220 MB），改为按需下载或导入
  - 模型加载优雅失败：缺失模型不再崩溃，跳过并记录日志
  - 外部 API 模式完全独立：选择外部 API 时不加载本地模型，无需任何模型文件
  - 模型状态查询：`NativeOcr.getModelStatus()` 返回各模型可用状态
  - 识别时检查：无对应模型时提示用户下载或切换外部 API
- **弃用 region-det** — `chinese_detector.onnx` 已弃用，从模型管理系统中移除（OcrEngine 内部仍使用 bundled fallback）

### 新功能

- **动态模型管理系统** — 完整的模型生命周期管理：
  - 模型清单（manifest）系统：支持多源清单（官方 + 自定义 URL）
  - ZIP 导入：拖入模型包自动解析清单、写入文件系统、注册安装状态
  - 单文件导入：`.onnx` 文件自动分析（protobuf 解析输入/输出形状推断类别）
  - 变体选择：每个类别支持多变体，radio 按钮切换，Java 端 SharedPreferences 持久化
  - 下载系统：从 GitHub Releases 下载模型，支持进度回调
  - 应用内打包器：按类别拖入 `.onnx` 文件 → 生成 manifest + ZIP 导出或直接安装
- **官方模型包** — 预打包的模型 ZIP 文件，支持按类别和完整包下载：
  - `latexsnipper-formula-det.zip`（76.6 MB）— YOLOv8 公式检测
  - `latexsnipper-formula-rec.zip`（112.2 MB）— TrOCR 公式识别
  - `latexsnipper-text-det.zip`（4.5 MB）— DBNet 文字检测
  - `latexsnipper-text-rec.zip`（32.0 MB）— CRNN 文字识别 + 方向检测
  - `latexsnipper-doc-ori.zip`（6.5 MB）— 文档方向检测
  - `latexsnipper-models-all.zip`（208.5 MB）— 全部模型完整包
- **模型打包脚本** — `scripts/package-models.js`：从 `public/models/` 自动生成模型包
- **GitHub Actions 打包工作流** — `package-models.yml`：一键构建 + 上传到 GitHub Releases
- **ONNX 元数据分析器** — `src/model-analyzer.js`：解析 protobuf 提取输入/输出形状，自动推断模型类别
- **模型管理 UI** — 设置页新增模型管理区块：清单源管理、变体选择、下载/删除、导入按钮
- **模型包创建器** — `src/ui/package-builder.js`：应用内拖入文件创建模型包
- **首次启动引导** — 欢迎弹窗引导用户下载模型或使用外部 API

### 改进

- **`loadModelData` 资产回退修复** — 动态加载路径从 `public/models/{category}/` 修正为 `public/models/mathcraft-{category}/`，修复首次安装时资产回退失败的问题
- **Doc-ori 跨类别回退** — 文档方向检测模型支持从 `text-rec` 目录回退加载，兼容只导入 text-rec 包的场景
- **弃用 region-det** — `chinese_detector.onnx` 已弃用，从模型管理系统和打包中移除，bundled asset 仍作为 fallback
- **per-category ZIP 独立清单** — 每个按类别拆分的 ZIP 包含独立的单类别 manifest，避免导入时覆盖完整清单
- **外部 API 独立运行** — 不导入本地模型时，外部 API（SiliconFlow、Gemini 等）可正常使用，无需本地模型依赖

### 依赖新增

| 依赖 | 用途 |
|------|------|
| `src/model-manager.js` | 模型清单解析、CRUD、下载、导入 |
| `src/model-analyzer.js` | ONNX protobuf 解析器 |
| `src/ui/model-import.js` | ZIP/单文件导入 UI |
| `src/ui/model-settings.js` | 设置页模型管理 UI |
| `src/ui/package-builder.js` | 模型包创建器 |
| `scripts/package-models.js` | 模型打包脚本 |
| `.github/workflows/package-models.yml` | 模型打包工作流 |
| `android/.../ModelManager.java` | Java 端模型路径/活跃变体管理 |

### 测试

- 打包脚本验证通过 — 5 个类别 ZIP + 1 个完整包正确生成
- ZIP 结构验证通过 — `{category}/{variantId}/{filename}` 格式兼容 `importFromZip()`
- Manifest 格式验证通过 — variant ID 与 Java 默认值匹配

---

## v1.2.2 — 依赖安全更新、构建工具升级、CI 安全扫描 (2026-06-06)

### 安全

- **移除高危依赖** — 删除废弃的 `vite-plugin-wasm` 和 `vite-plugin-top-level-await`，消除 `tar` 链式漏洞（6 个 GHSA，2 high）
- **SECURITY.md** — 增加安全政策文件，明确漏洞报告流程和响应时间
- **CI 安全扫描** — 新增 GitHub Actions 工作流 `security-scan.yml`：
  - 12 项恶意代码模式自动检测（eval、innerHTML 注入、base64 隐藏载荷、混淆代码等）
  - gitleaks 密钥扫描 + SARIF 报告上传
  - ESLint 安全规则 + 国际化合规检查

### 依赖升级

| 依赖 | 旧版本 | 新版本 | 说明 |
|------|--------|--------|------|
| Vite | 5.4.21 | 8.0.16 | 构建速度提升，原生 top-level-await + WASM 支持 |
| MathLive | 0.98.6 | 0.104.0 | 虚拟键盘稳定性改进 |
| pdfjs-dist | 3.11.174 | 4.2.67 | PDF 渲染引擎升级 |
| vite-plugin-pwa | 0.20.5 | 1.3.0 | 死依赖，无功能影响 |

### 改进

- **Vite 配置精简** — 移除 `vite-plugin-wasm` + `vite-plugin-top-level-await`（Vite 8 原生支持），`vite.config.js` 减少 5 行

### 修复

- **系统键盘 IME 彻底修复** — MathLive v0.104 中 `sandboxed` 策略映射为 `manual`，Android WebView 无法连接 IME 到 Shadow DOM contentEditable。改用 `<textarea>` 代理覆盖编辑区接收焦点并转发输入，修复系统键盘无法弹出、输入后自动收回的问题

### 测试

- **构建验证通过** — Vite 8.0.16 构建成功（343ms）
- **全部 4 套测试通过**

---

## v1.2.1 — 历史收藏优化、系统键盘体验修复、更新界面优化 (2026-06-05)

### 改进

- **历史收藏阈值调整** — 左滑触发收藏从 70% 位置降至 50%，收藏操作更轻松
- **收藏模式清空** — 在「收藏」过滤下点击清空只删收藏条目；「全部」模式下保留收藏（原行为不变）
- **更新界面支持 Markdown** — GitHub Release body 的 Markdown 格式正确渲染为富文本（标题、加粗、代码、列表）

### 修复

- **系统键盘模式彻底修复** — 改用 MathLive 原生 `sandboxed` 策略，系统键盘稳定弹出，点击编辑区不再收回
- **系统键盘挤占编辑区** — 系统键盘弹出时自动隐藏底部公式符号工具栏，腾出编辑空间

### 测试

- **全部 4 套测试通过**
  - wasm (20/20), pandoc (43/43), integration (227/227), e2e (308/308)

## v1.2.0 — 键盘三态切换、导出格式精简、Pandoc WASM 兼容修复、APK 体积优化 (2026-06-04)

### 新功能

- **MathLive 键盘三态切换** — 编辑器键盘按钮支持三种模式循环切换：关闭 → MathLive 虚拟键盘 → 系统原生键盘 → 关闭
  - 切换按钮移至编辑器顶部 sticky 栏，任何键盘弹出都不会遮挡
  - 系统键盘模式通过隐藏 `<input>` 转发输入到 MathField
- **新增导出格式** — 新增 LaTeX (.tex)、MathML、Word (.docx) 三种常用导出格式

### 改进

- **导出格式精简** — 砍掉 AsciiDoc、reStructuredText、OPML 三个不常用格式，保留常用 9 种：PNG、SVG、LaTeX、MathML、Markdown、HTML、Typst、Word、Plain Text
- **版本号自动注入** — `vite.config.js` 从 `package.json` 自动读取版本号，无需手动更新 `index.html`
- **收藏触发距离** — 从 300px 增大到 480px，大幅降低误触率
- **历史按钮等分** — 分享/复制按钮 `flex:1` 等宽，视觉一致
- **7 套全新视觉皮肤**
  - Material 蓝（默认）、MIUI 渐变、iOS 蓝、樱花和风、黑客矩阵、暖咖纸墨、极简纤白

### 修复

- **Pandoc WASM 导出** — Android WebView 运行时 fetch 56MB WASM 二进制返回 HTML 404 的问题；改用 `pandoc-init.js` 加载 `core.js`（纯 JS 模块）+ `fetch('/pandoc.wasm')` 绕过 vite-plugin-wasm 生成的 Capacitor 不兼容路径
- **WASM 打包重复** — 清除 `writeBundle` 多余复制步骤和 `public/vendor/pandoc/` 旧目录，APK 中只有 1 份 pandoc.wasm
- **导出中文方框** — SVG foreignObject 显式指定 `"Noto Sans CJK SC","Microsoft YaHei"` 中文字体回退
- **SVG/PNG 导出** — `renderLatexToSvgs` 改用 `renderBlock` 智能渲染，混合文本+公式行正确渲染
- **docx 导出失效** — pandoc 二进制输出补传 `output-file` 选项，通过 `result.files['stdout']` 获取原始写入
- **WASM 冗余文件清理** — 移除 `public/vendor/pandoc/` 残留目录，APK 中只有 1 份 pandoc.wasm（58MB）

### 测试

- **全部 4 套测试通过**
  - wasm (20/20), pandoc (43/43), integration (227/227), e2e (308/308)

## v1.1.2 — Pandoc WASM 导出修复、SVG/PNG 导出修复 (2026-06-04)

### 修复

- **SVG/PNG 导出** — `renderLatexToSvgs` 改用 `renderBlock` 智能渲染，混合文本+公式行不再失败显示代码
- **Pandoc WASM 导出（Markdown/HTML/AsciiDoc 等）** — Android WebView 缺少 `wasi_snapshot_preview1` 模块，通过 `@bjorn3/browser_wasi_shim` + Vite resolve alias 修复

## v1.1.1 — 编辑器精简、渲染引擎切换、历史滑动修复 (2026-06-04)

### 新功能

- **KaTeX/MathJax 渲染引擎切换** — 设置页「公式渲染引擎」下拉选择，支持离线切换（MathJax 1.1MB + 23 字体文件本地加载）
- **MathJax 完全离线集成** — `public/vendor/mathjax/` 本地加载，启动阶段 splash 预加载，无需 CDN
- **图片方向智能校正** — 相机/导入图片在 EXIF 未校正且 ONNX 模型置信度 ≥ 0.6 时自动旋转方向

### 改进

- **编辑器精简** — 移除中间 KaTeX 实时预览区，只保留上方 MathLive 输入 + 下方源代码显示，编辑更聚焦
- **渲染健壮性提升** — `renderBlock` 智能判断显示/内联模式，多行环境（`\begin{aligned}`、`$$...$$`）按逻辑块分组渲染，不逐行切分

### 修复

- **历史记录右滑交互**
  - 吸附后点击删除区域 → 触发删除操作
  - 吸附后继续右滑 → 删除区域继续伸长
- **公式渲染兜底** — 不含 `\` 的公式（如 `x^2 + y^2 = z^2`、`y = kx + b`）正确渲染，不再只显示源码

### 测试

- 集成测试：**226/226 通过**
- KaTeX 渲染测试：**35/35 通过**

---

## v1.1.0 — 导出增强、KaTeX 替换、编辑器升级、测试全覆盖 (2026-06-02)

### 新功能

- **Pandoc WASM 集成** — 新增 7 种文档格式导出：Markdown、Plain Text、HTML、**Typst**、AsciiDoc、reStructuredText、OPML
- **Typst 纯 JS 转换器** — 含 200+ LaTeX→Typst 符号映射 + 结构转换（不依赖 Pandoc WASM 的受限 LaTeX 支持）
- **统一导出下拉菜单** — OCR 结果和编辑器共用统一的自定义下拉导出菜单（使用现有 `.set-select-*` 设计风格）
- **MathLive 编辑器增强**
  - 开启 `smartMode`（自动识别文本/数学模式输入）
  - 开启 `smartFence`（自动闭合括号/花括号/方括号）
  - 虚拟键盘按钮切换（`manual` 策略，用户主动唤出，不干扰输入流）
  - 快速符号工具栏：希腊字母（α β π θ ω）、运算符（√ ∫ ∑ ∏）、关系符（≤ ≥ → ⇒ ∞）
- **编辑器 KaTeX 实时预览** — 输入即见渲染效果，不再显示源码文本

### 改进

- **KaTeX 替换 MathJax 3** — 公式渲染体积从 ~2.5MB→265KB，HTML 输出模式原生支持中文混合显示，不再有中文字体渲染问题
- **构建配置** — 添加 `vite-plugin-wasm` + `vite-plugin-top-level-await`，正确打包 pandoc-wasm 的 WASM 二进制
- **日志系统增强**
  - 重写 `console.*` 覆写，现在捕获所有输出（包括第三方库日志）
  - Error 对象自动包含堆栈跟踪（前 8 层）
  - 通过 DOM 自定义事件 `ls-log` 推送实时日志
  - 开发者日志面板增加系统信息头（平台、硬件并发、内存）
  - 显示行数从 200 扩大到 500 行
- **开发者日志面板** — 更清晰的日志格式和分隔线
- **exporter.js MathML** — 改用 KaTeX 的 MathML 输出，移除 MathJax 残留引用

### 修复

- 彻底移除 MathJax 所有文件和引用（节省 ~2.5MB APK 空间）
- `normalizeMixedLine` 等陈旧兼容代码已删除
- 修复旧版 exportPNG/exportSVG 残留导出引用

### 测试

**4 套新测试套件，616 项测试全部通过：**

| 测试 | 项数 | 说明 |
|------|------|------|
| `test_e2e.js` | 309 | 20 大类全量 E2E：项目结构、HTML 元素、构建配置、所有模块导出、国际化一致性 |
| `test_integration.js` | 227 | 模块级集成：文件存在性、导入完整性、CSS 选择器、函数导出、i18n 键覆盖 |
| `test_pandoc_export.js` | 45 | Pandoc 格式转换（Markdown/Plain/HTML/AsciiDoc/RST/OPML）+ 纯 JS Typst 转换器 |
| `test_katex.js` | 35 | KaTeX 渲染（基本公式、希腊字母、环境、边界条件）+ 资源完整性 |

`test/run_tests.sh` 总测试项从 7 项扩展到 10 项（7 Python + 3 Node.js）。
