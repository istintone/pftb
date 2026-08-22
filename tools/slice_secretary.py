#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""秘書の立ち絵シートを1人ずつ切り出す。

    python tools/slice_secretary.py [--dry] [--rows=N]

素材は 1枚のシートに複数人が並んでいる。**アルファの切れ目で人を分ける**ので、
人数や並びが変わっても同じ手順で通る(段は上から順に数える)。

**既定では上段だけ**を書き出す(`--rows=N` で増やせる)。使わない絵まで
書き出すと、そのぶん index.html に埋め込まれて重くなるだけなので。

    src/assets/art/secretary/*.png   ← 素材(埋め込まれない)
         ↓
    src/assets/secretary/sec01.webp …  ← 書き出し(自動生成。手で触らない)

**選手の立ち絵と同じ 420×500 の枠に、同じ位置で入れる**(→docs/11 §6.23)。
チャットの丸は「図の上から約38%」を切り出す前提で組んであるので、枠が違うと
顔の位置がずれる。頭の上端を 6%、足元を 97.5% に合わせると選手と揃う。
"""
import pathlib
import sys

try:
    from PIL import Image
except ImportError:
    sys.exit("Pillow が必要です: pip install Pillow")

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from slice_player import OUT_W, OUT_H, resize_rgba

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / "src/assets/art/secretary"
OUT = ROOT / "src/assets/secretary"
TOP, BOTTOM = 0.060, 0.975      # 選手の立ち絵の実測(頭の上端 / 足元)
ROWS = 1                        # 既定で書き出す段の数(上から)
MIN_W, MIN_H = 40, 120          # これ未満の塊は人ではない(ゴミ)
QUALITY = 86


def runs_of(flags):
    """True が続く区間を返す。"""
    out, cur = [], None
    for i, v in enumerate(flags):
        if v and cur is None:
            cur = i
        elif not v and cur is not None:
            out.append((cur, i - 1)); cur = None
    if cur is not None:
        out.append((cur, len(flags) - 1))
    return out


def figures(sheet, rows_max):
    """シートから人物の矩形を上の段から順に返す(段は rows_max まで)。"""
    a = sheet.getchannel("A")
    W, H = sheet.size
    px = a.load()
    rows = [any(px[x, y] > 16 for x in range(W)) for y in range(H)]
    out, seen = [], 0
    for y0, y1 in runs_of(rows):
        if y1 - y0 + 1 < MIN_H:
            continue
        seen += 1
        if seen > rows_max:
            break
        band = sheet.crop((0, y0, W, y1 + 1))
        bp = band.getchannel("A").load()
        cols = [any(bp[x, y] > 16 for y in range(band.height)) for x in range(W)]
        for x0, x1 in runs_of(cols):
            if x1 - x0 + 1 < MIN_W:
                continue
            box = band.crop((x0, 0, x1 + 1, band.height))
            bb = box.getchannel("A").getbbox()
            if not bb:
                continue
            out.append(box.crop(bb))
    return out


def place(fig):
    """選手の立ち絵と同じ枠・同じ位置に収める。"""
    band = int(round(OUT_H * (BOTTOM - TOP)))
    w = max(1, int(round(fig.width * band / fig.height)))
    small = resize_rgba(fig, min(w, OUT_W), band)
    out = Image.new("RGBA", (OUT_W, OUT_H), (0, 0, 0, 0))
    out.paste(small, ((OUT_W - small.width) // 2, int(round(OUT_H * TOP))), small)
    return out


def main():
    dry = "--dry" in sys.argv
    rows_max = next((int(a.split("=", 1)[1]) for a in sys.argv if a.startswith("--rows=")), ROWS)
    sheets = sorted(SRC.glob("*.png"))
    if not sheets:
        sys.exit("シートがありません: %s" % SRC)
    OUT.mkdir(parents=True, exist_ok=True)
    n = 0
    for sheet_path in sheets:
        sheet = Image.open(sheet_path).convert("RGBA")
        figs = figures(sheet, rows_max)
        print("%s  上から%d段 → %d人" % (sheet_path.name, rows_max, len(figs)))
        for fig in figs:
            n += 1
            name = "sec%02d" % n
            if dry:
                print("  would %s  (元 %dx%d)" % (name, fig.width, fig.height))
                continue
            path = OUT / (name + ".webp")
            place(fig).save(path, "WEBP", quality=QUALITY, method=6)
            print("  %-6s → %-12s %5.1f KB  (元 %dx%d)"
                  % (name, path.name, path.stat().st_size / 1024, fig.width, fig.height))
    # 素材から消えた人が残らないようにする
    alive = {"sec%02d" % i for i in range(1, n + 1)}
    stale = [p for p in OUT.glob("*.webp") if p.stem not in alive]
    for p in stale:
        if not dry:
            p.unlink()
    if stale:
        print("古い書き出しを %d 枚削除した" % len(stale))
    if not dry:
        print("\n※ このあと python build.py で index.html に埋め込む")


if __name__ == "__main__":
    main()
