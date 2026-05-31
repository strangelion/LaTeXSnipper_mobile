package com.latexsnipper.app.ocr;

import android.content.Context;
import android.util.Log;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.util.ArrayList;
import java.util.List;

/**
 * TextRecPostProcess — CTC greedy decode for PP-OCRv5 CRNN output.
 * <p>
 * Matches text-recognition.js :: ctcDecode() + keys loading.
 */
public class TextRecPostProcess {

    private static final String TAG = "TextRecPost";

    private List<String> keys = new ArrayList<>();
    private boolean keysLoaded = false;

    // Traditional → Simplified Chinese mapping
    private static final java.util.Map<Character, Character> T2S = buildT2S();

    /**
     * Load the ppocrv5_keys.txt from assets (one character per line).
     */
    public void loadKeys(Context ctx) {
        try {
            InputStream is = ctx.getAssets().open(
                "public/models/mathcraft-text-rec/ppocrv5_keys.txt");
            BufferedReader br = new BufferedReader(new InputStreamReader(is, "UTF-8"));
            String line;
            while ((line = br.readLine()) != null) {
                keys.add(line);
            }
            br.close();
            keysLoaded = true;
            Log.d(TAG, "Keys loaded: " + keys.size());
        } catch (Exception e) {
            Log.e(TAG, "Failed to load keys", e);
        }
    }

    public boolean isKeysReady() { return keysLoaded; }

    /**
     * CTC greedy decode:
     * <ol>
     *   <li>Argmax at each output timestep</li>
     *   <li>Collapse consecutive identical non-blank labels</li>
     *   <li>Map label IDs to characters via keys list</li>
     *   <li>Apply Traditional→Simplified Chinese conversion</li>
     * </ol>
     *
     * @param logits  Model output [1, seqLen, vocabSize].
     * @param dims    Output shape: [1, seqLen, vocabSize].
     * @return Decoded text and average confidence.
     */
    public DecodeResult ctcDecode(float[] logits, long[] dims) {
        int seqLen = (int) dims[1];
        int vocabSize = (int) dims[2];
        int spaceId = keys.size() + 1; // Last valid index + 1 = space

        StringBuilder text = new StringBuilder();
        int prev = -1;
        float confSum = 0;
        int confCount = 0;

        for (int t = 0; t < seqLen; t++) {
            int offset = t * vocabSize;
            int maxIdx = 0;
            float maxVal = logits[offset];
            for (int i = 1; i < vocabSize; i++) {
                if (logits[offset + i] > maxVal) {
                    maxVal = logits[offset + i];
                    maxIdx = i;
                }
            }

            if (maxIdx != prev && maxIdx > 0) {
                if (maxIdx == spaceId) {
                    text.append(' ');
                } else if (maxIdx <= keys.size()) {
                    text.append(keys.get(maxIdx - 1));
                }
                confSum += maxVal;
                confCount++;
            }
            prev = maxIdx;
        }

        // Clean and simplify
        String raw = text.toString().replace("\r", "").replace("\n", "").trim();
        String simplified = simplifyText(raw);
        float conf = confCount > 0 ? confSum / confCount : 0;

        return new DecodeResult(simplified, conf);
    }

    /**
     * Traditional → Simplified Chinese conversion.
     * Matches simplify.js logic.
     */
    public static String simplifyText(String text) {
        if (text == null || text.isEmpty()) return text;
        StringBuilder sb = new StringBuilder(text.length());
        for (int i = 0; i < text.length(); i++) {
            char c = text.charAt(i);
            Character s = T2S.get(c);
            sb.append(s != null ? s : c);
        }
        return sb.toString();
    }

    /** Result of CTC decode. */
    public static class DecodeResult {
        public final String text;
        public final float confidence;
        public DecodeResult(String text, float confidence) {
            this.text = text;
            this.confidence = confidence;
        }
    }

    // ── Traditional→Simplified mapping (from simplify.js T2S Map) ──

    private static java.util.Map<Character, Character> buildT2S() {
        java.util.Map<Character, Character> map = new java.util.HashMap<>();
        // General pairs
        putPairs(map, "線线", "綫线", "聯联", "係系", "體体", "國国", "時时", "來来",
            "對对", "會会", "過过", "個个", "們们", "說说", "學学", "開开", "動动", "從从",
            "後后", "種种", "為为", "麼么", "這这", "裏里", "裡里", "頭头", "實实", "現现",
            "點点", "當当", "還还", "機机", "關关", "見见", "間间", "長长", "問问", "門门",
            "書书", "變变", "電电", "話话", "萬万", "邊边", "業业", "義义", "進进", "經经",
            "發发", "兩两", "樣样", "應应", "聲声", "處处", "氣气", "風风", "場场",
            "數数", "積积", "極极", "導导", "連连", "續续", "證证", "設设", "計计", "確确",
            "標标", "準准", "無无", "窮穷", "限限", "趨趋", "勢势", "圍围", "轉转", "換换",
            "單单", "調调", "遞递", "歸归", "納纳", "舉举", "類类", "統统", "維维", "複复",
            "雜杂", "顯显", "隱隐", "鄰邻", "圓圆", "橢椭", "雙双", "徑径", "週周", "範范",
            "跡迹", "恆恒", "負负", "異异", "餘余", "參参", "約约", "級级", "項项", "順顺",
            "區区", "別别", "葉叶", "滅灭", "疊叠", "礎础", "構构", "層层", "歐欧", "亞亚",
            "羅罗", "馬马", "貝贝", "爾尔", "識识", "議议", "論论", "驗验", "測测", "觀观",
            "質质", "誤误", "據据", "態态", "況况", "狀状", "圖图", "畫画", "稱称", "條条",
            "術术", "規规", "則则", "強强",
            "閉闭", "閱阅", "聞闻", "闡阐", "闔阖", "閣阁", "閥阀",
            "視视", "覺觉", "覽览", "親亲", "語语", "讀读", "誰谁", "課课", "讓让", "記记",
            "認认", "試试", "該该", "請请", "講讲", "謝謝", "譯译",
            "護护", "蠻蛮", "戀恋", "駕驾", "騎骑", "騙骗", "馳驰",
            "魚鱼", "鮮鲜", "魯鲁", "鯨鲸", "鳥鸟", "鴨鸭", "雞鸡", "鳴鸣", "鳳凤",
            "龍龙", "龜龟", "齊齐", "齒齿", "齡龄",
            "運运", "達达", "遠遠", "遲迟", "適适", "選选", "遺遗", "邏逻",
            "邁迈", "遜逊", "東东", "飛飞", "飯饭", "飲饮", "飽饱", "饅馒", "餃饺", "餅饼",
            "養养", "餓饿", "銀银", "銅铜", "鐵铁", "鋼钢", "錢钱", "鏡镜", "鐘钟", "針针",
            "錯错", "鋒锋", "鎖锁", "車车", "輛辆", "輪轮", "輕輕", "載载", "較较", "輔辅",
            "輸输", "輻辐", "軌轨", "轟轰",
            "寫写", "算算", "僅僅", "盡尽", "夢梦", "藥药", "藝艺",
            "舊旧", "歸归", "亂乱", "辭辞", "憂忧", "擊击", "與与", "興兴", "舉举");
        return map;
    }

    private static void putPairs(java.util.Map<Character, Character> map, String... pairs) {
        for (String pair : pairs) {
            if (pair.length() >= 2) {
                map.put(pair.charAt(0), pair.charAt(1));
            }
        }
    }
}
