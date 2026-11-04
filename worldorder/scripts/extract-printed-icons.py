"""Extract the supplied rulebooks' original colored vector symbols as SVG.

Run with the existing pdfplumber runtime; no image tracing or font substitution.
Coordinates below are PDF points from the top left of the printed page. The
prosperity instructions on base p19 have no standalone symbol, so none is made.
"""

from pathlib import Path
import argparse
from contextlib import ExitStack
from html import escape

import pdfplumber


ROOT = Path(__file__).resolve().parents[1]
SOURCES = {
    "base": "World_Order_-_Rulebook_v1.0.pdf",
    "wit": "World_Order_-_World_in_Turmoil_-_Rulebook_v1.0.pdf",
}
# id: source, printed/PDF page, selection box, original RGB, subpath count.
# Small padding in the selection boxes includes the entire compound symbol,
# excluding the nearby printed letters and punctuation.
ICONS = {
    "energy": ("base", 11, (525.8, 242.5, 534.5, 255.1), (.237, .236, .232), 6),
    "raw": ("base", 11, (539.4, 243.5, 549.0, 255.1), (.438, .437, .434), 6),
    "food": ("base", 11, (563.4, 242.0, 569.7, 255.1), (.843, .655, 0), 8),
    "goods": ("base", 11, (464.8, 290.1, 473.0, 303.1), (.115, .442, .721), 4),
    "services": ("base", 11, (525.4, 291.0, 537.0, 301.1), (.586, .107, .506), 4),
    "diplomacy": ("base", 11, (597.3, 291.2, 608.6, 302.1), (.584, .757, .12), 1),
    "army": ("base", 11, (378.5, 304.0, 401.7, 314.1), (.891, .022, .076), 11),
    "money": ("base", 12, (252.2, 390.2, 261.5, 399.5), (.953, .573, 0), 7),
    "vp": ("base", 16, (618.1, 218.8, 630.7, 229.2), (0, .407, .471), 18),
    "research": ("base", 17, (264.4, 387.4, 272.9, 400.1), (0, 0, 0), 5),
    "smart": ("wit", 6, (102.7, 143.7, 112.4, 154.7), (0, .342, .323), 3),
}


def number(value):
    return f"{value:.6f}".rstrip("0").rstrip(".") or "0"


def commands(path):
    """Keep absolute PDF coordinates; expand PDF v/y to SVG cubic commands."""
    current = None
    start = None
    for item in path:
        operator, *points = item
        if operator == "m":
            current = start = points[0]
            yield "M", points
        elif operator == "l":
            current = points[-1]
            yield "L", points
        elif operator == "c":
            current = points[-1]
            yield "C", points
        elif operator == "v":
            if current is None:
                raise ValueError("PDF v without current point")
            yield "C", [current, *points]
            current = points[-1]
        elif operator == "y":
            yield "C", [*points, points[-1]]
            current = points[-1]
        elif operator == "h":
            current = start
            yield "Z", []
        else:
            raise ValueError(f"Unsupported original path operator: {operator}")


def extract(name, pdf, source, page_number, box, color, count, output):
    page = pdf.pages[page_number - 1]
    x0, top, x1, bottom = box
    curves = [c for c in page.curves
              if x0 <= c["x0"] and c["x1"] <= x1
              and top <= c["top"] and c["bottom"] <= bottom
              and tuple(c["non_stroking_color"]) == color]
    if len(curves) != count:
        raise ValueError(f"{name}: expected {count} paths, found {len(curves)}")
    if any(not c["fill"] or c["stroke"] or c["evenodd"] for c in curves):
        raise ValueError(f"{name}: unexpected paint operation; review original")

    segments = [item for c in curves for item in commands(c["path"])]
    points = [point for _, values in segments for point in values]
    # pdfplumber's bounds use endpoints. Include every original control point to
    # avoid clipping curves whose extrema extend past those endpoint bounds.
    left = min(p[0] for p in points) - .1
    upper = min(p[1] for p in points) - .1
    right = max(p[0] for p in points) + .1
    lower = max(p[1] for p in points) + .1
    data = " ".join(op + " ".join(f"{number(x-left)},{number(y-upper)}"
                                   for x, y in values)
                    for op, values in segments)
    fill = "rgb(" + ",".join(number(c * 100) + "%" for c in color) + ")"
    desc = (f"Original vector artwork extracted from {SOURCES[source]}, "
            f"page {page_number}; selection x0,top,x1,bottom={box}. "
            f"Original RGB {color}; {count} compound subpaths, nonzero fill.")
    svg = (f'<svg xmlns="http://www.w3.org/2000/svg" '
           f'viewBox="0 0 {number(right-left)} {number(lower-upper)}">\n'
           f'  <title>{escape(name)}</title>\n'
           f'  <desc>{escape(desc)}</desc>\n'
           # One compound path is essential: separate filled subpaths would
           # cover the original holes in the barrel, phone, tank, coin, etc.
           f'  <path fill="{fill}" fill-rule="nonzero" d="{data}"/>\n'
           '</svg>\n')
    target = output / f"icon-{name}.svg"
    target.write_text(svg, encoding="utf-8")
    print(f"{target.relative_to(ROOT) if target.is_relative_to(ROOT) else target}: "
          f"{source} p{page_number}, box={box}, paths={count}, RGB={color}")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--references", type=Path, default=ROOT / "references")
    parser.add_argument("--output", type=Path, default=ROOT / "dist" / "assets")
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    with ExitStack() as stack:
        pdfs = {key: stack.enter_context(pdfplumber.open(args.references / filename))
                for key, filename in SOURCES.items()}
        for name, (source, page, box, color, count) in ICONS.items():
            extract(name, pdfs[source], source, page, box, color, count, args.output)


if __name__ == "__main__":
    main()
