# -*- coding: utf-8 -*-
"""
紋章の意匠をベクターに起こす(→docs/03 §3.54b)。

`src/assets/art/emblem/` に置いた**白いシルエットのシート**(4列×3行)を読み、
輪郭を追跡して `src/js/emblem-art.js` に SVG のパスとして書き出す。

**なぜ画像のまま貼らないか**
  エンブレムは形×柄×紋章×色相の組み合わせで作る(→docs/03 §3.54)。
  紋章はクラブの2色(ink/edge)で塗り分けるので、ラスタのまま貼ると色が乗らない。
  ベクターに起こせば既にある塗りの仕組みがそのまま効き、index.html も太らない。

**やっていること**
  1. しきい値で白黒に落とす
  2. マーチングスクエアで閉じた輪郭を全部拾う(穴も同じように拾える)
  3. Ramer-Douglas-Peucker で点を間引く
  4. 0..100 の枠に収まるよう正規化する
  穴は `fill-rule="evenodd"` に任せるので、輪郭の向きは気にしなくてよい。

使い方:
    python tools/slice_emblem.py
"""
import os, sys, math
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC  = os.path.join(ROOT, "src", "assets", "art", "emblem")
OUT  = os.path.join(ROOT, "src", "js", "emblem-art.js")

# シートの並び。**位置で名前が決まる**ので、シートを差し替えるときは並びを合わせる
NAMES = [
    ["horse",  "lion",    "eagle",  "helm"],
    ["dragon", "crown",   "fleur",  "tower"],
    ["cannon", "griffin", "wyvern", "athena"],
]

THRESH = 200      # これより明るい画素をシルエットとみなす
TOL    = 0.9      # 間引きの許容(元画素の単位)。上げると軽く、下げると忠実
BOX    = 70.0     # 0..100 の枠のうち実際に使う幅。**盾は上下と左右がすぼまる**ので、
                  # いっぱいに広げると角の意匠(王冠の十字・獅子の前脚)が外へ出る


def cells(im):
    """シートを 4 列 × 3 行に切る。**格子は等分**で取る。"""
    W, H = im.size
    rows, cols = len(NAMES), len(NAMES[0])
    for r in range(rows):
        for c in range(cols):
            x0 = int(round(W * c / cols)); x1 = int(round(W * (c + 1) / cols))
            y0 = int(round(H * r / rows)); y1 = int(round(H * (r + 1) / rows))
            yield NAMES[r][c], im.crop((x0, y0, x1, y1))


def mask_of(cell):
    """白黒の升目。**周りを1画素ぶん空ける**ので、縁に接した形でも輪郭が閉じる。"""
    g = cell.convert("L")
    w, h = g.size
    px = g.load()
    m = [[0] * (w + 2) for _ in range(h + 2)]
    for y in range(h):
        row = m[y + 1]
        for x in range(w):
            if px[x, y] >= THRESH:
                row[x + 1] = 1
    return m, w + 2, h + 2


# マーチングスクエアの分岐。**辺の中点どうしを結ぶ**ので、45度の斜めが自然に出る。
# 画素の角で折ると階段になり、間引いた後もギザギザが残る。
_T, _R, _B, _L = 0, 1, 2, 3
_SEG = {
    0:  [], 15: [],
    1:  [(_L, _B)], 2:  [(_B, _R)], 3:  [(_L, _R)],
    4:  [(_R, _T)], 6:  [(_B, _T)], 7:  [(_L, _T)],
    8:  [(_T, _L)], 9:  [(_T, _B)], 11: [(_T, _R)],
    12: [(_R, _L)], 13: [(_R, _B)], 14: [(_B, _L)],
    # 鞍点。**どちらに繋ぐかは決め打ち**で構わない(穴の判定は evenodd がやる)
    5:  [(_L, _T), (_R, _B)],
    10: [(_T, _R), (_B, _L)],
}


def contours(m, w, h):
    """閉じた輪郭を全部返す。座標は半画素単位を避けるため 2 倍の整数で持つ。"""
    def pt(kind, x, y):
        if kind == _T: return (2 * x + 1, 2 * y)
        if kind == _R: return (2 * x + 2, 2 * y + 1)
        if kind == _B: return (2 * x + 1, 2 * y + 2)
        return (2 * x, 2 * y + 1)

    nxt = {}
    for y in range(h - 1):
        for x in range(w - 1):
            case = (m[y][x] << 3) | (m[y][x + 1] << 2) | (m[y + 1][x + 1] << 1) | m[y + 1][x]
            for a, b in _SEG[case]:
                nxt.setdefault(pt(a, x, y), []).append(pt(b, x, y))

    loops = []
    while nxt:
        start = next(iter(nxt))
        loop = [start]
        cur = start
        while True:
            outs = nxt.get(cur)
            if not outs:
                break
            nx = outs.pop()
            if not outs:
                del nxt[cur]
            if nx == start:
                break
            loop.append(nx)
            cur = nx
        if len(loop) >= 6:
            loops.append([(p[0] / 2.0, p[1] / 2.0) for p in loop])
    return loops


def rdp(pts, tol):
    """Ramer-Douglas-Peucker。**閉じた輪郭は2つに割ってから**かける。"""
    def run(a, b):
        if b - a < 2:
            return [pts[a]]
        x0, y0 = pts[a]; x1, y1 = pts[b]
        dx, dy = x1 - x0, y1 - y0
        d2 = dx * dx + dy * dy
        worst, wi = -1.0, a
        for i in range(a + 1, b):
            px, py = pts[i]
            if d2 == 0:
                dist = math.hypot(px - x0, py - y0)
            else:
                t = max(0.0, min(1.0, ((px - x0) * dx + (py - y0) * dy) / d2))
                dist = math.hypot(px - (x0 + t * dx), py - (y0 + t * dy))
            if dist > worst:
                worst, wi = dist, i
        if worst <= tol:
            return [pts[a]]
        return run(a, wi) + run(wi, b)

    n = len(pts)
    if n < 4:
        return pts
    half = n // 2
    return run(0, half) + run(half, n - 1) + [pts[n - 1]]


def to_path(loops):
    """0..100 の枠に収めて `d` を組む。**縦横の比は変えない**。"""
    xs = [p[0] for lp in loops for p in lp]
    ys = [p[1] for lp in loops for p in lp]
    x0, x1, y0, y1 = min(xs), max(xs), min(ys), max(ys)
    k = BOX / max(x1 - x0, y1 - y0)
    ox = 50.0 - (x0 + x1) / 2 * k
    oy = 50.0 - (y0 + y1) / 2 * k
    out = []
    for lp in loops:
        d = []
        for i, (x, y) in enumerate(lp):
            d.append(("M" if i == 0 else "L") + _n(x * k + ox) + " " + _n(y * k + oy))
        out.append("".join(d) + "Z")
    return "".join(out)


def _n(v):
    s = ("%.1f" % v).rstrip("0").rstrip(".")
    return s if s not in ("-0", "") else "0"


def main():
    sheets = sorted(f for f in os.listdir(SRC)
                    if f.lower().endswith((".jpg", ".jpeg", ".png", ".webp")))
    if not sheets:
        print("シートがありません:", SRC); return 1
    im = Image.open(os.path.join(SRC, sheets[0]))
    print("シート:", sheets[0], im.size)

    arts, total = [], 0
    for name, cell in cells(im):
        m, w, h = mask_of(cell)
        loops = contours(m, w, h)
        if not loops:
            print("  %-8s 白い形が見つからない" % name); continue
        loops = [rdp(lp, TOL) for lp in loops]
        loops = [lp for lp in loops if len(lp) >= 3]
        d = to_path(loops)
        total += len(d)
        arts.append((name, d))
        print("  %-8s 輪郭 %2d / 点 %4d / %5d 文字"
              % (name, len(loops), sum(len(l) for l in loops), len(d)))

    body = ",\n".join('  %s:"%s"' % (n, d) for n, d in arts)
    txt = ("// ================= 紋章の意匠(→docs/03 §3.54b) =================\n"
           "// **tools/slice_emblem.py が書き出す。手で編集しない。**\n"
           "//\n"
           "// src/assets/art/emblem/ の白いシルエットを輪郭追跡してパスにしたもの。\n"
           "// **ベクターのまま持つ**ので、クラブの2色(ink/edge)がそのまま乗り、\n"
           "// どの大きさでも輪郭が出る(→docs/03 §3.54)。\n"
           "// 穴は輪郭を並べて `fill-rule=\"evenodd\"` に任せてある。\n"
           "const EMB_ART={\n" + body + ",\n};\n")
    with open(OUT, "w", encoding="utf-8", newline="\n") as f:
        f.write(txt)
    print("書き出し:", os.path.relpath(OUT, ROOT), "／", len(arts), "個 ／", total, "文字")
    return 0


if __name__ == "__main__":
    sys.setrecursionlimit(20000)
    sys.exit(main())
