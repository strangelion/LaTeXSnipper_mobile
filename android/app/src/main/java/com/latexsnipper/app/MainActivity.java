package com.latexsnipper.app;

import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;
import com.latexsnipper.app.ocr.NativeOcrBridge;

public class MainActivity extends BridgeActivity {

    private NativeOcrBridge ocrBridge;
    private boolean injected = false;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        ocrBridge = new NativeOcrBridge(this);
    }

    @Override
    public void onResume() {
        super.onResume();
        injectBridge();
    }

    /**
     * Retry injecting the native bridge into WebView up to 10 times (5 seconds).
     * The bridge must be injected BEFORE the JS boot() function runs.
     */
    private void injectBridge() {
        if (injected) return;
        try {
            WebView wv = bridge.getWebView();
            if (wv != null) {
                wv.addJavascriptInterface(ocrBridge, "NativeOcr");
                injected = true;
                android.util.Log.d("MainActivity", "NativeOcr bridge injected (sync)");
                return;
            }
        } catch (Exception e) {
            android.util.Log.e("MainActivity", "Inject failed, will retry", e);
        }
        // WebView not ready yet — retry in 100ms
        new Handler(Looper.getMainLooper()).postDelayed(this::injectBridge, 100);
    }
}
