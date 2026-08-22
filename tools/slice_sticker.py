#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""ステッカーの素材を1枚ずつ切り抜いて、軽い透過画像にする。

    python tools/slice_sticker.py [--dry] [--w=220]

    src/assets/art/sticker/*.png   ← 素材(白背景の大きな画像。埋め込まれない)
         ↓
    src/assets/sticker/scout.webp … ← 書き出し(自動生成。手で触らない)

**書き出し名は素材のファイル名がそのまま**。`ASSETS.sticker["scout"]` で引ける。
タイトルの壁は全部を混ぜて使うが、**HOME の飾りは絵を名指しで使う**(→docs/11 §6.30)ので、
通し番号で振ると素材を1枚足しただけで絵が入れ替わってしまう。
素材の名前は中身が分かるものにして、**一度決めたら変えない**。

**白い縁はステッカーの一部**なので、単純に白を消してはいけない。
画像の縁から届く白だけをフラッドフィルで抜き、内側の白(ダイカットの縁)は残す
(選手の立ち絵と同じ考え方 → tools/slice_player.py)。

素材は 688×1529 に対してステッカーが小さく写っている。**中身の矩形まで詰めてから**
指定幅へ縮める。タイトルの背景に敷き詰めるだけなので、幅220pxもあれば足りる
(元のまま埋め込むと1枚1MB、8枚で index.html が10MB増える)。
"""
import pathlib
import sys

try:
    from PIL import Image
except ImportError:
    sys.exit("Pillow が必要です: pip install Pillow")

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from slice_player import keyout_white, content_box, defringe, resize_rgba

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / "src/assets/art/sticker"
OUT = ROOT / "src/assets/sticker"
WIDTH = 220           # 書き出しの幅。敷き詰める用なので小さくてよい
QUALITY = 78
SHADOW = 246          # これ未満の灰色は落ち影。縁を削って取り除く


def peel_shadow(img, lo=196):
    """切り抜きの外側に残る**落ち影**を、外から1枚ずつ剥がす。

    素材はステッカーの下にうっすら影が敷かれている。白抜き(縁からのフラッドフィル)は
    影の手前で止まるので、灰色のもやが縁に残る。

    **画像全体から灰色を消してはいけない。** ステッカーの絵そのものが鉛筆画の灰色で、
    白いダイカットの縁にも陰影がある。全部消すと**縁が丸ごと落ちて絵も溶ける**
    (実際にそうなった)。透明な側に接している画素だけを、外から順に剥がす。
    """
    px = img.load()
    w, h = img.size
    from collections import deque
    q = deque()
    seen = bytearray(w * h)

    def shadowish(x, y):
        r, g, b, a = px[x, y]
        if a == 0:
            return False
        # 影は「色味の無い灰色」。白い縁(>=SHADOW)は触らない
        return max(r, g, b) - min(r, g, b) <= 8 and lo <= max(r, g, b) < SHADOW

    for y in range(h):
        for x in range(w):
            if px[x, y][3] != 0:
                continue
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                nx, ny = x + dx, y + dy
                if 0 <= nx < w and 0 <= ny < h and not seen[ny * w + nx] and shadowish(nx, ny):
                    seen[ny * w + nx] = 1
                    q.append((nx, ny))
    gone = 0
    while q:
        x, y = q.popleft()
        px[x, y] = (255, 255, 255, 0)
        gone += 1
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nx, ny = x + dx, y + dy
            if 0 <= nx < w and 0 <= ny < h and not seen[ny * w + nx] and shadowish(nx, ny):
                seen[ny * w + nx] = 1
                q.append((nx, ny))
    return img, gone


def drop_specks(img, min_ratio=0.02):
    """**離れた小さな塊を捨てる。** 素材には遠くに薄い汚れが残っていることがあり、
    そのままだと切り出しの枠が広がって、ステッカーが小さく写る。"""
    px = img.load()
    w, h = img.size
    from collections import deque
    seen = bytearray(w * h)
    blobs = []
    for sy in range(h):
        for sx in range(w):
            i = sy * w + sx
            if seen[i] or px[sx, sy][3] == 0:
                continue
            cells = []
            q = deque([(sx, sy)])
            seen[i] = 1
            while q:
                x, y = q.popleft()
                cells.append((x, y))
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    nx, ny = x + dx, y + dy
                    j = ny * w + nx
                    if 0 <= nx < w and 0 <= ny < h and not seen[j] and px[nx, ny][3] != 0:
                        seen[j] = 1
                        q.append((nx, ny))
            blobs.append(cells)
    if not blobs:
        return img, 0
    big = max(len(b) for b in blobs)
    gone = 0
    for cells in blobs:
        if len(cells) >= big * min_ratio:
            continue
        for (x, y) in cells:
            px[x, y] = (255, 255, 255, 0)
        gone += len(cells)
    return img, gone


def main():
    dry = "--dry" in sys.argv
    width = next((int(a.split("=", 1)[1]) for a in sys.argv if a.startswith("--w=")), WIDTH)
    srcs = sorted(SRC.glob("*.png"))
    if not srcs:
        sys.exit("素材がありません: %s" % SRC)
    OUT.mkdir(parents=True, exist_ok=True)
    total = 0
    alive = set()
    for path in srcs:
        # **ファイル名がそのままキー**。名指しで使うので通し番号にはしない
        name = path.stem
        if not name.isascii() or " " in name:
            print("  ⚠ %s は名前に使えない文字がある(英数字とハイフンだけ)" % path.name)
            continue
        alive.add(name)
        if dry:
            print("would %s ← %s" % (name, path.name[:40]))
            continue
        im = Image.open(path).convert("RGBA")
        im = keyout_white(im)
        im, gone = peel_shadow(im)
        im, specks = drop_specks(im)
        box = content_box(im)
        if not box:
            print("  ⚠ %s は空です" % path.name)
            continue
        im = im.crop(box)
        im, _ = defringe(im)
        h = max(1, int(round(im.height * width / im.width)))
        out = resize_rgba(im, width, h)
        dst = OUT / (name + ".webp")
        out.save(dst, "WEBP", quality=QUALITY, method=6)
        total += dst.stat().st_size
        print("%-10s ← %-24s %4dx%-4d %5.1f KB  影 %d / 汚れ %d px"
              % (name, path.name[:24], width, h, dst.stat().st_size / 1024, gone, specks))
    stale = [p for p in OUT.glob("*.webp") if p.stem not in alive]
    for p in stale:
        if not dry:
            p.unlink()
    if stale:
        print("古い書き出しを %d 枚削除した" % len(stale))
    if not dry:
        print("\n合計 %.0f KB ／ ※ このあと python build.py で埋め込む" % (total / 1024))


if __name__ == "__main__":
    main()
