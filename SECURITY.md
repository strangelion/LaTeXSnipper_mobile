# 安全政策 / Security Policy

## 支持的版本 / Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| latest  | :white_check_mark: |
| < latest| :x:                |

我们只维护最新发布版的安全补丁。请始终使用 [最新 Release](https://github.com/strangelion/LaTeXSnipper_mobile/releases/latest)。

---

## 报告漏洞 / Reporting a Vulnerability

### 请勿公开披露

如果发现安全漏洞，**请勿创建公开 Issue**。公开披露可能被恶意利用，危及所有用户的安全。

### 报告方式

请通过以下渠道之一私下报告：

1. **GitHub Security Advisory（推荐）**
   前往 [https://github.com/strangelion/LaTeXSnipper_mobile/security/advisories/new](https://github.com/strangelion/LaTeXSnipper_mobile/security/advisories/new) 提交私人安全公告。

2. **直接联系维护者**
   如有紧急问题，请通过 GitHub 联系仓库所有者：[@strangelion](https://github.com/strangelion)

### 报告时请包含

- 漏洞的简要描述
- 复现步骤（代码、配置、操作流程等）
- 受影响的版本 / 平台（Android 版本、WebView 版本等）
- 预期的安全影响
- 可选的修复建议或 PoC

---

## 响应时间 / Response Timeline

| 阶段 | 预计时间 |
|------|----------|
| 确认收到 | 2 个工作日内 |
| 初步评估 | 5 个工作日内 |
| 修复计划 | 10 个工作日内 |
| 发布修复 | 根据严重程度（通常 14–30 天） |

---

## 安全范畴 / Scope

### 涵盖范围

- ONNX 模型或推理管线中的缓冲区溢出 / 拒绝服务
- 跨站脚本 (XSS) 或代码注入（通过输入公式 / 文档内容）
- 隐私泄露（本地 OCR 结果、历史记录、图片数据意外暴露）
- Android WebView 安全配置缺陷
- 依赖库的已知 CVE

### 不在范围内

- 需要物理接触设备、已 root/Jailbreak 的设备才可利用的问题
- 第三方服务（GitHub Pages、Capacitor 框架自身）的安全问题
- Social engineering 攻击
- 通过修改 APK / 绕过签名验证进行的功能解锁

---

## 安全最佳实践 / Security Best Practices

LaTeXSnipper Mobile 的设计原则：

- **所有模型和计算均在本地设备执行**，无需网络权限即可完成 OCR 识别
- **不收集用户数据**：识别结果仅存储于本地 IndexedDB，不上传任何服务器
- **简单的权限模型**：仅申请相机（拍照识别）权限，不申请存储 / 位置 / 联系人等敏感权限
- **依赖最小化**：避免引入不必要的第三方依赖减少攻击面
- **定期更新依赖**：通过 Dependabot 跟踪 npm/Capactior/Android 依赖的安全更新

---

## 致谢 / Acknowledgments

我们感谢所有负责任披露安全问题的研究者。贡献者的名字（经同意后）将列在此处。

---

*最后更新：2026-06-06*
