#!/bin/bash
# LaTeXSnipper Mobile — 完整测试套件
# 在 conda ppocr_finetune 环境中运行所有测试
# 使用方式: conda activate ppocr_finetune && bash test/run_tests.sh

export PYTHONIOENCODING=utf-8

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR/.." || exit 1

PASS=0
FAIL=0

pass() { PASS=$((PASS+1)); echo "  ✅ PASS"; }
fail() { FAIL=$((FAIL+1)); echo "  ❌ FAIL: $1"; }

echo "═══════════════════════════════════════════════"
echo "  LaTeXSnipper Mobile Test Suite"
echo "  $(date)"
echo "═══════════════════════════════════════════════"

# ═══ 1. 公式检测 (YOLOv8) ═══
echo ""
echo "─── [1/7] Formula Detection (YOLOv8) ───"
python test/test_formula_det.py && pass || fail "formula detection"

# ═══ 2. 公式识别 (TrOCR) ═══
echo ""
echo "─── [2/7] Formula Recognition (TrOCR) ───"
python test/test_formula_rec.py && pass || fail "formula recognition"

# ═══ 3. 文字检测 (DBNet) ═══
echo ""
echo "─── [3/7] Text Detection (DBNet) ───"
python test/test_text_det.py && pass || fail "text detection"

# ═══ 4. 文字识别 (CRNN) ═══
echo ""
echo "─── [4/7] Text Recognition (CRNN) ───"
python test/test_text_rec.py && pass || fail "text recognition"

# ═══ 5. 文字识别管线 (DBNet + CRNN 端到端) ═══
echo ""
echo "─── [5/7] Text Recognition Pipeline (DBNet → CRNN end-to-end) ───"
python test/test_text_rec_pipeline.py && pass || fail "text rec pipeline"

# ═══ 6. 混合识别布局 (splitAroundFormulas + formatLayoutOutput) ═══
echo ""
echo "─── [6/7] Mixed Recognition Layout Logic ───"
python test/test_mixed_rec_layout.py && pass || fail "mixed rec layout"

# ═══ 7. 方向检测 (PP-LCNet) ═══
echo ""
echo "─── [7/7] Orientation (PP-LCNet) ───"
python test/test_orientation.py && pass || fail "orientation"

# ═══ 8. Pandoc WASM 导出 ═══
echo ""
echo "─── [8] Pandoc WASM Export ───"
node test/test_pandoc_export.js && pass || fail "pandoc export"

# ═══ 9. KaTeX 公式渲染 ═══
echo ""
echo "─── [9] KaTeX Formula Rendering ───"
node test/test_katex.js && pass || fail "katex"

# ═══ 10. 集成测试（项目结构检查）═══════
echo ""
echo "─── [10] Integration Tests ───"
node test/test_integration.js && pass || fail "integration"

# ═══ 总结 ═══
echo ""
echo "═══════════════════════════════════════════════"
echo "  Results: $PASS passed, $FAIL failed"
echo "═══════════════════════════════════════════════"
exit $FAIL
