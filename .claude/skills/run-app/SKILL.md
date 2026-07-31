---
name: run-app
description: pftb(P-footBall)を実際に起動して動作と見た目を確認する。「動かして」「起動して」「スクリーンショットを撮って」「画面を見せて」と言われたとき、および表示・レイアウト・画面遷移に関わる変更を入れたあとの確認に使う。
---

# pftb を動かす

成果物は**単一HTMLファイル**(`index.html`)で、サーバーもビルドサーバーも要らない。
確認の方法は2つある。**表示に関わる変更をしたら必ずどちらかを行うこと**
(CSSの崩れは `build.py --check` にもロジックテストにも引っかからない)。

## 前提: 先にビルドする

`index.html` はビルド成果物。`src/` を触ったら**必ず先に**:

```bash
cd /c/Claude/repository/pftb && python build.py
```

`MISSING ids: なし` と再埋め込み一致が両方 True であること。

## A. 自分で確認する(headless + スクリーンショット)

```bash
node tools/drive.js
```

Chrome か Edge を headless で起動し、**タイトル → 就任契約書 → ホーム → タブ巡回 →
サブ画面と戻る → リロードして続きから**を自動で辿り、各段でスクリーンショットを撮る。
出力先は既定で OS の temp/`pftb-shots`(`--out=<dir>` で変更可)。

**撮った PNG は必ず Read で開いて目視すること。** 遷移ログが正しくても、
CSSの指定ミスで前の画面が残っている、といった崩れはログには出ない
(実例: `#scr-title{display:flex}` が `.screen{display:none}` に勝ってタイトルが消えなかった)。

終了コードは、ページ側で例外や `console.error` が出ていれば 1。

- `--keep` … 実行後もブラウザプロファイルを残す(セーブを引き継いで再実行したいとき)
- `--port=9333` … DevTools のポート(既定 9333)

### フローを足す

`tools/drive.js` の `STEPS` に `["名前", async ctx => {...}]` を1つ足すだけ。
`ctx.js(式)` / `ctx.shot(名前)` / `ctx.wait(ms)` / `ctx.screen()` / `ctx.log(...)` が使える。
新しい画面や機能を作ったら、**そこを触るステップを足してから**確認する。

> 依存パッケージは無い。Node 22+ の組み込み `fetch` / `WebSocket` で CDP を直接叩いている
> (Playwright は入っていない。入れる必要もない)。

## B. ユーザーに見せる(実ブラウザで開く)

```powershell
Start-Process "c:\Claude\repository\pftb\index.html"
```

既定のブラウザで開く。**ユーザー自身が触って確かめたいと言ったときはこちら。**
スマホ幅で見るなら DevTools のデバイスモードを使う(端末枠は 402px 基準)。

## 見るべきポイント

| | 期待 |
|---|---|
| タイトル | ゴールドの円形マーク、Oswald の "P-footBall"(Ball がゴールド)、`TAP TO START` |
| 就任契約書 | 「監督就任契約書」の字間広め見出し、2つの記入欄、締結日、署名ボタン。**未記入で署名するとトーストで弾かれる** |
| ホーム | ヘッダー(エンブレム・クラブ名・HOME・コイン)、NEXT MATCH / 秘書 / CLUB NEWS の3枠 |
| タブ | 下部に5つ(HOME / CARDS / DECK / SCHEDULE / CLUB)。選択中がゴールド |
| サブ画面 | 左上が戻るボタンに変わり、**親タブは点灯したまま**(SCHEDULE 配下なら SCHEDULE が光る) |
| リロード | タイトルの注記が「タップして続きから」になり、タップでクラブ名ごと復帰する |

フォントが効いていない(見出しが細い・字間が出ない)ときは、
`build.py` が `⚠ フォント未配置` を出していないか確認する。
`src/assets/fonts/*.woff2` が揃っていれば `@font-face` として埋め込まれる。

## テストも回す場合

```bash
cd /c/Claude/repository/pftb/src/tests && node integration.js && node hangtest.js
```

`integration.js` は保存/読込に加えて**画面レジストリ整合**(`SCREENS` ↔ `id="scr-*"`、タブ5つ)を検査する。
画面を増やしたときはここが落ちる。
