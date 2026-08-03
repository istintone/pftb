#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""選手イラストの3枚セットを切り出して、透過・正規化した素材にする。

    python tools/slice_player.py <シート画像> <選手id> [--out <ディレクトリ>]

生成AIはキャンバスサイズを指定どおりに出してくれない(1260x500 と頼んでも 1648x640 が来る)。
そこで**受け取った画像を3等分し、各セルを固定サイズへ揃える**ことで正規化する。
依頼書(src/assets/design/player-art-prompt.md)で足元と頭の大きさを揃えてもらってあるので、
セル単位で拡縮すれば選手同士の背丈も揃う。

白背景の抜き方に注意: 単純に「白を消す」と**白いユニフォームやソックスに穴が開く**。
画像の縁から届く白だけを塗りつぶす(フラッドフィル)ことで、内側の白は残す。
"""
import sys
import pathlib
from collections import deque

try:
    from PIL import Image
except ImportError:
    sys.exit("Pillow が必要です: pip install Pillow")

CELLS = ["stand", "play", "goal"]     # ①立ち絵 ②プレイ絵 ③ゴールモーション
OUT_W, OUT_H = 420, 500               # 1枚あたりの出力サイズ(依頼書と同じ)
BG_TH = 238                           # これ以上明るい画素を背景候補とみなす


def keyout_white(img):
    """縁から連結している白だけを透過にする(内側の白は残す)。"""
    img = img.convert("RGBA")
    w, h = img.size
    px = img.load()

    def is_bg(x, y):
        r, g, b, a = px[x, y]
        return a > 0 and r >= BG_TH and g >= BG_TH and b >= BG_TH

    seen = bytearray(w * h)
    q = deque()
    for x in range(w):
        for y in (0, h - 1):
            if is_bg(x, y) and not seen[y * w + x]:
                seen[y * w + x] = 1
                q.append((x, y))
    for y in range(h):
        for x in (0, w - 1):
            if is_bg(x, y) and not seen[y * w + x]:
                seen[y * w + x] = 1
                q.append((x, y))

    while q:
        x, y = q.popleft()
        px[x, y] = (255, 255, 255, 0)
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nx, ny = x + dx, y + dy
            if 0 <= nx < w and 0 <= ny < h and not seen[ny * w + nx] and is_bg(nx, ny):
                seen[ny * w + nx] = 1
                q.append((nx, ny))
    return img


def keyout_pockets(img, min_area=400, pure_ratio=0.60):
    """縁から届かない「囲まれた背景」も抜く。
    脚とボールに囲まれた白などは縁フィルでは残ってしまう。
    背景は**べたの純白**、ユニフォームの白は陰影があるので、
    連結成分の純白率(>=252)で見分けられる(実測: 背景88% / 服16%)。"""
    w, h = img.size
    px = img.load()
    done = bytearray(w * h)
    removed = 0
    for sy in range(h):
        for sx in range(w):
            i = sy * w + sx
            r, g, b, a = px[sx, sy]
            if done[i] or a == 0 or not (r >= BG_TH and g >= BG_TH and b >= BG_TH):
                continue
            cells = []
            q = deque([(sx, sy)])
            done[i] = 1
            while q:
                x, y = q.popleft()
                cells.append((x, y))
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    nx, ny = x + dx, y + dy
                    if 0 <= nx < w and 0 <= ny < h:
                        j = ny * w + nx
                        if not done[j]:
                            rr, gg, bb, aa = px[nx, ny]
                            if aa > 0 and rr >= BG_TH and gg >= BG_TH and bb >= BG_TH:
                                done[j] = 1
                                q.append((nx, ny))
            if len(cells) < min_area:
                continue
            pure = sum(1 for (x, y) in cells if all(v >= 252 for v in px[x, y][:3]))
            if pure / len(cells) >= pure_ratio:
                for (x, y) in cells:
                    px[x, y] = (255, 255, 255, 0)
                removed += len(cells)
    return img, removed


def resize_rgba(img, w, h):
    """**アルファを掛けてから縮小する**(プリマルチプライ)。

    透明にした画素のRGBは白のまま残っている。そのまま縮小すると、縁の画素が
    「選手の色 × 白」で混ざり、切り抜きのまわりに**白いジャギー**が出る。
    先にRGBへアルファを掛け、縮小してから割り戻すと、透明側の白が混ざらない。
    """
    from PIL import ImageChops, ImageMath
    r, g, b, a = img.split()
    pre = [ImageChops.multiply(c, a).resize((w, h), Image.LANCZOS) for c in (r, g, b)]
    a2 = a.resize((w, h), Image.LANCZOS)
    # ImageMath の min/max は画像同士の演算。定数と比べたいので float 側を先に書く
    out = [ImageMath.unsafe_eval(
        "convert(float(c) * 255.0 / float(al + 1), 'L')", c=c, al=a2) for c in pre]
    return Image.merge("RGBA", (out[0], out[1], out[2], a2))


def defringe(img, hi=252, lo=140):
    """切り抜きの縁に残る**白いジャギー**を消す。

    元絵の背景は純白で、選手との境目は**1画素だけ**中間色になっている(実測 253→198→15)。
    白抜きは 238 以上しか消さないので、この198の画素が不透明のまま残り、
    暗い地のカードに載せたときに白い縁取りとして浮く。

    背景と隣り合う画素だけを対象に、**明るさからアルファを引き直す**。
    さらに「白と混ざったぶん」を差し引いて元の色に戻す(アンマット)。
    これをやらないと、半透明にしただけでは白っぽさが残る。
    """
    px = img.load()
    w, h = img.size
    edge = []
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a < 250:
                continue
            lum = (r + g + b) / 3.0
            if lum < lo:                       # 輪郭線などの濃い画素はそのまま
                continue
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                nx, ny = x + dx, y + dy
                if 0 <= nx < w and 0 <= ny < h and px[nx, ny][3] < 60:
                    edge.append((x, y, r, g, b, lum))
                    break
    for x, y, r, g, b, lum in edge:
        cover = max(0.0, min(1.0, (hi - lum) / float(hi - lo)))   # どれだけ選手の色か
        if cover <= 0.02:
            px[x, y] = (r, g, b, 0)
            continue
        # 白の上に cover の濃さで乗っていたと見なして、元の色を取り戻す
        un = lambda c: int(max(0, min(255, (c - (1 - cover) * 255) / cover)))
        px[x, y] = (un(r), un(g), un(b), int(round(255 * cover)))
    return img, len(edge)


def content_box(img):
    """不透明な画素の範囲。切り出しの検証に使う(切り詰めはしない)。"""
    a = img.getchannel("A")
    return a.getbbox()


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    if len(args) < 2:
        sys.exit(__doc__)
    src, pid = pathlib.Path(args[0]), args[1]
    outdir = pathlib.Path(next((a.split("=", 1)[1] for a in sys.argv if a.startswith("--out=")),
                               "src/assets/players"))
    outdir.mkdir(parents=True, exist_ok=True)

    sheet = Image.open(src).convert("RGBA")
    W, H = sheet.size
    cw = W // len(CELLS)
    print("入力: %s  %dx%d  → 1セル %dx%d" % (src.name, W, H, cw, H))

    for i, name in enumerate(CELLS):
        cell = sheet.crop((i * cw, 0, (i + 1) * cw, H))
        cell = keyout_white(cell)
        if "--keep-pockets" not in sys.argv:
            cell, gone = keyout_pockets(cell)
        else:
            gone = 0
        box = content_box(cell)
        if not box:
            print("  ⚠ セル%d(%s) が空です" % (i + 1, name))
            continue
        # セルごと固定サイズへ。中身は切り詰めない(3枚の相対位置を保つため)
        cell, _ = defringe(cell)
        out = resize_rgba(cell, OUT_W, OUT_H)
        path = outdir / ("%s_%s.webp" % (pid, name))
        out.save(path, "WEBP", quality=90, method=6)
        cx = (box[0] + box[2]) // 2
        print("  %-5s → %s  (%5.1f KB)  中身: 中心x=%d/%d 高さ=%d  囲まれた背景を除去 %dpx"
              % (name, path.name, path.stat().st_size / 1024, cx, cw, box[3] - box[1], gone))

    print("\n※ 白い部分に穴が開いていないか、必ず拡大して確認すること"
          "(縁から連結した白だけを抜いているが、髪や肌の縁は要確認)")


if __name__ == "__main__":
    main()
