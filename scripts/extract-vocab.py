#!/usr/bin/env python3
"""
One-off extraction script: parses the Oxford 3000 and Oxford 5000 "by CEFR
level" PDFs (sitting at the repo root) into flat JSON lists of
{"word", "pos", "cefr"} entries.

Layout notes (reverse-engineered by inspecting pdfplumber word boxes):
  - Each page lays the word list out in ~4 vertical columns, filled
    column-major (all of column 1 top-to-bottom, then column 2, etc.),
    continuing across pages. This is NOT the same as reading each visual
    text line left-to-right - pdfplumber's default extract_text() jumbles
    rows across columns when their y-positions don't line up exactly, so we
    reconstruct columns ourselves from word bounding boxes.
  - Regular vocab entries ("word", "pos.") are rendered at font height 9.0pt.
  - CEFR level headers ("A1", "A2", "B1", "B2", "C1") are standalone tokens
    rendered at font height 18.0pt - this is what lets us tell a level
    marker apart from a body word (e.g. the marker "B1" vs. some word that
    happens to render near a "B1" mention in running text).
  - Page title (30.0pt) and the one-line intro paragraph (12.0pt) are
    filtered out by height too; the footer ("(c) Oxford University Press ...")
    renders at 8.5pt and is filtered out the same way.

Usage:
    pip install pdfplumber --break-system-packages   # if not already installed
    python3 scripts/extract-vocab.py
"""
import json
import re
from collections import defaultdict
from pathlib import Path

import pdfplumber

REPO_ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = REPO_ROOT / "packages" / "shared" / "data" / "vocab"

BODY_HEIGHT = 9.0
MARKER_HEIGHT = 18.0
HEIGHT_TOL = 0.6

LEVEL_TOKENS = {"A1", "A2", "B1", "B2", "C1", "C2"}

# Part-of-speech tokens as they appear in the source PDFs, longest/most
# specific alternatives first so the regex alternation prefers them.
POS_ALTS = [
    r"modal v\.",
    r"auxiliary v\.",
    r"indefinite article",
    r"definite article",
    r"n\.",
    r"v\.",
    r"adj\.",
    r"adv\.",
    r"prep\.",
    r"conj\.",
    r"det\.",
    r"pron\.",
    r"number",
    r"exclam\.",
]
POS_CORE = r"(?:" + "|".join(POS_ALTS) + r")"
POS_CLUSTER = POS_CORE + r"(?:\s*[,/]\s*" + POS_CORE + r")*"
LINE_RE = re.compile(r"^(?P<word>.+?)\s+(?P<pos>" + POS_CLUSTER + r")\s*$")

# Strips a trailing Oxford homograph-sense digit directly after a word,
# e.g. "close1" -> "close", "minute1" -> "minute".
HOMOGRAPH_DIGIT_RE = re.compile(r"(?<=[A-Za-z])\d+\b")
# Strips parenthetical sense clarifications, e.g. "last1 (final)" -> "last1".
PAREN_RE = re.compile(r"\s*\([^)]*\)")


# Both source PDFs use a fixed 4-column print layout with word-start anchors
# at x0 ~= 43, 173, 304, 434 on every page. A naive "cluster by gap between
# observed x0 values" approach is unsafe here: on some pages a column-2 pos-tag
# (e.g. a wide "det./ number" style entry) extends out to x0=282, only 22px
# from column 3's start (304) - well under any gap threshold that also needs
# to be wide enough to bin column 1's narrower entries correctly. That false
# merge then transitively collapses columns 2-4 into a single bucket and
# scrambles entries together. Fixed bin edges (verified empirically to clear
# every page's actual min/max x0 per column in both PDFs, see
# scripts/extract-vocab.py history) sidestep that entirely.
COLUMN_BIN_EDGES = [0, 155, 293, 422, 999999]


def assign_column(x0, edges=COLUMN_BIN_EDGES):
    for i in range(len(edges) - 1):
        if edges[i] <= x0 < edges[i + 1]:
            return i
    return len(edges) - 2


def clean_word(raw_word: str) -> str:
    w = PAREN_RE.sub("", raw_word)
    w = HOMOGRAPH_DIGIT_RE.sub("", w)
    return w.strip().strip(",").strip()


def extract_pdf(pdf_path: Path, start_level: str):
    """Returns list of {"word","pos","cefr"} dicts, processing the PDF in
    logical column-major reading order across all its pages."""
    entries = []
    current_level = start_level
    unparsed = []

    with pdfplumber.open(pdf_path) as pdf:
        for page in pdf.pages:
            words = page.extract_words()
            # Keep only body-text (9.0pt) and level-marker (18.0pt) words;
            # this drops the title, intro paragraph, and footer.
            relevant = [
                w for w in words
                if abs(w["height"] - BODY_HEIGHT) < HEIGHT_TOL
                or abs(w["height"] - MARKER_HEIGHT) < HEIGHT_TOL
            ]
            if not relevant:
                continue

            col_words = defaultdict(list)
            for w in relevant:
                col_words[assign_column(w["x0"])].append(w)

            for col_idx in sorted(col_words):
                cw = col_words[col_idx]
                # Group tokens into rows by proximity in 'top' (same visual line).
                cw_sorted = sorted(cw, key=lambda w: (w["top"], w["x0"]))
                rows = []
                cur_row = [cw_sorted[0]]
                for w in cw_sorted[1:]:
                    if abs(w["top"] - cur_row[-1]["top"]) <= 2.0:
                        cur_row.append(w)
                    else:
                        rows.append(cur_row)
                        cur_row = [w]
                rows.append(cur_row)

                for row in rows:
                    row_sorted = sorted(row, key=lambda w: w["x0"])
                    text = " ".join(w["text"] for w in row_sorted).strip()

                    # Level marker row: single token, big font, known level name.
                    if len(row_sorted) == 1 and text in LEVEL_TOKENS and abs(row_sorted[0]["height"] - MARKER_HEIGHT) < HEIGHT_TOL:
                        current_level = text
                        continue

                    m = LINE_RE.match(text)
                    if not m:
                        unparsed.append(text)
                        continue

                    word = clean_word(m.group("word"))
                    pos = m.group("pos").strip()
                    if not word:
                        unparsed.append(text)
                        continue
                    entries.append({"word": word, "pos": pos, "cefr": current_level})

    return entries, unparsed


def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    oxford3000_path = REPO_ROOT / "The_Oxford_3000_by_CEFR_level.pdf"
    oxford5000_path = REPO_ROOT / "The_Oxford_5000_by_CEFR_level.pdf"

    print("Extracting", oxford3000_path.name)
    entries_3000, unparsed_3000 = extract_pdf(oxford3000_path, start_level="A1")
    print("Extracting", oxford5000_path.name)
    entries_5000, unparsed_5000 = extract_pdf(oxford5000_path, start_level="B2")

    out_3000 = OUT_DIR / "_raw-oxford-3000.json"
    out_5000 = OUT_DIR / "_raw-oxford-5000.json"
    out_3000.write_text(json.dumps(entries_3000, ensure_ascii=False, indent=2), encoding="utf-8")
    out_5000.write_text(json.dumps(entries_5000, ensure_ascii=False, indent=2), encoding="utf-8")

    def level_counts(entries):
        c = Counter = {}
        for e in entries:
            c[e["cefr"]] = c.get(e["cefr"], 0) + 1
        return c

    print("\n--- Oxford 3000 ---")
    print("Total entries:", len(entries_3000))
    for lvl, n in sorted(level_counts(entries_3000).items()):
        print(f"  {lvl}: {n}")
    print("Unparsed lines:", len(unparsed_3000))
    if unparsed_3000:
        print("  sample:", unparsed_3000[:15])

    print("\n--- Oxford 5000 (additional) ---")
    print("Total entries:", len(entries_5000))
    for lvl, n in sorted(level_counts(entries_5000).items()):
        print(f"  {lvl}: {n}")
    print("Unparsed lines:", len(unparsed_5000))
    if unparsed_5000:
        print("  sample:", unparsed_5000[:15])

    print(f"\nWrote {out_3000}")
    print(f"Wrote {out_5000}")


if __name__ == "__main__":
    main()
