## [未发布] — 架构重构：EventRegistry + OCR Pipeline

### 架构变更

- **main.js 瘦身（373 → 218 行，-41%）** — 引入 EventRegistry 模式，每个功能模块自包含事件绑定
  - 新增 `src/core/event-registry.js`：`registerBinding()` + `bindAll()` 统一管理事件注册
  - Camera 按钮事件 → `camera.js bindEvents()`
  - Handwriting 工具事件 → `handwriting.js bindUiEvents()`
  - History 工具栏事件 → `history-ui.js bindEvents()`
  - 分享/润色/发送到编辑器 → `result.js bindEvents()`
  - 编辑器按钮事件 → `mathlive-config.js bindEvents()`
  - 新增功能不再需要修改 main.js，各模块自行注册事件
- **OCR Pipeline 可插拔架构** — 替换 `recognition.js` 中的 if/else 模式分发
  - 新增 `src/ocr/pipeline.js`：`OcrPipeline` 基类，定义 `run(image, context)` 接口
  - 新增 `src/ocr/pipeline-registry.js`：`registerPipeline()` / `getPipeline()` / `listPipelines()`
  - 新增 `src/ocr/pipelines/formula.js` — 公式管线（委托 Java recognizeFormula）
  - 新增 `src/ocr/pipelines/text.js` — 文字管线（委托 Java recognizeText）
  - 新增 `src/ocr/pipelines/mixed.js` — 混合管线（委托 Java recognizeMixed，含 regions fallback）
  - 新增识别模式只需创建 pipeline 文件 + 注册，无需修改 recognition.js

### 测试

- 修复 `test_integration.js` 中 3 个失败（import 检查 + event registry 检查）
- 修复 `test_user_workflows.js` 中 10 个失败（适配新架构 + 修正预存在错误）
  - asciidoc/rst/opml 格式从未实现，从测试中移除
  - pandoc lazy load 检查字符串更正为 `pandoc-init.js`
  - KaTeX preview 检查位置从 mathlive-config.js 更正为 result.js

---

## v1.3.0 — 动态模型管理、标准化打包格式、OCR 修复 (2026-06-14)

### 架构变更

- **移除内置模型** — ONNX 模型不再打包进 APK（节省 ~220 MB），改为按需下载或导入
  - doc-ori 方向检测模型（6.5 MB）仍内置 APK
  - tokenizer.json（41 KB）和 ppocrv5_keys.txt（90 KB）内置 APK 作为 fallback
  - 公式检测/识别、文字检测/识别的 ONNX 模型通过 ZIP 包下载
- **标准化模型包格式** — 对齐 HuggingFace ONNX + PaddleOCR 规范：
  - 每个模型包包含 `config.json`（模型类型、输入输出形状、预处理参数、后处理配置）
  - 文件命名统一：`model.onnx`（单文件）或 `encoder.onnx` + `decoder.onnx`（多文件）
  - `ModelConfig.java` 解析 config.json，支持第三方模型自描述
  - OnnxRunner 使用已知文件名加载（避免多 ONNX 目录误选）
- **模型目录重组** — 每个分类独立目录，不再共享：
  - `mathcraft-text-rec/` 只含文字识别模型 + 字典
  - `mathcraft-doc-ori/` 独立目录（含 doc-ori + textline-ori）
  - `model-sources/` 存放打包源文件（ONNX + 字典），不被 Vite 复制到 dist
- **弃用 region-det** — `chinese_detector.onnx` 已弃用，从模型管理系统中移除
- **许可证变更** — Apache 2.0 → AGPL-3.0，禁止闭源商业化分发，修改后分发或网络服务必须开源
- **GitHub Release 分发** — 模型 ZIP 包通过 GitHub Release 发布，manifest baseUrl 指向 Release 下载 URL
- **镜像源加速** — manifest.mirrors[] 支持配置多个下载源，主源失败自动切换镜像
  - 默认镜像：`gh.zwy.one`、`gh.xxooo.cf`
- **SHA256 完整性校验** — 打包脚本自动生成 ZIP 的 SHA256 哈希，下载后用 Web Crypto API 校验
- **断点续传** — HTTP Range header 支持中断后继续下载，进度持久化到 localStorage
- **APK 体积优化（281 MB → 32 MB debug）** — pandoc.wasm（55.7 MB）改为按需下载 + 移除 NotoSansCJKsc 字体（15.7 MB，用系统字体回退）
- **Pandoc WASM 按需下载** — 设置页添加下载按钮，下载后缓存到文件系统；未下载时导出菜单只显示 PNG/SVG/Typst
- **下载进度条 + 通知栏** — 模型下载和 pandoc 下载均显示 UI 进度条 + Android 通知栏进度
- **镜像测速优先** — 下载前并行 HEAD 请求测试所有源延迟，按速度排序优先使用最快的

### 新功能

- **动态模型管理系统** — 完整的模型生命周期管理：
  - 模型清单（manifest）系统：支持多源清单（官方 + 自定义 URL）
  - ZIP 导入：拖入模型包自动解析清单、写入文件系统、注册安装状态
  - 单文件导入：`.onnx` 文件自动分析（protobuf 解析输入/输出形状推断类别）
  - 变体选择：每个类别支持多变体，radio 按钮切换，Java 端 SharedPreferences 持久化
  - 下载系统：从 GitHub Release 下载 ZIP 模型包，支持镜像切换 + 断点续传 + SHA256 校验
  - 应用内打包器：按类别拖入 `.onnx` 文件 → 生成 manifest + ZIP 导出或直接安装
- **官方模型包** — 标准化 ZIP 文件，每个包含 config.json + ONNX + 字典：
  - `latexsnipper-formula-det.zip`（66.5 MB）— YOLOv8 公式检测
  - `latexsnipper-formula-rec.zip`（103.7 MB）— TrOCR 公式识别 + tokenizer
  - `latexsnipper-text-det.zip`（4.2 MB）— DBNet 文字检测
  - `latexsnipper-text-rec.zip`（13.5 MB）— CRNN 文字识别 + 字典
  - `latexsnipper-models-all.zip`（187.9 MB）— 全部模型合集
  - doc-ori 内置 APK，不单独提供下载包
- **ModelConfig.java** — config.json 解析器 + 模型文件发现工具
  - `load()` 从模型目录读取 config.json
  - `findModelFile/findEncoderFile/findDecoderFile` 自动发现 ONNX 文件
  - `findTokenizerFile` 发现 tokenizer/字典文件
- **模型打包脚本更新** — `scripts/package-models.js`：
  - 自动生成 config.json（含 model_type、input/output shape、preprocessing、postprocessing）
  - 自动生成 SHA256 哈希校验值，写入 manifest.checksums
  - 验证 decoder 关键文件（tokenizer.json、ppocrv5_keys.txt）存在性
  - 输出到 `dist-models/`（Vite 不清理的独立目录）
  - 排除 .gitignore 等非模型文件
- **多语言补齐** — zh-TW/ja/ko 补齐 31 个缺失键（Settings 标签页、模型管理、按钮、PDF/状态/结果）

### 修复

- **公式识别 tokenizer 编码损坏** — `tokenizer.json` 从 git 恢复时 PowerShell `Out-File` 破坏 UTF-8 编码，导致公式输出全是"臓"乱码。修复：用 `git checkout` 代替 `Out-File`，Java 端增加文件系统加载路径
- **文字识别空结果** — `ppocrv5_keys.txt` 同样编码损坏 + `loadKeys()` 只从 assets 加载。修复：增加文件系统回退加载，用 `git checkout` 恢复正确编码
- **混合模式 auto-rotate 错误** — doc-ori 模型把横向裁剪区域（885x349）旋转为纵向（349x885）。修复：禁用相机裁剪图片的自动旋转
- **混合模式文本区域误判为公式** — `splitAroundFormulas` 按 x 轴分割后，formula 片段裁剪使用了 textDet 框的 y 坐标而非 formulaDet 框的 y 坐标。修复：SegInterval 增加 `formulaY/formulaH` 字段，裁剪和 RegionResult 坐标均使用正确值
- **混合模式公式重复输出** — Step 3 的公式片段 RegionResult 使用 `textBox.y/h` 导致 Step 4 overlap check 失败，同一公式被识别两次。修复：公式片段 RegionResult 使用 `cropY/cropH`（formulaDet 框坐标）
- **`loadModelData` 资产回退修复** — 动态加载路径从 `public/models/{category}/` 修正为 `public/models/mathcraft-{category}/`
- **ModelConfig.findModelFile 误选 ONNX** — text-rec 目录含 3 个 ONNX，`findModelFile` 可能选到 doc-ori 而非 rec 模型。修复：所有动态加载方法使用已知文件名，不再盲选
- **tokenizer.json/keys.txt 未打入 ZIP** — 打包脚本不包含字典文件。修复：`.gitignore` 允许追踪，打包自动包含
- **npm run build 覆盖 dist ZIP** — Vite 复制 public/models/ 覆盖已生成的 ZIP。修复：ZIP 输出到 `dist-models/`（dist 之外）
- **doc-ori ONNX 未被 git 追踪** — CI 构建时方向检测模型缺失。修复：`.gitignore` 添加 `!mathcraft-doc-ori/pplcnet_doc_ori.onnx` 例外

### 改进

- **per-category ZIP 独立清单** — 每个 ZIP 包含独立的单类别 manifest + `zipFile` 字段
- **外部 API 独立运行** — 不导入本地模型时外部 API 可正常使用
- **Doc-ori 跨类别回退** — 支持从 `text-rec` 目录回退加载，兼容旧版数据
- **`model-sources/` 分离** — ONNX 源文件不放入 `public/models/`，APK 不含大模型文件
- **manifest.baseUrl 支持环境变量** — `MODEL_BASE_URL` 环境变量可覆盖默认下载地址

### 依赖新增

| 依赖 | 用途 |
|------|------|
| `ModelConfig.java` | config.json 解析 + 模型文件发现 |
| `model-sources/` | 打包用 ONNX 源文件目录 |

### 测试

- 打包脚本验证通过 — 4 个类别 ZIP + 1 个合集正确生成，含 config.json + SHA256
- ZIP 内容验证 — formula-rec 含 tokenizer.json，text-rec 含 ppocrv5_keys.txt
- APK 内容验证 — 只含 doc-ori ONNX（6.5 MB）+ tokenizer/keys 小文件
- 文字识别验证 — "不再生成。最终" 正确识别，confidence 0.954
- 混合识别验证 — 文本"计算旋转体体积：" + 公式正确分离，无重复
- 镜像源验证 — `gh.zwy.one` 和 `gh.xxooo.cf` 均可访问
- GitHub Release 上传验证 — 5 个 ZIP + manifest 全部上传成功
- pandoc.wasm 下载验证 — 通过 gh.xxooo.cf 镜像成功下载 55.7 MB
- 欢迎弹窗自动下载验证 — 4 个模型全部自动下载成功
- 模型下载验证 — text-rec 模型通过镜像成功下载

### 追加修复（2026-06-14 晚）

- **欢迎弹窗 "No source available"** — `getLocal(STORAGE_KEYS.SOURCES)` 只读自定义源，遗漏 DEFAULT_SOURCES。修复：改用 `getSources()` 合并默认源
- **`buildMirrorUrls` 缺少 `await`** — 返回 Promise 对象而非数组，导致所有下载立即 "undefined URL(s) → All mirrors failed"。修复：两处调用添加 `await`
- **清单获取超时** — `fetchManifest` 无超时设置，在中国网络下可能挂起。修复：每个 URL 添加 `AbortSignal.timeout(10000)` + 镜像回退
- **pandoc.wasm OOM** — Capacitor Filesystem 用 base64 存储 58MB WASM，读取时 135MB 内存超出 WebView 限制。修复：改为 IndexedDB 原生二进制存储
- **Android 通知权限** — 添加 `POST_NOTIFICATIONS` Manifest 声明 + Java 运行时权限检查，Android 13+ 不再静默失败
- **首次下载进度条** — 欢迎弹窗"立即下载"改为自动逐个下载所有模型，弹窗内显示进度条
- **下载进度条位置** — 原 `#progressWrap` 在识别页面内，设置页不可见。修复：在模型管理区域内嵌进度条
- **SVG 图标替换 emoji** — `⏳` → loading SVG，`✓` → ready SVG，`✗` → error SVG
- **刷新清单静默失败** — `.catch(() => {})` 吞掉所有错误。修复：添加 Logger.error 日志
- **manifest 镜像回退** — `fetchManifest` 支持 gh.zwy.one/gh.xxooo.cf 代理回退

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
