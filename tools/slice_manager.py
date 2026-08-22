#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""監督の立ち絵シートを1人ずつ切り出す。

    python tools/slice_manager.py [--dry] [--rows=N] [--all]

    src/assets/art/manager/*.png     ← 素材(埋め込まれない)
         ↓
    src/assets/manager/mg01a.webp …  ← 書き出し(自動生成。手で触らない)

秘書(→tools/slice_secretary.py)とまったく同じ切り方・同じ枠に収める。
チャットの丸は「図の上から約38%」を切り出す前提なので、枠が違うと顔の位置がずれる。

**名前はシート名＋並び順**(mg01a, mg01b, …)。秘書のような通し番号にすると、
シートを1枚足しただけで番号がずれて、監督の顔が別人に入れ替わる
(ステッカーで踏んだ失敗 →docs/11 §6.29)。

`mob` で始まるシートは**既定では書き出さない**。相手監督に使う予定の汎用の絵で、
いま出す先が無いのに埋め込むと index.html が重くなるだけ(`--all` で書き出せる)。
"""
import pathlib
import sys

try:
    from PIL import Image
except ImportError:
    sys.exit("Pillow が必要です: pip install Pillow")

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from slice_secretary import figures, place

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / "src/assets/art/manager"
OUT = ROOT / "src/assets/manager"
ROWS = 2                        # 既定で書き出す段の数(上から)
QUALITY = 86
LETTERS = "abcdefghijklmnop"


def main():
    dry = "--dry" in sys.argv
    every = "--all" in sys.argv
    rows_max = next((int(a.split("=", 1)[1]) for a in sys.argv if a.startswith("--rows=")), ROWS)
    sheets = sorted(SRC.glob("*.png"))
    if not sheets:
        sys.exit("シートがありません: %s" % SRC)
    OUT.mkdir(parents=True, exist_ok=True)

    alive, total = set(), 0
    for sheet_path in sheets:
        # 「mg01_managers.png」→「mg01」。**この名前がそのまま引き当てキーになる**
        stem = sheet_path.stem.split("_")[0]
        if stem.startswith("mob") and not every:
            print("skip  %s  (相手監督用。--all で書き出す)" % sheet_path.name)
            continue
        sheet = Image.open(sheet_path).convert("RGBA")
        figs = figures(sheet, rows_max)
        print("%s  上から%d段 → %d人" % (sheet_path.name, rows_max, len(figs)))
        for i, fig in enumerate(figs):
            if i >= len(LETTERS):
                print("  ⚠ %d人目からは名前が足りない" % (i + 1))
                break
            name = stem + LETTERS[i]
            alive.add(name)
            if dry:
                print("  would %s  (元 %dx%d)" % (name, fig.width, fig.height))
                continue
            path = OUT / (name + ".webp")
            place(fig).save(path, "WEBP", quality=QUALITY, method=6)
            total += path.stat().st_size
            print("  %-8s → %-12s %5.1f KB  (元 %dx%d)"
                  % (name, path.name, path.stat().st_size / 1024, fig.width, fig.height))

    stale = [p for p in OUT.glob("*.webp") if p.stem not in alive]
    if stale and not dry:
        for p in stale:
            p.unlink()
        print("素材の無い書き出しを %d 枚削除した" % len(stale))
    if not dry:
        print("\n合計 %.0f KB ／ ※ このあと python build.py で埋め込む" % (total / 1024))


if __name__ == "__main__":
    main()
