#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""pftb ビルドスクリプト

src/js/*.js と src/css/*.css を正本(Single Source of Truth)として、
index.html の <style> ブロックと2番目の <script> ブロックへ埋め込み直す。
複数ファイルへの分割は開発時の編集しやすさのためで、成果物は単一HTML
(オフラインでもコピー1枚で動作)のまま変わらない。import/export やバンドラは使わず、
単純な文字列結合でグローバルスコープに連結する。

使い方:
    python build.py           # ビルド(再埋め込み)
    python build.py --check   # ビルドせず一致チェックのみ(CI/リリース前確認)
    python build.py --dev     # _dev.js を含めた index.dev.html を出力(Git管理外)

開発フロー:
    1. src/js/*.js (または src/css/*.css) を編集
    2. python build.py を実行
    3. index.html をブラウザで開いて確認 → テスト → git commit
"""
import re
import sys
import base64
import pathlib

ROOT = pathlib.Path(__file__).parent
HTML = ROOT / "index.html"
ASSET_DIR = ROOT / "src" / "assets"   # 画像アセット。<グループ名>/<名前>.png|webp|jpg で置く
FONT_DIR = ASSET_DIR / "fonts"        # 埋め込みフォント(latinサブセットのwoff2)

# 埋め込むフォント: (ファイル名, CSSのfamily名, 可変ウェイトの範囲)
# いずれも可変フォント1本で全ウェイトを賄うため、@font-face は family ごとに1つで足りる。
FONTS = [
    ("inter-latin.woff2", "Inter", "100 900"),
    ("oswald-latin.woff2", "Oswald", "200 700"),
    ("jetbrainsmono-latin.woff2", "JetBrains Mono", "100 800"),
]
# Google Fonts の latin サブセットと同じ範囲。日本語はシステムフォントに落ちる。
LATIN_RANGE = ("U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,"
               "U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD")

# 結合順序。JSはグローバルスコープに連結されるため定義順は基本自由だが、
# data.js は先頭(1行目の "use strict"; 直後にアセットを注入するため)、
# boot.js は起動の副作用を持つので必ず最後に置く。
# (src/tests/_setup.js も同じ並びを使う。変更したら両方更新すること)
JS_FILES = ["data.js", "cards.js", "signatures.js", "world.js", "match-core.js", "state.js", "ui.js", "boot.js"]
CSS_FILES = ["base.css"]

_MIME = {".png": "image/png", ".webp": "image/webp", ".jpg": "image/jpeg", ".jpeg": "image/jpeg"}

DEV_JS = ROOT / "src" / "js" / "_dev.js"  # ローカル検証専用(gitignore)。--dev の時だけ末尾に連結。


def _join(dirpath, names):
    return "\n\n".join((ROOT / "src" / dirpath / n).read_text(encoding="utf-8").strip() for n in names)


# 実行時アセットではないディレクトリ(埋め込むと index.html が肥大化する)
#   design … デザインモックと参照画像。人が見るためのもの
#   fonts  … @font-face として別途注入する(_font_block)
# art … 素材(3枚組シート)。切り出す前の絵なので埋め込まない(→docs/03 §3.19)
ASSET_SKIP = {"design", "fonts", "art"}


def _asset_block():
    """src/assets/<グループ>/<名前>.(png|webp|jpg) を base64 データURI化し
    `window.ASSETS={"<グループ>":{"<名前>":"data:...",...},...};` を生成する。
    ディレクトリ名/ファイル名順で決定的に出力(--check が安定する)。
    ASSET_SKIP のディレクトリは対象外(参照用の画像を埋め込まないため)。"""
    groups = []
    if ASSET_DIR.is_dir():
        for d in sorted(p for p in ASSET_DIR.iterdir() if p.is_dir() and p.name not in ASSET_SKIP):
            items = []
            for f in sorted(d.iterdir()):
                if f.suffix.lower() in _MIME:
                    b64 = base64.b64encode(f.read_bytes()).decode("ascii")
                    items.append('"%s":"data:%s;base64,%s"' % (f.stem, _MIME[f.suffix.lower()], b64))
            if items:
                groups.append('"%s":{%s}' % (d.name, ",".join(items)))
    return "window.ASSETS={%s};" % ",".join(groups)


def _font_block():
    """src/assets/fonts/*.woff2 を base64 データURI化して @font-face 群を生成する。
    外部リクエストを一切発生させないための埋め込み(→docs/01-architecture.md「オフライン動作」)。
    未配置のフォントは黙って飛ばす(システムフォントへフォールバックして動作は続く)。"""
    out = []
    for fname, family, weight in FONTS:
        f = FONT_DIR / fname
        if not f.is_file():
            print("⚠ フォント未配置(システムフォントで代替):", fname)
            continue
        b64 = base64.b64encode(f.read_bytes()).decode("ascii")
        out.append(
            "@font-face{font-family:'%s';font-style:normal;font-weight:%s;font-display:swap;"
            "src:url(data:font/woff2;base64,%s) format('woff2');unicode-range:%s}"
            % (family, weight, b64, LATIN_RANGE)
        )
    return "\n".join(out)


def _assemble_css():
    """@font-face(埋め込みフォント)を先頭に、src/css/*.css を結合したものを返す。"""
    return _font_block() + "\n\n" + _join("css", CSS_FILES)


def _assemble_js(dev=False):
    """JS本体を結合し、先頭の "use strict"; 直後にアセットのグローバルを差し込む
    (strictモードを保ちつつ、データ定義より前に画像を用意する)。
    dev=True かつ src/js/_dev.js があれば boot.js の後ろに連結(ローカル検証専用)。"""
    body = _join("js", JS_FILES)
    if dev and DEV_JS.is_file():
        body += "\n\n" + DEV_JS.read_text(encoding="utf-8").strip()
    inject = _asset_block()
    first_nl = body.find("\n")
    if first_nl == -1:
        return body + "\n" + inject
    return body[:first_nl] + "\n" + inject + body[first_nl:]


def main():
    check_only = "--check" in sys.argv
    dev = "--dev" in sys.argv
    out = (ROOT / "index.dev.html") if dev else HTML

    html = HTML.read_text(encoding="utf-8")  # テンプレートは常に index.html
    js_src = _assemble_js(dev)
    css_src = _assemble_css()

    style_blocks = list(re.finditer(r"(<style>)(.*?)(</style>)", html, re.S))
    script_blocks = list(re.finditer(r"(<script[^>]*>)(.*?)(</script>)", html, re.S))
    if not style_blocks:
        sys.exit("ERROR: index.html に <style> ブロックが見つかりません")
    if len(script_blocks) < 2:
        sys.exit("ERROR: index.html に <script> ブロックが2つ見つかりません(1つ目=起動診断/2つ目=ゲーム本体)")

    style_m = style_blocks[0]
    script_m = script_blocks[1]  # 2番目がゲーム本体

    if check_only:
        css_ok = style_m.group(2).strip() == css_src
        js_ok = script_m.group(2).strip() == js_src
        print("CSS一致:", css_ok)
        print("JS一致:", js_ok)
        sys.exit(0 if (css_ok and js_ok) else 1)

    # script側は元のオフセットがstyle編集でズレるため、後ろ(script)から先に書き換える
    new_html = html[:script_m.start()] + script_m.group(1) + "\n" + js_src + "\n" + script_m.group(3) + html[script_m.end():]
    new_html = new_html[:style_m.start()] + style_m.group(1) + "\n" + css_src + "\n" + style_m.group(3) + new_html[style_m.end():]
    out.write_text(new_html, encoding="utf-8")

    # 検証: 再読込して一致とID整合(不変条件)を確認
    after_css = re.findall(r"<style>(.*?)</style>", new_html, re.S)[0].strip()
    after_js = re.findall(r"<script[^>]*>(.*?)</script>", new_html, re.S)[1].strip()
    used = set(re.findall(r'getElementById\(["\']([^"\']+)["\']\)', new_html))
    declared = set(re.findall(r'\bid=["\']([^"\']+)["\']', new_html))
    missing = sorted(used - declared)
    print("CSS再埋め込み一致:", after_css == css_src)
    print("JS再埋め込み一致:", after_js == js_src)
    print("MISSING ids:", missing or "なし")
    if after_css != css_src or after_js != js_src or missing:
        sys.exit("ERROR: ビルド検証に失敗しました")
    print("ビルド完了 ->", out.name + (" (ローカル検証専用・Git管理外)" if dev else ""))


if __name__ == "__main__":
    main()
