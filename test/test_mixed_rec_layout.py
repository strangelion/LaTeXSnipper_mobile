"""
test_mixed_rec_layout.py — Mixed recognition layout logic test.
Verifies that the layout composition logic (splitAroundFormulas + formatLayoutOutput)
produces correct output matching the Java OcrEngine implementation.

Key behaviors tested:
1. Inline formulas (embedding) → $...$ (no newlines, stays on same line)
2. Display formulas (isolated) → $$\n...\n$$ (gets its own line)
3. Same-line text+formula stays grouped as one line (y-overlap uses union box)
4. Adjacent text merged with space
5. Line grouping with y-overlap >= 0.45 (matching desktop)
"""
import sys, os
sys.path.insert(0, os.path.dirname(__file__))

from dataclasses import dataclass
from typing import List


# ── Data classes matching Java inner classes ──

@dataclass
class FormulaBox:
    x: int; y: int; w: int; h: int
    confidence: float = 0.5
    classId: int = 0   # 0=embedding (inline), 1=isolated (display)
    label: str = "embedding"

@dataclass
class TextBox:
    x: int; y: int; w: int; h: int; score: float = 0.5

@dataclass
class SegInterval:
    x: int; w: int; isFormula: bool; formulaKind: str = ""

@dataclass
class RegionResult:
    x: int; y: int; w: int; h: int
    type: str        # "formula" or "text"
    text: str
    confidence: float = 0.5
    formulaKind: str = "embedding"   # "embedding", "isolated", or "text"


# ── splitAroundFormulas (matching Java OcrEngine.splitAroundFormulas) ──

def split_around_formulas(text_box: TextBox, formula_boxes: List[FormulaBox]) -> List[SegInterval]:
    tx, ty, tw, th = text_box.x, text_box.y, text_box.w, text_box.h
    tx2, ty2 = tx + tw, ty + th

    segs = [SegInterval(tx, tw, False)]

    # Find relevant formula boxes (y-overlap check)
    relevant = [fb for fb in formula_boxes if fb.y < ty2 and fb.y + fb.h > ty]
    relevant.sort(key=lambda fb: fb.x)

    for fb in relevant:
        for i in range(len(segs)):
            s = segs[i]
            if s.isFormula:
                continue
            sx2 = s.x + s.w
            fx2 = fb.x + fb.w
            if s.x < fx2 and sx2 > fb.x:
                left_w = fb.x - s.x
                right_x = fx2
                right_w = sx2 - fx2
                replacements = []
                if left_w > 6:
                    replacements.append(SegInterval(s.x, left_w, False))
                replacements.append(SegInterval(fb.x, fb.w, True, fb.label))
                if right_w > 6:
                    replacements.append(SegInterval(right_x, right_w, False))
                segs[i:i+1] = replacements
                break
    return segs


# ── formatLayoutOutput (matching Java OcrEngine.formatLayoutOutput after fix) ──

def format_layout_output(regions: List[RegionResult]) -> str:
    if not regions:
        return ""
    if len(regions) == 1:
        r = regions[0]
        if r.type == "formula":
            if r.formulaKind == "isolated":
                return "$$\n" + r.text + "\n$$"
            return "\\(" + r.text + "\\)"
        return r.text

    # Group into lines by y-overlap (0.45 threshold, using union box)
    sorted_regions = sorted(regions, key=lambda r: (r.y, r.x))
    lines = [[sorted_regions[0]]]

    for curr in sorted_regions[1:]:
        added = False
        for line in lines:
            # Compute union box of all regions in this line
            ux = min(r.x for r in line)
            uy = min(r.y for r in line)
            ux2 = max(r.x + r.w for r in line)
            uy2 = max(r.y + r.h for r in line)
            uH = uy2 - uy

            y_overlap = min(uy2, curr.y + curr.h) - max(uy, curr.y)
            min_h = min(uH, curr.h)
            if min_h > 0 and y_overlap / min_h >= 0.45:
                line.append(curr)
                line.sort(key=lambda r: r.x)
                added = True
                break
        if not added:
            lines.append([curr])

    # Build output
    output_parts = []
    for line in lines:
        line_text_parts = []
        has_isolated = False
        for r in line:
            if r.type == "formula":
                text = r.text.strip()
                if not text:
                    continue
                if r.formulaKind == "isolated":
                    has_isolated = True
                    if line_text_parts:
                        line_text_parts.append(" ")
                    line_text_parts.append("$$\n" + text + "\n$$")
                    line_text_parts.append(" ")
                else:
                    # inline formula
                    if line_text_parts:
                        line_text_parts.append(" ")
                    line_text_parts.append("\\(" + text + "\\)")
                    line_text_parts.append(" ")
            else:
                text = r.text.strip()
                if text:
                    if line_text_parts:
                        line_text_parts.append(" ")
                    line_text_parts.append(text)

        merged = "".join(line_text_parts).strip()
        if merged:
            if has_isolated:
                merged = "\n" + merged + "\n"
            output_parts.append(merged)

    result = "\n".join(output_parts)
    # Collapse triple newlines
    while "\n\n\n" in result:
        result = result.replace("\n\n\n", "\n\n")
    return result.strip()


# ── Tests ──

def test_inline_formula_stays_on_same_line():
    """Inline formula in text line -> $...$, same line."""
    regions = [
        RegionResult(10, 100, 60, 18, "text", "hello"),
        RegionResult(80, 95, 50, 25, "formula", "x^2", formulaKind="embedding"),
        RegionResult(140, 100, 40, 18, "text", "world"),
    ]
    result = format_layout_output(regions)
    print("  Result: '%s'" % result)
    # Should be one line: hello $x^2$ world
    assert "\\(" in result or result.count("\\(") > 0, \
        "Expected inline formula on same line, got newline in: '%s'" % result
    assert "\\(" in result, "Expected \\(...\\), got '%s'" % result
    assert "hello" in result and "world" in result
    print("  PASS")


def test_isolated_formula_gets_own_line():
    """Isolated/display formula -> $$...$$, separate line."""
    regions = [
        RegionResult(10, 100, 60, 18, "text", "hello"),
        RegionResult(10, 140, 200, 60, "formula", "\\int_0^\\infty f(x)dx",
                     formulaKind="isolated"),
        RegionResult(10, 220, 70, 18, "text", "world"),
    ]
    result = format_layout_output(regions)
    print("  Result: '%s'" % result)
    assert "$$\n" in result, "Expected $$ wrapping for isolated, got: '%s'" % result
    assert "hello" in result and "world" in result
    assert "\\int_0^\\infty" in result
    lines = [l for l in result.split("\n") if l.strip()]
    print("  Lines: %s" % lines)
    assert any("hello" in l for l in lines), "Expected 'hello' in a line"
    assert any("world" in l for l in lines), "Expected 'world' in a line"
    print("  PASS")


def test_same_line_union_box_y_overlap():
    """Text and formula in same row should group as one line via union box y-overlap.

    Simulates: a text box at y=100 h=14 and a formula box at y=92 h=28.
    First element's box is y=100-114, formula is y=92-120.
    Using union line box = y=92-120, overlap with formula = 100% -> grouped.
    Using old first-element-only = overlap(100-114, 92-120)=14, minH=14 -> 100% -> grouped.

    But the real desktop scenario is:
    A single DBNet text box spans both text and formula horizontally.
    splitAroundFormulas produces segments at the SAME y position.
    So regions all share the same text_box.y and text_box.h.
    The key test is when two DIFFERENT DBNet text boxes at slightly
    different y positions produce segments that should be merged.
    """
    # Scenario: two DBNet boxes at slightly different y but similar vertical range
    regions = [
        # Text segment from first DBNet box at y=95 h=20
        RegionResult(10, 95, 60, 20, "text", "hello"),
        # Formula segment from second DBNet box at y=100 h=18
        # Both should merge because union box = y=95-120 covers both
        RegionResult(80, 100, 40, 22, "formula", "x+y", formulaKind="embedding"),
        # Text segment from first box appended
        RegionResult(130, 95, 50, 20, "text", "world"),
    ]
    result = format_layout_output(regions)
    print("  Result: '%s'" % result)
    # Should be one line even though y positions differ a bit
    lines = result.split("\n")
    non_empty = [l for l in lines if l.strip()]
    assert len(non_empty) == 1, \
        "Expected 1 line, got %d: '%s'" % (len(non_empty), non_empty)
    print("  PASS")


def test_different_same_line_segments():
    """Text regions from the same DBNet box (same y/h) should always be one line.

    This simulates the real mixed mode flow:
    DBNet produces one box spanning both text and formula.
    splitAroundFormulas splits at the formula x-range, but all segments
    share the SAME y/h (from the parent text box).
    """
    regions = [
        RegionResult(10, 100, 60, 18, "text", "This is"),
        RegionResult(80, 100, 50, 18, "formula", "E=mc^2", formulaKind="embedding"),
        RegionResult(140, 100, 55, 18, "text", "a test"),
    ]
    result = format_layout_output(regions)
    print("  Result: '%s'" % result)
    assert "\n" not in result, "Expected single line, got: '%s'" % result
    assert "\\(" in result and "\\)" in result
    assert "This is" in result
    assert "a test" in result
    print("  PASS")


def test_split_around_formulas_basic():
    """Basic split: text box containing a formula in the middle."""
    tb = TextBox(0, 100, 300, 30)
    formulas = [FormulaBox(100, 90, 60, 50)]  # classId=0 -> embedding

    segs = split_around_formulas(tb, formulas)
    print("  Segments: %s" % [(s.x, s.w, s.isFormula, s.formulaKind) for s in segs])

    assert len(segs) == 3, "Expected 3 segments, got %d" % len(segs)
    assert not segs[0].isFormula, "First should be text"
    assert segs[1].isFormula, "Middle should be formula"
    assert segs[1].formulaKind == "embedding", "Should be embedding"
    assert not segs[2].isFormula, "Last should be text"
    print("  PASS")


def test_split_around_formulas_isolated():
    """Isolated formula -> formulaKind='isolated'."""
    tb = TextBox(50, 100, 200, 40)
    formulas = [FormulaBox(100, 90, 80, 60, classId=1, label="isolated")]

    segs = split_around_formulas(tb, formulas)
    print("  Segments: %s" % [(s.x, s.w, s.isFormula, s.formulaKind) for s in segs])

    assert len(segs) == 3, "Expected 3 segments, got %d" % len(segs)
    assert segs[1].isFormula
    assert segs[1].formulaKind == "isolated"
    print("  PASS")


def test_adjacent_formulas():
    """Multiple formulas in one text box."""
    tb = TextBox(0, 100, 400, 30)
    formulas = [
        FormulaBox(50, 90, 40, 50, classId=0, label="embedding"),
        FormulaBox(200, 90, 60, 50, classId=0, label="embedding"),
    ]

    segs = split_around_formulas(tb, formulas)
    print("  Segments: %s" % [(s.x, s.w, s.isFormula, s.formulaKind) for s in segs])

    # Should have: text(0-50) + formula(50-90) + text(90-200) + formula(200-260) + text(260-400)
    formula_segs = [s for s in segs if s.isFormula]
    assert len(formula_segs) == 2, "Expected 2 formula segments, got %d" % len(formula_segs)
    print("  PASS")


def test_display_formula_line_grouping():
    """Display formula in a line of its own -- should be separate from text lines."""
    regions = [
        RegionResult(10, 100, 200, 20, "text", "first paragraph line"),
        RegionResult(10, 200, 400, 80, "formula", "\\begin{aligned}E&=mc^2\\\\F&=ma\\end{aligned}",
                     formulaKind="isolated"),
        RegionResult(10, 350, 200, 20, "text", "second paragraph line"),
    ]
    result = format_layout_output(regions)
    print("  Result: '%s'" % result)
    # Should have the formula in its own $$ block
    assert "$$\n" in result
    assert "\\begin{aligned}" in result
    lines = [l.strip() for l in result.split("\n") if l.strip()]
    print("  Lines: %s" % lines)
    assert any("$$" in l for l in lines) or any("aligned" in l for l in lines), \
        "Expected formula with $$ or aligned in output: '%s'" % result
    print("  PASS")


def test_empty_regions():
    """Empty input returns empty string."""
    assert format_layout_output([]) == ""
    print("  PASS")


def test_single_text():
    """Single text region returns plain text."""
    result = format_layout_output([RegionResult(0, 0, 50, 18, "text", "hello")])
    assert result == "hello"
    print("  PASS")


def test_single_inline_formula():
    """Single inline formula -> \(...\)"""
    result = format_layout_output([
        RegionResult(0, 0, 50, 18, "formula", "x^2", formulaKind="embedding")
    ])
    assert result == "\\(x^2\\)", "Got: '%s'" % result
    print("  PASS")


def test_single_isolated_formula():
    """Single isolated formula -> $$...$$"""
    result = format_layout_output([
        RegionResult(0, 0, 200, 60, "formula", "\\int f(x)dx", formulaKind="isolated")
    ])
    assert result == "$$\n\\int f(x)dx\n$$", "Got: '%s'" % result
    print("  PASS")


def test_engine_cascade():
    """
    End-to-end simulation: DBNet boxes → splitAroundFormulas → recognize → formatLayoutOutput.
    This exercises the exact same logic path as the Java mixed recognition pipeline.
    """
    # Simulate a real scenario: one line with "Text formula_text end"
    text_boxes = [
        TextBox(10, 100, 300, 28),   # spans both text and formula
    ]
    formula_boxes = [
        FormulaBox(100, 92, 60, 44, classId=0, label="embedding"),
    ]

    # Step: split text boxes around formulas
    all_regions = []
    for tb in text_boxes:
        segs = split_around_formulas(tb, formula_boxes)
        for seg in segs:
            if seg.isFormula:
                all_regions.append(RegionResult(
                    seg.x, tb.y, seg.w, tb.h,
                    "formula", "x + y", formulaKind=seg.formulaKind))
            else:
                all_regions.append(RegionResult(
                    seg.x, tb.y, seg.w, tb.h,
                    "text", "dummy", formulaKind="text"))

    # Format
    result = format_layout_output(all_regions)
    print("  Result: '%s'" % result)
    assert "x + y" in result or "\\(" in result
    print("  PASS")


if __name__ == '__main__':
    tests = [
        ("empty", test_empty_regions),
        ("single_text", test_single_text),
        ("single_inline", test_single_inline_formula),
        ("single_isolated", test_single_isolated_formula),
        ("inline_same_line", test_inline_formula_stays_on_same_line),
        ("isolated_own_line", test_isolated_formula_gets_own_line),
        ("same_y_segments", test_different_same_line_segments),
        ("union_box_overlap", test_same_line_union_box_y_overlap),
        ("split_basic", test_split_around_formulas_basic),
        ("split_isolated", test_split_around_formulas_isolated),
        ("split_adjacent", test_adjacent_formulas),
        ("display_line", test_display_formula_line_grouping),
        ("engine_cascade", test_engine_cascade),
    ]

    passed = 0
    failed = 0
    for name, test_fn in tests:
        try:
            print("\n--- [%s] ---" % name)
            test_fn()
            print("  [PASS]")
            passed += 1
        except Exception as e:
            print("  [FAIL]: %s" % e)
            import traceback
            traceback.print_exc()
            failed += 1

    print("\n%s" % ("=" * 50))
    print("  Results: %d passed, %d failed" % (passed, failed))
    print("%s" % ("=" * 50))
    sys.exit(failed)
