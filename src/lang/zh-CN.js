export default {
  // ── Tab navigation ──
  "nav.recognize": "识别",
  "nav.editor": "编辑器",
  "nav.history": "历史",
  "nav.settings": "设置",

  // ── Theme ──
  "theme.toggle": "切换主题",
  "theme.light": "白天",
  "theme.dark": "黑夜",

  // ── Recognize page ──
  "recog.dropHint": "拖入公式截图 / PDF · 点击上传 · <kbd>Ctrl+V</kbd> 粘贴",
  "recog.mode.formula": "公式",
  "recog.mode.text": "文字",
  "recog.mode.mixed": "混合",
  "recog.recognizing": "识别中…",
  "recog.emptyResult": "未识别到内容",
  "recog.copyLatex": "复制 LaTeX",
  "recog.copyText": "复制文本",
  "recog.sendToEditor": "发送到编辑器",
  "recog.confidence": "置信度",

  // ── Camera ──
  "camera.open": "拍照识别",
  "camera.close": "关闭相机",
  "camera.capture": "拍照",
  "camera.flash": "闪光灯",
  "camera.rotate": "旋转",
  "camera.crop": "裁剪",
  "camera.confirm": "确认",
  "camera.retake": "重拍",
  "camera.cropRect": "框选",
  "camera.cropLasso": "套索",
  "camera.cancel": "取消",

  // ── Handwriting ──
  "hw.pen": "画笔",
  "hw.eraser": "橡皮",
  "hw.undo": "撤销",
  "hw.redo": "重做",
  "hw.clear": "清空",
  "hw.recognize": "识别手写",
  "hw.export": "导出图片",

  // ── Editor ──
  "editor.copyLatex": "复制 LaTeX",
  "editor.copyText": "复制文本",
  "editor.exportMd": "导出 Markdown",
  "editor.exportMathML": "导出 MathML",
  "editor.clear": "清空",

  // ── History ──
  "history.title": "历史记录",
  "history.empty": "暂无识别记录。<br>上传公式图片开始使用！",
  "history.favorite": "收藏",
  "history.delete": "删除",
  "history.exportJson": "导出 JSON",
  "history.importJson": "导入 JSON",

  // ── PDF ──
  "pdf.page": "第 {{current}} / {{total}} 页",
  "pdf.prev": "上一页",
  "pdf.next": "下一页",
  "pdf.selectPage": "选择页面",

  // ── Settings ──
  "settings.title": "设置",
  "settings.engine": "识别引擎",
  "settings.engine.mathcraft": "MathCraft（内置）",
  "settings.engine.external": "AI全托管",
  "settings.externalBaseUrl": "API Base URL",
  "settings.externalModel": "模型名称",
  "settings.externalApiKey": "API Key",
  "settings.save": "保存设置",
  "settings.saved": "已保存 ✓",
  "settings.test": "测试连接",
  "settings.testing": "测试中…",
  "settings.testSuccess": "✓ 连接成功",
  "settings.testFail": "✗ 连接失败",
  "settings.language": "界面语言",

  // ── Dev panel ──
  "dev.title": "开发者面板",
  "dev.logs": "日志",
  "dev.clearLogs": "清空日志",
  "dev.noLogs": "(无日志)",
  "dev.cleared": "(日志已清空)",

  // ── Update ──
  "update.available": "新版本 v{{version}} 可用",
  "update.download": "下载更新",
  "update.later": "稍后",
  "update.checking": "检查更新中…",

  // ── Common ──
  "common.ok": "确定",
  "common.cancel": "取消",
  "common.close": "关闭",
  "common.loading": "加载中…",
  "common.cached": "已缓存",
  "common.error": "出错了",
  "common.retry": "重试",

  // ── Status bar ──
  "status.ready": "模型就绪！拖入公式图片或 Ctrl+V 粘贴",
  "status.readyRetry": "模型就绪！请重新上传图片",
  "status.loadingTokenizer": "正在加载分词器…",
  "status.loadingEncoder": "正在下载编码器模型 (84MB)…",
  "status.downloadingModel": "正在下载{{name}}…",
  "status.modelCached": "{{name}}（已缓存）",
  "status.modelDone": "{{name}} ✓",
  "status.recognizing": "正在识别…",
  "status.recognizingCloud": "正在调用云端模型…",
  "status.recognizingPdf": "正在解析 PDF…",
  "status.done": "识别完成",
  "status.donePages": "识别完成（{{count}} 页）",
  "status.cloudDone": "云端识别完成",
  "status.loadFailed": "加载失败",
  "status.initializing": "正在初始化…",
  "status.loadingEngine": "正在加载 OCR 引擎…",

  // ── Errors ──
  "error.modelNotReady": "模型尚未加载完成，请稍等",
  "error.fileTooSmall": "文件太小，至少 1KB",
  "error.lowConfidence": "未识别到内容（置信度 {{pct}}% 过低），请重新尝试",
  "error.recognitionFailed": "识别失败: {{msg}}",
  "error.cloudEmpty": "云端未返回有效结果",
  "error.cloudFailed": "云端识别失败: {{msg}}",
  "error.noBaseUrl": "请填写 Base URL",
  "error.initFailed": "Initialization failed: {{msg}}",

  // ── Camera overlay ──
  "camera.guideDrag": "拖拽框选要识别的区域",
  "camera.guideNoCrop": "不框选则识别整张图片",

  // ── PDF ──
  "pdf.pages": "{{n}} / {{total}}",
  "pdf.confidence": "置信度 {{pct}}%",

  // ── Buttons (dynamic text) ──
  "btn.copyLatex": "复制 LaTeX",
  "btn.copied": "已复制 ✓",
  "btn.saveSettings": "保存设置",
  "btn.saved": "已保存 ✓",
  "btn.share": "分享",
  "btn.sendToEditor": "填入编辑器",
  "btn.exportPng": "导出 PNG",
  "btn.exportSvg": "导出 SVG",
  "btn.clearCache": "清除模型缓存",
  "btn.cacheCleared": "已清除 ✓",
  "btn.cacheClearFailed": "清除失败",

  // ── Dev panel ──
  "dev.logReadFailed": "（日志读取失败）",
  "update.checkUpdate": "检查更新",
  "update.upToDate": "已是最新版本",
  "check.failed": "检查失败",
  "recog.modeLabel": "识别模式",
"settings.skin": "皮肤",
  "settings.presets": "预设",
  "settings.connection": "连接配置",
  "recog.privacy": "所有识别均在本地浏览器完成，图片不会上传",
  "recog.intro": "<strong>离线OCR：</strong> 完全离线运行：ONNX Runtime 本地推理，模型内置在 App 中，安装后无需网络。支持图片、PDF、拍照和手写识别。",
  "dev.multiThread": "ONNX 多线程 (最多8核+SIMD)",
  "settings.custom": "自定义",
  "recog.resultLabel": "结果",
  "btn.aiPolish": "AI 整理",
  "settings.engine.builtin": "本地识别",
  "settings.engine.hybrid": "内置识别 + AI整理",
  "settings.engineHint": "内置识别使用本地ONNX模型离线运行。AI整理可将识别结果发送到外部LLM进行纠错和格式化。",
  "history.all": "全部",
  "recog.tabImage": "图片",
  "recog.tabHandwrite": "手写",
  "history.sourceFile": "文件",
  "history.sourceCamera": "拍照",
  "history.sourceHandwrite": "手写",
  "history.sourcePDF": "PDF",
  "history.clear": "清空"
}
