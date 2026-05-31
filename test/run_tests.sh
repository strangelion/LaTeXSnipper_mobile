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
echo "─── [1/5] Formula Detection (YOLOv8) ───"
python test/test_formula_det.py && pass || fail "formula detection"

# ═══ 2. 公式识别 (TrOCR) ═══
echo ""
echo "─── [2/5] Formula Recognition (TrOCR) ───"
python test/test_formula_rec.py && pass || fail "formula recognition"

# ═══ 3. 文字检测 (DBNet) ═══
echo ""
echo "─── [3/5] Text Detection (DBNet) ───"
python test/test_text_det.py && pass || fail "text detection"

# ═══ 4. 文字识别 (CRNN) ═══
echo ""
echo "─── [4/5] Text Recognition (CRNN) ───"
python test/test_text_rec.py && pass || fail "text recognition"

# ═══ 5. 方向检测 (PP-LCNet) ═══
echo ""
echo "─── [5/5] Orientation (PP-LCNet) ───"
python test/test_orientation.py && pass || fail "orientation"

# ═══ 总结 ═══
echo ""
echo "═══════════════════════════════════════════════"
echo "  Results: $PASS passed, $FAIL failed"
echo "═══════════════════════════════════════════════"
exit $FAIL
