> [← ドキュメント索引 (SPEC.md)](../SPEC.md) ｜ pftb 仕様書

---

## 4. テストと検証

ブラウザを使わず **headless Node** で本体JSを読み込んで検証する。
`src/tests/_setup.js` が `document` / `window` / `localStorage` / `Image` / `setTimeout` をモックし、
`src/js/*.js` を結合した一時ファイル(`_tmp_*.js`・Git管理外)を require して返す。

### 4.1 テスト一覧

| テスト | 内容 | 位置づけ |
|---|---|---|
| `integration.js` | 新規作成 → 保存 → 読込 → 書き出し/読み込み → 削除 → **画面レジストリ整合** → 画面切替/戻る | 必須 |
| `hangtest.js` | ストレージ無応答でも起動が止まらない(タイムアウトで既定データ続行) | 必須 |
| `worldtest.js` | クラブ構成・**選手生成の決定性**・OVR整合・日程(14節/各クラブH7A7/重複なし)・期待順位・名声の階段 | 必須 |
| `tenuretest.js` | 任期(96節/最大120節)の通算・打ち手を選ばないと進めない・大会の決着で延命/終了が決まる | 必須 |
| `careertest.js` | 複数シーズンを回して**評価が期待との差に対して対称**か、名声・解任・試合結果の分布が妥当か | バランス変更時 |

> **画面レジストリ整合**は `SCREENS` のキーと `index.html` の `id="scr-*"` が1対1であること、
> タブが5つでそれぞれ同名画面を指していること、`under` が実在するタブを指していることを検査する。
> `index.html` には JS/CSS が丸ごと埋め込まれているため、走査前に `<script>`/`<style>` を落としている
> (落とさないとコード中のコメント文字列まで拾ってしまう)。

### 4.2 実行

```bash
cd src/tests
for t in integration hangtest worldtest careertest tenuretest; do
  echo -n "$t: "; node $t.js >/dev/null 2>&1 && echo OK || echo FAIL
done
```

PowerShell の場合:

```powershell
cd src\tests
foreach ($t in @("integration","hangtest","worldtest","careertest","tenuretest")) {
  node "$t.js" *> $null; if ($?) { "$t : OK" } else { "$t : FAIL" }
}
```

### 4.3 三層の検証

1. **ビルド検証**(`python build.py`): CSS/JSの再埋め込み一致 + 参照ID整合(`getElementById` ↔ `id=`)。
2. **ロジック検証**(`src/tests/*.js`): 状態遷移・保存・異常系・画面レジストリ整合。
3. **目視確認**: `index.html` をブラウザ(できればスマホ幅)で開き、実際に触る。

**CSSのレイアウト崩れはこの3層では捕まらない**。表示に関わる変更をしたときは必ず 3 を行うこと
(実例: `#scr-title{display:flex}` と書いたために `.screen{display:none}` が効かず、
タイトル画面が消えなくなるバグは、ビルドもロジックテストも素通りした)。

### 4.4 ブラウザでの確認(`tools/drive.js`)

目視確認を毎回手作業でやらずに済むよう、**headless Chrome を自動操作するドライバ**を用意してある。

```bash
node tools/drive.js            # 導入フロー〜タブ巡回を辿ってスクリーンショットを撮る
node tools/drive.js --out=<dir>  # 出力先(既定: OSのtemp/pftb-shots)
node tools/drive.js --keep       # プロファイルを残す(セーブを引き継いで再実行)
```

- 依存パッケージなし。Node 22+ の組み込み `fetch` / `WebSocket` で CDP を直接叩いている。
- ページ側で例外や `console.error` が出ていれば終了コード 1。
- フローを足すときは `STEPS` に1エントリ追加する(`ctx.js` / `ctx.shot` / `ctx.screen` が使える)。
- **撮った PNG は必ず開いて目視する**。遷移ログが正しくても崩れは検出できない。

手順の詳細と「見るべきポイント」は [`.claude/skills/run-app/SKILL.md`](../.claude/skills/run-app/SKILL.md)
にスキルとしてまとめてある(`/run-app` で呼べる)。ユーザーに触ってもらう場合は
`Start-Process index.html` で実ブラウザを開く。

### 4.5 リリース手順

1. `src/` を編集
2. `python build.py`(検証がすべて True・MISSING ids なし)
3. `cd src/tests` → 必須テストがすべて OK
4. `index.html` をブラウザで開いて目視確認
5. SPEC/docs を実装に合わせて更新
6. コミット(日本語メッセージ)。プッシュは明示指示時のみ

### 4.6 テストの足し方

- 新しい機能はまず `integration.js` の流れに1ステップ足せないかを考える(1周の流れを守るテストが一番効く)。
- 独立した観点(異常系・バランス・長時間実行)は別ファイルにし、この表に追記する。
- `src/js` にファイルを足したら `_setup.js` の `JS_FILES` も更新する(`build.py` と並びを一致させる)。

---

[← 前: 3. ゲームデザイン](03-game-design.md) ｜ [↑ 索引](../SPEC.md) ｜ [次: 5. 決定事項ログ →](05-decisions-backlog.md)
