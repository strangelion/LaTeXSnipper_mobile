# LaTeXSnipper Mobile — 发布指南

## GitHub Actions 构建 APK

直接触发即可，无需任何配置。

**Actions** → **Build Android APK** → **Run workflow**

---

## Google Play 上架签名（可选）

不设置也能构建 APK，CI 会用临时签名。上架 Google Play 才需设置。

### 1. 生成 keystore（已有可跳过）

```bash
keytool -genkey -v -keystore release.keystore -alias latexsnipper \
  -keyalg RSA -keysize 2048 -validity 36500
```

### 2. 编码 keystore

**Windows (PowerShell):**
```
[Convert]::ToBase64String([IO.File]::ReadAllBytes("release.keystore")) | Set-Content keystore.txt
```

**Windows (CMD):**
```
certutil -encode release.keystore keystore.txt
```

**macOS / Linux:**
```bash
base64 < release.keystore > keystore.txt
# 如果上面不行，试试这个
base64 -w0 release.keystore > keystore.txt
```

### 3. GitHub Secrets

去仓库 → **Settings** → **Secrets and variables** → **Actions**，添加以下 4 个：

| Name | Value |
|------|-------|
| `KEYSTORE_B64` | `keystore.txt` 文件里的全部内容（去掉换行，一行到底） |
| `KEYSTORE_PASSWORD` | `latexsnipper2026` |
| `KEY_ALIAS` | `latexsnipper` |
| `KEY_PASSWORD` | `latexsnipper2026` |

### 4. 触发构建并下载

Actions → **Build Android APK** → **Run workflow**

构建完成后下载 `LaTeXSnipper-v1.0.0-release` 产物。

---

## 本地构建 APK

需要 Android Studio + Java 21。

```bash
npm install
npm run build
npx cap sync android
cd android
./gradlew assembleRelease
# APK: android/app/build/outputs/apk/release/app-release.apk
```

本地 release 签名使用 `android/app/keystore.properties` 中的配置。
