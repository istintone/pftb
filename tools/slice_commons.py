#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""選手イラストの素材をまとめて切り出す。

    python tools/slice_commons.py [--force] [--dry] [--prune]

素材は**レアリティとポジションのフォルダ**に置く(→docs/03 §3.19)。

    src/assets/art/                              ← 素材(埋め込まれない)
      commons/<レアリティ>/<ポジション>/*.png      汎用選手
      signature/<レアリティ>/<ポジション>/*.png    WORLD CLASS / LEGENDS

書き出し先は**素材の種別で分ける**。混ざると手で足した絵が自動生成に埋もれる。

    src/assets/players/   ← commons の書き出し(自動生成。手で触らない)
    src/assets/sig/       ← signature の書き出し(自動生成。手で触らない)

      レアリティ … std / reg / spe / wc / leg / any
      ポジション … gk / df / mf / fw / out

`any` は「どの段にも使える」、`out` は「外野なら誰でもいい」の意味。
**GK は必ず gk に入れる。** GKだけは絵が明確に違うので、他と混ぜてはいけない。
いま置いてある汎用の絵は段を選ばないので `any/gk` と `any/out` に入っている。
段やポジション専用の絵を足したくなったら、その名前のフォルダへ入れるだけでよい。

書き出し名はそのまま**引き当てのキー**になる。

    players/any-gk-e5bde2_play.webp     ← 汎用(どの段でも / GK)
    players/reg-fw-1a2b3c_stand.webp    ← REGULAR のFW専用
    sig/le_omf01_zidane_play.webp       ← 署名カードはファイル名がそのままID

実行時は ASSETS のキーを見るだけで振り分けられるので、**絵を足しても JS は触らない**。

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
ART = ROOT / "src/assets/art"                 # 素材(埋め込まれない)
# 書き出し先。**素材の種別ごとに分ける**(→docs/03 §3.19)
OUT = { "commons": ROOT / "src/assets/players",
        "signature": ROOT / "src/assets/sig" }
GROUPS = tuple(OUT)
RARITIES = {"std", "reg", "spe", "wc", "leg", "any"}
POSITIONS = {"gk", "df", "mf", "fw", "out"}

# 実在のスポンサー名がはっきり読める絵。**商標方針に反するので使わない**(→docs/03 §3.13)。
# 描き直したものに差し替えたら、この行を消せばそのままプールに戻る。
SKIP = {
    "Gemini_Generated_Image_ufhnm5ufhnm5ufhn (1).png",   # 胸に実在スポンサーの文字
    "Gemini_Generated_Image_x4lceux4lceux4lc.png",       # 同上
}

QUALITY = 82          # カード上では 120〜200px なので、署名カードより軽くしてよい


def slot_of(path):
    """<種別>/<レアリティ>/<ポジション>/ の3階層から、書き出しIDを決める。"""
    rel = path.relative_to(ART).parts
    if len(rel) < 4:
        return None, "フォルダが浅い(<種別>/<レアリティ>/<ポジション>/ に置く)"
    kind, rar, pos = rel[0], rel[1], rel[2]
    if kind not in OUT:
        return None, "知らない種別: " + kind
    if rar not in RARITIES:
        return None, "知らないレアリティ: " + rar
    if pos not in POSITIONS:
        return None, "知らないポジション: " + pos
    # 署名カードは1人ずつ手で定義するので、**ファイル名がそのままID**
    if kind == "signature":
        return path.stem, None
    # 汎用は元ファイル名のハッシュ。**同じフォルダに居る限りIDは動かない**
    return "%s-%s-%s" % (rar, pos, hashlib.sha1(path.name.encode("utf-8")).hexdigest()[:6]), None


def out_dir(path):
    """その素材の書き出し先。"""
    return OUT[path.relative_to(ART).parts[0]]


def main():
    force = "--force" in sys.argv
    dry = "--dry" in sys.argv
    sheets = sorted(p for g in GROUPS for p in (ART / g).rglob("*.png") if p.is_file())
    if not sheets:
        sys.exit("シートが1枚もありません: %s" % ART)
    for d in OUT.values():
        d.mkdir(parents=True, exist_ok=True)

    made = skipped = kept = 0
    total = 0
    alive = {g: set() for g in GROUPS}
    for sheet_path in sheets:
        if sheet_path.name in SKIP:
            print("skip  %s  (商標のため除外)" % sheet_path.name[:44])
            skipped += 1
            continue
        pid, err = slot_of(sheet_path)
        if err:
            print("skip  %s  (%s)" % (sheet_path.name[:36], err))
            skipped += 1
            continue
        alive[sheet_path.relative_to(ART).parts[0]].add(pid)
        dst = out_dir(sheet_path)
        paths = [dst / ("%s_%s.webp" % (pid, n)) for n in CELLS]
        if all(p.exists() for p in paths) and not force:
            kept += 1
            total += sum(p.stat().st_size for p in paths)
            continue
        if dry:
            print("would %-22s ← %s" % (pid, sheet_path.name[:40]))
            made += 1
            continue

        sheet = Image.open(sheet_path).convert("RGBA")
        W, H = sheet.size
        cw = W // len(CELLS)
        # シートのコマ境界には**灰色の仕切り線**が引かれている(実測 4px / RGB≒163)。
        # 白ではないので抜き取りをすり抜け、カードに縦線として残る。内側を少し削る。
        inset = max(2, int(cw * 0.014))
        sizes = []
        for i, name in enumerate(CELLS):
            cell = keyout_white(sheet.crop((i * cw + inset, 0, (i + 1) * cw - inset, H)))
            cell, _ = keyout_pockets(cell)
            if not content_box(cell):
                print("  ⚠ %s のセル%d が空です" % (sheet_path.name, i + 1))
                continue
            cell, _ = defringe(cell)          # 切り抜きの縁の白いジャギーを消す
            out = resize_rgba(cell, OUT_W, OUT_H)
            path = dst / ("%s_%s.webp" % (pid, name))
            out.save(path, "WEBP", quality=QUALITY, method=6)
            sizes.append(path.stat().st_size)
        total += sum(sizes)
        made += 1
        print("%-22s ← %-40s  %s" % (pid, sheet_path.name[:40],
                                     " / ".join("%.0fKB" % (s / 1024) for s in sizes)))

    # 素材が消えた / 別のフォルダへ移ったときに、古い書き出しが残ると
    # プールに幽霊が混ざる。--prune で掃除する。
    stale = sorted(p for g in GROUPS for p in OUT[g].glob("*.webp")
                   if p.stem.rsplit("_", 1)[0] not in alive[g])
    if stale:
        if "--prune" in sys.argv and not dry:
            for p in stale:
                p.unlink()
            print("古い書き出しを %d 枚削除した" % len(stale))
        else:
            print("⚠ 素材の無い書き出しが %d 枚ある(--prune で削除): %s ..."
                  % (len(stale), stale[0].name))

    print("\n新規 %d 枚 / 既存のまま %d 枚 / 除外 %d 枚 / 合計 %.1f MB"
          % (made, kept, skipped, total / 1024 / 1024))
    if not dry:
        print("※ このあと python build.py で index.html に埋め込む")


if __name__ == "__main__":
    main()
