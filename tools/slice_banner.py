#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""スポンサーの看板シートを1社ずつに切り出す。

    python tools/slice_banner.py <シート画像> <id> <id> <id> <id> [--rows=N] [--w=640]

    src/assets/art/banner/<シート>.png   ← 素材(埋め込まれない)
         ↓
    src/assets/banner/<id>.webp          ← 書き出し(自動生成。手で触らない)

依頼書は src/assets/design/sponsor-banner-prompt.md。**1シートに4社ぶんを縦に並べて**
描いてもらい、ここで縦に等分して切る。

生成AIはキャンバスサイズを守らない(1024指定で1408が来る)。そこで**受け取った画像を
縦N等分する**ことで正規化する。守ってもらうのはサイズではなく「N段に割り付けること」。

看板は**矩形の広告そのもの**なので、選手の立ち絵と違って背景を抜かない。
代わりに、段の境目に残りがちな縁を少しだけ内側へ詰める(依頼書で余白を空けてもらっている)。

id はスポンサーの id(→docs/03 §3.40)と同じにする。画面はこの名前で絵を引く。
"""
import pathlib
import sys

try:
    from PIL import Image
except ImportError:
    sys.exit("Pillow が必要です: pip install Pillow")

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "src/assets/banner"
WIDTH = 640           # 書き出しの幅。画面では 350〜390px なので倍もあれば足りる
QUALITY = 84
INSET = 0.012         # 段の上下左右を詰める割合(境目の線と滲みを落とす)


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    if len(args) < 2:
        sys.exit(__doc__)
    src, ids = pathlib.Path(args[0]), args[1:]
    rows = next((int(a.split("=", 1)[1]) for a in sys.argv if a.startswith("--rows=")), len(ids))
    width = next((int(a.split("=", 1)[1]) for a in sys.argv if a.startswith("--w=")), WIDTH)
    if rows != len(ids):
        sys.exit("段数(%d)と id の数(%d)が合いません" % (rows, len(ids)))
    if not src.exists():
        sys.exit("シートがありません: %s" % src)
    OUT.mkdir(parents=True, exist_ok=True)

    sheet = Image.open(src).convert("RGB")
    W, H = sheet.size
    bh = H / rows
    print("入力: %s  %dx%d  → %d段 / 1段 %dx%d" % (src.name, W, H, rows, W, round(bh)))

    total = 0
    for i, sid in enumerate(ids):
        # **段の内側を少し詰める**。等分の切れ目には隣の段の色が1〜2px残る
        dx, dy = int(W * INSET), int(bh * INSET)
        box = (dx, int(round(i * bh)) + dy, W - dx, int(round((i + 1) * bh)) - dy)
        cell = sheet.crop(box)
        h = max(1, int(round(cell.height * width / cell.width)))
        out = cell.resize((width, h), Image.LANCZOS)
        dst = OUT / (sid + ".webp")
        out.save(dst, "WEBP", quality=QUALITY, method=6)
        total += dst.stat().st_size
        print("  %-10s → %s  %dx%d  %5.1f KB"
              % (sid, dst.name, width, h, dst.stat().st_size / 1024))

    print("\n合計 %.0f KB ／ ※ 縮めて社名が読めるか必ず確認する(読めなければ描き直し)"
          % (total / 1024))
    print("※ このあと python build.py で index.html に埋め込む")


if __name__ == "__main__":
    main()
