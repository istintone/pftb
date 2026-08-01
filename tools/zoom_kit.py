#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""選手イラストのユニフォーム部分を拡大して並べる（実在ロゴの混入チェック用）。

    python tools/zoom_kit.py <シート画像> [--out=<出力先.png>]

生成AIは学習した実在の意匠を出しやすい。とくに
**スポンサー名だけ架空にして、クラブエンブレムを実在のまま残す**取りこぼしが起きる。
胸元とパンツの裾を等倍以上で並べ、目視でエンブレムを確認するためのツール。

見るところ:
  - 胸の中央（スポンサー名）
  - 右胸・左胸（クラブエンブレム）
  - パンツの裾（エンブレムが入りがち）
"""
import sys
import pathlib

try:
    from PIL import Image
except ImportError:
    sys.exit("Pillow が必要です: pip install Pillow")

ZOOM = 3


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    if not args:
        sys.exit(__doc__)
    src = pathlib.Path(args[0])
    out = next((a.split("=", 1)[1] for a in sys.argv if a.startswith("--out=")), None)
    out = pathlib.Path(out) if out else src.with_name(src.stem + "_kitcheck.png")

    im = Image.open(src).convert("RGB")
    W, H = im.size
    cw = W // 3

    # 各セルの中身の範囲を取り、上半身〜腰(縦 25%〜80%)を切り出す
    tiles = []
    for i in range(3):
        cell = im.crop((i * cw, 0, (i + 1) * cw, H))
        # 白でない範囲＝選手の位置
        g = cell.convert("L").point(lambda v: 0 if v >= 238 else 255)
        box = g.getbbox()
        if not box:
            continue
        x0, y0, x1, y1 = box
        h = y1 - y0
        crop = cell.crop((x0, y0 + int(h * 0.25), x1, y0 + int(h * 0.80)))
        tiles.append(crop.resize((crop.width * ZOOM, crop.height * ZOOM), Image.NEAREST))

    if not tiles:
        sys.exit("選手が見つかりませんでした")
    gap = 16
    wtot = sum(t.width for t in tiles) + gap * (len(tiles) + 1)
    htot = max(t.height for t in tiles) + gap * 2
    sheet = Image.new("RGB", (wtot, htot), (24, 26, 32))
    x = gap
    for t in tiles:
        sheet.paste(t, (x, gap))
        x += t.width + gap
    sheet.save(out)
    print("拡大画像を書き出しました:", out)
    print("胸の中央(スポンサー) / 右胸・左胸(エンブレム) / パンツの裾 を確認してください。")
    print("実在のクラブ紋章（動物・帆船・城・王冠などの具象的な組み合わせ）が残っていたら描き直しを依頼する。")


if __name__ == "__main__":
    main()
