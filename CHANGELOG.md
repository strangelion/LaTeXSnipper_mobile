## v1.1.0 — 导出增强、KaTeX 替换、编辑器升级、测试全覆盖 (2026-06-02)

### 🚀 新功能

- **Pandoc WASM 集成** — 新增 7 种文档格式导出：Markdown、Plain Text、HTML、**Typst**、AsciiDoc、reStructuredText、OPML
- **Typst 纯 JS 转换器** — 含 200+ LaTeX→Typst 符号映射 + 结构转换（不依赖 Pandoc WASM 的受限 LaTeX 支持）
- **统一导出下拉菜单** — OCR 结果和编辑器共用统一的自定义下拉导出菜单（使用现有 `.set-select-*` 设计风格）
- **MathLive 编辑器增强**
  - 开启 `smartMode`（自动识别文本/数学模式输入）
  - 开启 `smartFence`（自动闭合括号/花括号/方括号）
  - 虚拟键盘按钮切换（`manual` 策略，用户主动唤出，不干扰输入流）
  - 快速符号工具栏：希腊字母（α β π θ ω）、运算符（√ ∫ ∑ ∏）、关系符（≤ ≥ → ⇒ ∞）
- **编辑器 KaTeX 实时预览** — 输入即见渲染效果，不再显示源码文本

### 🔄 改进

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

### 🐛 修复

- 彻底移除 MathJax 所有文件和引用（节省 ~2.5MB APK 空间）
- `normalizeMixedLine` 等陈旧兼容代码已删除
- 修复旧版 exportPNG/exportSVG 残留导出引用

### 🧪 测试

**4 套新测试套件，616 项测试全部通过：**

| 测试 | 项数 | 说明 |
|------|------|------|
| `test_e2e.js` | 309 | 20 大类全量 E2E：项目结构、HTML 元素、构建配置、所有模块导出、国际化一致性 |
| `test_integration.js` | 227 | 模块级集成：文件存在性、导入完整性、CSS 选择器、函数导出、i18n 键覆盖 |
| `test_pandoc_export.js` | 45 | Pandoc 格式转换（Markdown/Plain/HTML/AsciiDoc/RST/OPML）+ 纯 JS Typst 转换器 |
| `test_katex.js` | 35 | KaTeX 渲染（基本公式、希腊字母、环境、边界条件）+ 资源完整性 |

`test/run_tests.sh` 总测试项从 7 项扩展到 10 项（7 Python + 3 Node.js）。
