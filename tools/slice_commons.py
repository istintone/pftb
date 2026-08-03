#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""汎用選手カードの絵(commons)をまとめて切り出す。

    python tools/slice_commons.py [--force] [--dry]

src/assets/players/commons/ に置かれた3枚組シート(立ち絵 / プレイ絵 / ゴール)を
1枚ずつ切り出し、透過して src/assets/players/ へ webp で書き出す。
処理そのものは slice_player.py と同じ(あちらを import している)。

**IDは元ファイル名のハッシュから作る。** 連番にすると、あとからファイルを足したときに
既存のIDがずれ、保存済みカードの絵が入れ替わってしまう(art はセーブに載る)。

    fp3a9c21_play.webp   ← フィールドプレイヤー
    gk8b12ef_stand.webp  ← GK(commons/gk/ に置かれたもの)

先頭2文字が gk / fp なので、**実行時に ASSETS のキーだけを見て振り分けられる**。
そのため生成物のリストをコードに持つ必要がない(→docs/03 §3.19)。

商標(→docs/03 §3.13): 実在のスポンサー名やエンブレムが読み取れる絵は使わない。
SKIP に元ファイル名を書いておくと、その絵はプールから外れる。
"""
import hashlib
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from slice_player import (CELLS, OUT_W, OUT_H, keyout_white, keyout_pockets,
                          content_box, defringe, resize_rgba)

try:
    from PIL import Image
except ImportError:
    sys.exit("Pillow が必要です: pip install Pillow")

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / "src/assets/players/commons"
OUT = ROOT / "src/assets/players"

# 実在のスポンサー名がはっきり読める絵。**商標方針に反するので使わない**(→docs/03 §3.13)。
# 描き直したものに差し替えたら、この行を消せばそのままプールに戻る。
SKIP = {
    "Gemini_Generated_Image_ufhnm5ufhnm5ufhn (1).png",   # 胸に実在スポンサーの文字
    "Gemini_Generated_Image_x4lceux4lceux4lc.png",       # 同上
}

QUALITY = 82          # カード上では 120〜200px なので、署名カードより軽くしてよい


def art_id(path):
    """元ファイル名から決まるID。**ファイルが増えても既存のIDは動かない**。"""
    kind = "gk" if path.parent.name == "gk" else "fp"
    return kind + hashlib.sha1(path.name.encode("utf-8")).hexdigest()[:6]


def main():
    force = "--force" in sys.argv
    dry = "--dry" in sys.argv
    if not SRC.is_dir():
        sys.exit("見つかりません: %s" % SRC)
    sheets = sorted(p for p in SRC.rglob("*.png") if p.is_file())
    if not sheets:
        sys.exit("シートが1枚もありません: %s" % SRC)

    OUT.mkdir(parents=True, exist_ok=True)
    made = skipped = kept = 0
    total = 0
    for sheet_path in sheets:
        if sheet_path.name in SKIP:
            print("skip  %s  (商標のため除外)" % sheet_path.name[:44])
            skipped += 1
            continue
        pid = art_id(sheet_path)
        paths = [OUT / ("%s_%s.webp" % (pid, n)) for n in CELLS]
        if all(p.exists() for p in paths) and not force:
            kept += 1
            total += sum(p.stat().st_size for p in paths)
            continue
        if dry:
            print("would %s  ← %s" % (pid, sheet_path.name[:44]))
            made += 1
            continue

        sheet = Image.open(sheet_path).convert("RGBA")
        W, H = sheet.size
        cw = W // len(CELLS)
        # シートのコマ境界には**灰色の仕切り線**が引かれている(実測 4px / RGB≒163)。
        # 白ではないので抜き取りをすり抜け、カードの左端に縦線として残る。
        # コマの内側を少し削って落とす。
        inset = max(2, int(cw * 0.014))
        sizes = []
        for i, name in enumerate(CELLS):
            cell = keyout_white(sheet.crop((i * cw + inset, 0, (i + 1) * cw - inset, H)))
            cell, _ = keyout_pockets(cell)
            if not content_box(cell):
                print("  ⚠ %s のセル%d が空です" % (sheet_path.name, i + 1))
                continue
            # 切り抜きの縁に出る白いジャギーを抑える(→slice_player.py)
            cell, _ = defringe(cell)
            out = resize_rgba(cell, OUT_W, OUT_H)
            path = OUT / ("%s_%s.webp" % (pid, name))
            out.save(path, "WEBP", quality=QUALITY, method=6)
            sizes.append(path.stat().st_size)
        total += sum(sizes)
        made += 1
        print("%s  ← %-44s  %s" % (pid, sheet_path.name[:44],
                                   " / ".join("%.0fKB" % (s / 1024) for s in sizes)))

    print("\n新規 %d 枚 / 既存のまま %d 枚 / 除外 %d 枚 / 合計 %.1f MB"
          % (made, kept, skipped, total / 1024 / 1024))
    if not dry:
        print("※ このあと python build.py で index.html に埋め込む")


if __name__ == "__main__":
    main()
