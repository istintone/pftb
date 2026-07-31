# pftb

single play browser football game

スマートフォン縦持ち・オフライン対応の**単一HTMLファイル**で動作する1人プレイ用サッカーゲーム。
現在は土台のみ(タイトル/クラブ設立/画面切替/セーブ)が動く状態で、ゲーム内容はこれから設計する
([docs/03-game-design.md](docs/03-game-design.md))。

## 遊ぶ

ローカルでは `index.html` をブラウザで開くだけ(ビルド不要・サーバー不要)。
GitHub Pages で公開すると `https://istintone.github.io/pftb/` でそのまま遊べる。

## リポジトリ構成

```
pftb/
├── index.html          ← 公開・実行用の完成ファイル(ビルド成果物。単一HTML・オフライン動作)
├── build.py            ← ビルドスクリプト(src/js, src/css を index.html へ結合・埋め込み)
├── SPEC.md             ← 設計仕様書の索引(Single Source of Truth)
├── docs/               ← 仕様書本体
└── src/
    ├── js/             ← ゲーム本体の正本JS(結合順は build.py の JS_FILES)
    │   ├── data.js         定義・ユーティリティ・バランスダイヤル TUNING
    │   ├── state.js        セーブ状態・save/load/migrate・書き出し/読み込み
    │   ├── ui.js           画面切替・共通UI・各画面の描画
    │   └── boot.js         起動(結合順は必ず最後)
    ├── css/
    │   └── base.css        変数・レイアウト・部品
    └── tests/          ← headless Node の検証ハーネス
```

`index.html` は**ビルド成果物**。ロジックを変えるときは `src/js/*.js` を編集し、`build.py` で反映する。
分割は開発時の編集しやすさのためで、import/export やバンドラは使わず単純に結合するだけ。

## 開発

### 必要環境
- Python 3(ビルド用)
- Node.js(テスト用)

### ビルド
```bash
python build.py           # src/js, src/css を index.html に再埋め込み
python build.py --check   # 埋め込み済みかチェックのみ
python build.py --dev     # _dev.js 込みの index.dev.html を出力(Git管理外)
```

### テスト
```bash
cd src/tests
for t in integration hangtest; do
  echo -n "$t: "; node $t.js >/dev/null 2>&1 && echo OK || echo FAIL
done
```

詳しい手順は [docs/04-testing.md](docs/04-testing.md) を参照。

## GitHub Pages での公開手順

1. リポジトリの **Settings → Pages** を開く
2. **Source** を `Deploy from a branch` に設定
3. **Branch** を `main` / フォルダ `/ (root)` に設定して保存
4. 数十秒後に `https://istintone.github.io/pftb/` で公開される

`index.html` がルートにあるため、追加設定なしでそのまま公開できる。

## ライセンス

個人制作。
