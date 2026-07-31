> [← ドキュメント索引 (SPEC.md)](../SPEC.md) ｜ pftb 仕様書

---

## 1. アーキテクチャと技術仕様

| 項目 | 仕様 |
|---|---|
| 構成 | 単一 `.html`。`<style>` + `<script>`(`"use strict"`)に全て内包 |
| 永続化 | `localStorage`(キー `"pftb-save"`)に JSON 文字列。ホストが `window.storage`(非同期)を提供する環境ではそちらを優先し、get 3秒 / set 2.5秒でタイムアウト |
| 画像 | `src/assets/<グループ>/*.png|webp|jpg` を base64 データURIで `window.ASSETS` に埋め込む(外部読み込みなし) |
| 起動堅牢化 | 本体JSと独立したES5エラーハンドラ(`#bootStat`)が行番号付きでエラーを表示。`window.__boot(msg, ok)` で進捗報告し、成功で3秒後に自動非表示 |
| フォント | 外部フォントを読まず system-ui 系のみ(完全オフラインを保つため) |
| アクセシビリティ | `prefers-reduced-motion` でアニメーション停止 |

### 1.1 ソース構成(開発時は分割 → build.py で単一HTMLへ結合)

```
pftb/
├── index.html          ← 公開・実行用の完成ファイル(ビルド成果物)
├── build.py            ← src/js, src/css を index.html へ結合・埋め込み
├── SPEC.md / docs/     ← 仕様(正本)
└── src/
    ├── js/             ← ゲーム本体の正本JS(結合順は build.py の JS_FILES)
    │   ├── data.js       定義・ユーティリティ・バランスダイヤル TUNING
    │   ├── state.js      セーブ状態 S・save/load/migrate・書き出し/読み込み
    │   ├── ui.js         画面切替 show()・共通UI(toast/モーダル)・各画面の描画
    │   └── boot.js       起動(即時実行の副作用を持つ。結合順は必ず最後)
    ├── css/
    │   └── base.css      変数・レイアウト・部品
    └── tests/          ← headless Node の検証ハーネス
        ├── _setup.js     共通のDOM/localStorage/Imageモック + src/js 結合ヘルパー
        └── *.js          各テスト本体
```

- **結合方式**: import/export やバンドラは使わない。`build.py` が単純にファイルを連結し、
  グローバルスコープに並べる。分割は「編集しやすさ」のためだけの都合。
- **アセット注入**: `build.py` が `"use strict"` 直後に `window.ASSETS={"<グループ>":{"<名前>":"data:..."}}` を注入する。
  そのため `data.js` の1行目は必ず `"use strict";` のままにする。
- **`--dev`**: `src/js/_dev.js`(Git管理外)を末尾に足した `index.dev.html` を出力。ローカル検証専用で、
  本番 `index.html` には含めない。

### 1.2 拡張の仕方(土台に足していく順序)

| やること | 触る場所 |
|---|---|
| 画面を増やす | `index.html` に `<div id="scr-xxx" class="screen">` を足す → `ui.js` の `SCREENS` に描画関数を登録 → 必要ならタブに `<button data-s="xxx">` |
| セーブ項目を増やす | `state.js` の `defaultState()` に足す(古いセーブは `loadGame()` の欠落補完が拾う)。構造を変える場合は `SAVE_VER` を上げて `migrate()` を書く |
| JSファイルを増やす | `build.py` の `JS_FILES` と `src/tests/_setup.js` の `JS_FILES` の**両方**に追加(並びを一致させる) |
| CSSレイヤーを増やす | `build.py` の `CSS_FILES` に追加(後ろほど上書きレイヤー) |
| バランス調整 | `data.js` の `TUNING` に集約。ロジック側に数値を直書きしない |

### 1.3 不変条件(リグレッション禁止)

- **参照ID整合**: JS内の全 `getElementById("X")` に対し、HTMLに `id="X"` が必ず存在する
  (`build.py` がビルド時に検査し、欠けていればエラーで停止する)。
- **ビルド一致**: `python build.py --check` が常に成功する(`index.html` は `src/` の結合結果と一致する)。
- **ハング耐性**: ストレージ・画像が応答しなくても起動できる(`withTimeout` で打ち切り、既定データで続行)。
- **オフライン動作**: 外部ネットワークへのリクエストを一切行わない(フォント/画像/スクリプトすべて内包)。

---

[↑ 索引](../SPEC.md) ｜ [次: 2. データモデル →](02-data-model.md)
