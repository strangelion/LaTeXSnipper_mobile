# Add project specific ProGuard rules here.
# You can control the set of applied configuration files using the
# proguardFiles setting in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# ── ONNX Runtime ──
-keep class ai.onnxruntime.** { *; }
-keepnames class ai.onnxruntime.**

# ── OCR engine classes (loaded via Capacitor plugin reflection) ──
-keep class com.latexsnipper.app.ocr.** { *; }
-keepnames class com.latexsnipper.app.ocr.**

# ── Capacitor plugin bridge ──
-keep class com.latexsnipper.app.MainActivity { *; }
-keep class com.latexsnipper.app.ocr.OcrPlugin { *; }

# ── Keep JNI / native methods ──
-keepclasseswithmembernames class * {
    native <methods>;
}
