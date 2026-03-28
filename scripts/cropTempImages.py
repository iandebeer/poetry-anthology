#!/usr/bin/env python3
"""
Crop poem-card PNGs in temp/: remove bottom grey text band (when detected), then trim uniform borders.

Reads:  temp/*.png
Writes: temp/cropped/<same-name>.png (originals unchanged)
"""

from __future__ import annotations

import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TEMP = ROOT / "temp"
OUT = TEMP / "cropped"


def sh(cmd: list[str]) -> str:
    return subprocess.check_output(cmd, text=True).strip()


def identify_wh(path: Path) -> tuple[int, int]:
    out = sh(["magick", "identify", "-format", "%w %h", str(path)])
    w, h = out.split()
    return int(w), int(h)


def row_mean_gray(path: Path, w: int, h: int, y: int, strip: int = 18) -> float:
    """Mean luminance (0–255) on a central horizontal band (avoids side frames)."""
    y = max(0, min(y, h - strip))
    cw = max(120, int(w * 0.55))
    cx = (w - cw) // 2
    out = sh(
        [
            "magick",
            str(path),
            "-crop",
            f"{cw}x{strip}+{cx}+{y}",
            "+repage",
            "-colorspace",
            "gray",
            "-format",
            "%[fx:255*mean]",
            "info:",
        ]
    )
    return float(out)


def find_text_split_y(path: Path, w: int, h: int) -> int | None:
    """
    First row y of a bottom grey text panel, or None.
    Walks upward from the bottom: requires bottom rows to be grey (~caption bar);
    returns y at the first grey row of that band (crop keeps 0..y).
    """
    if h < 200:
        return None

    def is_grey_bar(my: int) -> bool:
        m = row_mean_gray(path, w, h, my)
        return 124 < m < 200

    step = max(4, h // 220)
    y0 = h - max(28, step * 2)
    if not is_grey_bar(y0):
        return None

    y = y0
    while y >= int(h * 0.33):
        y -= step
        if not is_grey_bar(y):
            return y + step

    return None


def edge_shave_pixels(path: Path) -> tuple[int, int, int, int]:
    """
    One magick call per axis: sample mid row/column into text, parse RGB triples.
    Returns (left, top, right, bottom) pixels to shave.
    """
    w, h = identify_wh(path)
    if w < 30 or h < 30:
        return 0, 0, 0, 0

    def is_frame_rgb(r: int, g: int, b: int) -> bool:
        if r > 240 and g > 240 and b > 240:
            return True
        if abs(r - g) < 8 and abs(g - b) < 8:
            t = (r + g + b) / 3
            if t < 12:
                return True
            if 70 < t < 95:
                return True
            if 115 < t < 175:
                return True
        return False

    def parse_txt_rgb(txt: str) -> list[tuple[int, int, int]]:
        return [(int(a), int(b), int(c)) for a, b, c in re.findall(r"\((\d+),(\d+),(\d+)\)", txt)]

    ym, xm = h // 2, w // 2
    cap = min(32, w // 6, h // 6)

    # Scale to ≤900px along scanned axis so txt:- stays small
    row_max = 900
    rw = min(w, row_max)
    row_txt = sh(
        [
            "magick",
            str(path),
            "-crop",
            f"{w}x1+0+{ym}",
            "+repage",
            "-scale",
            f"{rw}x1!",
            "-depth",
            "8",
            "txt:-",
        ]
    )
    row_px = parse_txt_rgb(row_txt)
    left = right = 0
    if len(row_px) >= rw:
        for x in range(min(cap, rw)):
            r, g, b = row_px[x]
            if not is_frame_rgb(r, g, b):
                left = int(x * w / rw)
                break
        for x in range(min(cap, rw)):
            r, g, b = row_px[rw - 1 - x]
            if not is_frame_rgb(r, g, b):
                right = int(x * w / rw)
                break

    col_max = 900
    rh = min(h, col_max)
    col_txt = sh(
        [
            "magick",
            str(path),
            "-crop",
            f"1x{h}+{xm}+0",
            "+repage",
            "-scale",
            f"1x{rh}!",
            "-depth",
            "8",
            "txt:-",
        ]
    )
    col_px = parse_txt_rgb(col_txt)
    top = bottom = 0
    if len(col_px) >= rh:
        for y in range(min(cap, rh)):
            r, g, b = col_px[y]
            if not is_frame_rgb(r, g, b):
                top = int(y * h / rh)
                break
        for y in range(min(cap, rh)):
            r, g, b = col_px[rh - 1 - y]
            if not is_frame_rgb(r, g, b):
                bottom = int(y * h / rh)
                break

    return left, top, right, bottom


def crop_poem_card(src: Path, dest: Path, *, work_dir: Path | None = None) -> str:
    """
    Crop one poem card PNG (remove bottom grey text bar if present, trim, shave frame)
    and write to dest. Returns a short log line.
    """
    import shutil
    import tempfile

    dest.parent.mkdir(parents=True, exist_ok=True)
    tmp = Path(work_dir) if work_dir is not None else Path(tempfile.mkdtemp(prefix="poem-crop-"))
    own_tmp = work_dir is None
    try:
        work = tmp / "work.png"
        trimmed = tmp / "trim.png"
        w, h = identify_wh(src)
        split = find_text_split_y(src, w, h)

        if split is not None and split > int(h * 0.25):
            subprocess.check_call(
                ["magick", str(src), "-crop", f"{w}x{split}+0+0", "+repage", str(work)]
            )
            note = f"text@y={split}"
        else:
            shutil.copy(src, work)
            note = "no text band"

        w0, h0 = identify_wh(work)
        subprocess.check_call(
            [
                "magick",
                str(work),
                "-fuzz",
                "8%",
                "-trim",
                "+repage",
                str(trimmed),
            ]
        )
        w1, h1 = identify_wh(trimmed)
        if w1 * h1 >= int(w0 * h0 * 0.92):
            shutil.copy(trimmed, work)

        l, t, r, b = edge_shave_pixels(work)
        w2, h2 = identify_wh(work)
        if l + t + r + b > 0 and w2 > l + r + 4 and h2 > t + b + 4:
            subprocess.check_call(
                [
                    "magick",
                    str(work),
                    "-crop",
                    f"{w2 - l - r}x{h2 - t - b}+{l}+{t}",
                    "+repage",
                    str(dest),
                ]
            )
        else:
            shutil.copy(work, dest)

        wf, hf = identify_wh(dest)
        return f"{src.name}: {w}x{h} → {wf}x{hf} ({note}, shave LTRB={l},{t},{r},{b})"
    finally:
        if own_tmp:
            shutil.rmtree(tmp, ignore_errors=True)


def main() -> int:
    if len(sys.argv) == 3 and sys.argv[1].endswith(".png") and sys.argv[2].endswith(".png"):
        print(crop_poem_card(Path(sys.argv[1]), Path(sys.argv[2])))
        return 0

    TEMP.mkdir(parents=True, exist_ok=True)
    OUT.mkdir(parents=True, exist_ok=True)

    pngs = sorted(TEMP.glob("*.png"))
    if not pngs:
        print("No PNG files in", TEMP, file=sys.stderr)
        return 1

    import tempfile

    for src in pngs:
        with tempfile.TemporaryDirectory(prefix="batch-crop-") as td:
            print(crop_poem_card(src, OUT / src.name, work_dir=Path(td)))

    print(f"Wrote {len(pngs)} file(s) → {OUT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
