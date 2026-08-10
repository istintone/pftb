#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""スポンサーの看板シートを1社ずつに切り出す。

    python tools/slice_banner.py <シート画像> <id> <id> <id> <id> [--rows=N] [--w=640]

id に `-` を渡すとその段は書き出さない。**段の数は割り付けどおりに数える必要がある**
(等分の位置がずれるため)ので、要らない段も数だけは埋める。
生成AIが頼んでいない会社を1段ぶん足してくることがある。

    src/assets/art/company/<シート>.png  ← 素材(埋め込まれない)
         ↓
    src/assets/banner/<id>.webp          ← 書き出し(自動生成。手で触らない)

依頼書は src/assets/design/sponsor-banner-prompt.md。**1シートに4社ぶんを縦に並べて**
描いてもらい、ここで縦に等分して切る。

生成AIはキャンバスサイズを守らない(1024指定で1408が来る)。そこで**受け取った画像を
縦N等分する**ことで正規化する。守ってもらうのはサイズではなく「N段に割り付けること」。

看板は**矩形の広告そのもの**なので、選手の立ち絵と違って背景を抜かない。
代わりに、段の境目に残りがちな縁を少しだけ内側へ詰める。

**左端の添え書きを自動で落とす。** 生成AIは頼んでいない注記(「y: 0-160」のような
段の座標)を左の余白に描いてくることがある。段ごとの色を比べて、**4段とも同じ色の列**が
続くあいだは中身ではないと判断して切り落とす(実測36px)。

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
INSET = 0.012         # 段の上下を詰める割合(境目の線と滲みを落とす)
GUT = 40              # 添え書きとみなす色差。これ未満なら「4段とも同じ色」
GUT_MAX = 0.14        # 添え書きを探す範囲(左右それぞれ画像の何割まで)


def trim_gutter(im, rows):
    """**段の中身が始まる位置**まで左右を詰める。

    4段はそれぞれ違う色で塗られているので、**段をまたいで色が変わらない列**は
    看板の中身ではない(黒い余白と、そこに描かれた添え書き)。横方向は文字が
    端まで来ていることがあるので、**中身に入ったら即やめる**。"""
    import statistics
    W, H = im.size
    px = im.load()

    def med(x, i):
        vals = [px[x, int(H * (i + f) / rows)]
                for f in (0.10, 0.18, 0.26, 0.34, 0.50, 0.66, 0.74, 0.82, 0.90)]
        return tuple(statistics.median(v[k] for v in vals) for k in range(3))

    def same(x):
        m = [med(x, i) for i in range(rows)]
        return max(max(abs(a[k] - b[k]) for k in range(3)) for a in m for b in m) < GUT

    l = 0
    while l < W * GUT_MAX and same(l):
        l += 1
    r = W - 1
    while r > W * (1 - GUT_MAX) and same(r):
        r -= 1
    return l, r


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
    W0, H = sheet.size
    l, r = trim_gutter(sheet, rows)
    if l or r < W0 - 1:
        sheet = sheet.crop((l, 0, r + 1, H))
        print("添え書きを落とした: 左%dpx / 右%dpx" % (l, W0 - 1 - r))
    W = sheet.size[0]
    bh = H / rows
    print("入力: %s  %dx%d  → %d段 / 1段 %dx%d" % (src.name, W0, H, rows, W, round(bh)))

    total = 0
    for i, sid in enumerate(ids):
        if sid == "-":                            # 使わない段(数だけ埋めてある)
            print("  %-10s   (書き出さない)" % "-")
            continue
        # **上下だけ詰める**。等分の切れ目には隣の段の色が1〜2px残る。
        # 左右は詰めない(社名が端まで来ている看板があり、削ると文字が欠ける)
        dy = int(bh * INSET)
        box = (0, int(round(i * bh)) + dy, W, int(round((i + 1) * bh)) - dy)
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
