> [← ドキュメント索引 (SPEC.md)](../SPEC.md) ｜ pftb 仕様書

---

## 1. アーキテクチャと技術仕様

| 項目 | 仕様 |
|---|---|
| 構成 | 単一 `.html`。`<style>` + `<script>`(`"use strict"`)に全て内包 |
| 永続化 | `localStorage`(キー `"pftb-save"`)に JSON 文字列。ホストが `window.storage`(非同期)を提供する環境ではそちらを優先し、get 3秒 / set 2.5秒でタイムアウト |
| 画像 | `src/assets/<グループ>/*.png|webp|jpg` を base64 データURIで `window.ASSETS` に埋め込む(外部読み込みなし) |
| 起動堅牢化 | 本体JSと独立したES5エラーハンドラ(`#bootStat`)が行番号付きでエラーを表示。`window.__boot(msg, ok)` で進捗報告し、成功で3秒後に自動非表示 |
| フォント | Oswald / JetBrains Mono / Inter の **latin サブセット woff2 を base64 で `@font-face` に埋め込む**(`build.py` が生成)。日本語はシステムフォントに落とす。外部リクエストは発生しない |
| アクセシビリティ | `prefers-reduced-motion` でアニメーション停止 |

### 1.1 ソース構成(開発時は分割 → build.py で単一HTMLへ結合)

```
pftb/
├── index.html          ← 公開・実行用の完成ファイル(ビルド成果物)
├── build.py            ← src/js, src/css を index.html へ結合・埋め込み
├── SPEC.md / docs/     ← 仕様(正本)
└── src/
    ├── js/             ← ゲーム本体の正本JS(結合順は build.py の JS_FILES)
    │   ├── data.js       定義・ユーティリティ・決定的乱数・レアリティ・バランスダイヤル TUNING
    │   ├── cards.js      選手カードの生成(名前/能力/スキル)・編成の強さ・枠適性
    │   ├── world.js      国/クラブ・日程・順位表・期待順位・就任と任期・節の進行
    │   ├── match-core.js 試合の純粋計算(DOM非依存。※現状は暫定リゾルバ)
    │   ├── state.js      セーブ状態 S・save/load/migrate・書き出し/読み込み
    │   ├── ui.js         画面レジストリ SCREENS・show()/goBack()・各画面の描画
    │   └── boot.js       起動(即時実行の副作用を持つ。結合順は必ず最後)
    ├── assets/
    │   ├── fonts/        埋め込みフォント(latinサブセットのwoff2)
    │   └── design/       デザインモック(参照用。実行時アセットではない)
    ├── css/
    │   └── base.css      トークン・レイアウト・部品
    └── tests/          ← headless Node の検証ハーネス
        ├── _setup.js     共通のDOM/localStorage/Imageモック + src/js 結合ヘルパー
        └── *.js          各テスト本体

tools/
└── drive.js            ← headless Chrome を自動操作して画面を確認(依存なし・CDP直叩き)
.claude/skills/run-app/ ← 起動と確認の手順(スキル)
```

- **結合方式**: import/export やバンドラは使わない。`build.py` が単純にファイルを連結し、
  グローバルスコープに並べる。分割は「編集しやすさ」のためだけの都合。
- **アセット注入**: `build.py` が `"use strict"` 直後に `window.ASSETS={"<グループ>":{"<名前>":"data:..."}}` を注入する。
  そのため `data.js` の1行目は必ず `"use strict";` のままにする。
- **フォント注入**: `build.py` の `FONTS` に列挙した woff2 を base64 化し、`@font-face` 群として
  CSS の**先頭**に置く。可変フォントなので family ごとに1つで全ウェイトを賄う。
  ファイルが無ければ警告を出して飛ばす(システムフォントで動作は継続)。
- **`--dev`**: `src/js/_dev.js`(Git管理外)を末尾に足した `index.dev.html` を出力。ローカル検証専用で、
  本番 `index.html` には含めない。

### 1.2 拡張の仕方(土台に足していく順序)

| やること | 触る場所 |
|---|---|
| 画面を増やす | `index.html` の `#appBody` に `<div id="scr-xxx" class="screen">` を足す → `ui.js` の `SCREENS` に1エントリ足す(`title`/`tab`/`under`/`chrome`/`render`)。タブは5つから増やさない(→[06. §6.7](06-design-system.md)) |
| セーブ項目を増やす | `state.js` の `defaultState()` に足す(古いセーブは `loadGame()` の欠落補完が拾う)。構造を変える場合は `SAVE_VER` を上げて `migrate()` を書く |
| JSファイルを増やす | `build.py` の `JS_FILES` と `src/tests/_setup.js` の `JS_FILES` の**両方**に追加(並びを一致させる) |
| CSSレイヤーを増やす | `build.py` の `CSS_FILES` に追加(後ろほど上書きレイヤー) |
| バランス調整 | `data.js` の `TUNING` に集約。ロジック側に数値を直書きしない |

### 1.3 不変条件(リグレッション禁止)

- **参照ID整合**: JS内の全 `getElementById("X")` に対し、HTMLに `id="X"` が必ず存在する
  (`build.py` がビルド時に検査し、欠けていればエラーで停止する)。
- **画面レジストリ整合**: `SCREENS` のキーと HTML の `id="scr-<キー>"` が1対1に対応する。
  タブは5つで、各 `data-s` は同名画面の `tab` として登録されている(`integration.js` が検査)。
- **CSSの display 指定**: 画面の表示/非表示は `.screen` / `.screen.on` だけで制御する。
  **IDセレクタに `display` を書かない**(`#scr-x{display:flex}` は `.screen{display:none}` に勝ってしまい、
  画面が消えなくなる)。
- **ビルド一致**: `python build.py --check` が常に成功する(`index.html` は `src/` の結合結果と一致する)。
- **ハング耐性**: ストレージ・画像が応答しなくても起動できる(`withTimeout` で打ち切り、既定データで続行)。
- **オフライン動作**: 外部ネットワークへのリクエストを一切行わない(フォント/画像/スクリプトすべて内包)。

---

[↑ 索引](../SPEC.md) ｜ [次: 2. データモデル →](02-data-model.md)
