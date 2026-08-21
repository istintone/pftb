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
| `careertest.js` | 複数シーズンを回して**評価が期待との差に対して対称**か、名声・任期・試合結果の分布が妥当か | バランス変更時 |
| `ordtest.js` | 采配(→docs/03 §3.28)。陣形の上下・能力の見返り・レーンの偏り・**表と裏があるか** | 采配やチャンネルを触ったとき |
| `traintest.js` | 育成(→docs/03 §3.30 / §3.31)。経験点・覚醒・裏パラ・連携・**任期で消えるか** | 訓練や交流を触ったとき |
| `psotest.js` | PK戦(→docs/03 §3.33)。決定率・交互に蹴る・途中経過・**必ず決着するか** | PK戦やカップを触ったとき |

> **画面レジストリ整合**は `SCREENS` のキーと `index.html` の `id="scr-*"` が1対1であること、
> タブが5つでそれぞれ同名画面を指していること、`under` が実在するタブを指していることを検査する。
> `index.html` には JS/CSS が丸ごと埋め込まれているため、走査前に `<script>`/`<style>` を落としている
> (落とさないとコード中のコメント文字列まで拾ってしまう)。

### 4.2 実行

```bash
cd src/tests
for t in integration hangtest worldtest careertest tenuretest ordtest traintest psotest; do
  echo -n "$t: "; node $t.js >/dev/null 2>&1 && echo OK || echo FAIL
done
```

PowerShell の場合:

```powershell
cd src\tests
foreach ($t in @("integration","hangtest","worldtest","careertest","tenuretest","ordtest","traintest","psotest")) {
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
node tools/drive.js --mobile     # スマホ実寸(390x844)で確認する
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

### ブラウザの後片づけ(2026-08-17)

`tools/drive.js` は**自分が起こしたブラウザだけを、必ず落とす**。

- **PID を指定して木ごと落とす**(`taskkill /PID <pid> /T /F`)。
  `browser.kill()` は Windows では**起動役のプロセスしか殺さない**ので、
  子プロセスが残って `chrome-profile` を掴んだままになり、
  次の実行が `EPERM` で落ちる
- **失敗した経路でも落とす**。`process.on("exit")` と SIGINT/SIGTERM に繋いである。
  以前は `.catch()` の中で `browser.kill()` を呼んでおらず、
  **検査が1つ落ちるたびに headless Chrome が1つ残っていた**

> **`taskkill /IM chrome.exe` は絶対に使わない。** イメージ名で殺すと、
> 作業している人が自分で開いているブラウザまで巻き添えにする。
> EPERM を力技で潰すために一度これをやってしまい、
> **利用者のブラウザが毎回落ちる**という迷惑をかけた。
> 掴んでいるのは自分が残した残骸なので、直すべきは後片づけのほう。


[← 前: 3. ゲームデザイン](03-game-design.md) ｜ [↑ 索引](../SPEC.md) ｜ [次: 5. 決定事項ログ →](05-decisions-backlog.md)

## 世界のたねは固定する(2026-08-21)

`drive.js` は毎回**同じ世界**を見る。`newGame()` は `S.world.seed` を
`Date.now()` から作るので、放っておくと走らせるたびに名簿も試合結果も変わり、
**たまたまの並びでしか落ちない検査**が混ざったときに
「回帰なのか偶然なのか」が判別できない。

実際にそれで時間を落とした。同じ木で3回走らせて、1回だけ別々の理由で落ちた。

    実行1  FAIL: 初勝利で届かない
    実行2  FAIL: 盤面から外れていない: direct
    実行3  通過

#### 入れ方 — 評価ではなく「新規ドキュメントごとに走る仕掛け」

途中に1回だけリロードする検査があるので、`ctx.js()` で差し込むと**そこで剥がれる**。
CDP の `Page.addScriptToEvaluateOnNewDocument` なら文書が作られるたびに走る。

```js
const orig=newGame;
window.newGame=async function(){ const r=await orig.apply(this,arguments);
  S.world.seed=SEED; return r; };
```

`newGame` は関数宣言なので**グローバルの属性そのもの**。差し替えれば
ゲーム側の呼び出しもこちらを通る。

#### スカウトの抽選は触らない

`openScout` と引換券の抽選は `Date.now()` を使って**意図的に再現不能**にしてある
(セーブを戻して引き直す余地を作らないため →`ui.js`)。
ここまで固定すると仕様が変わってしまうので、そのままにしている。

> 検証: 2回走らせてログを突き合わせると、**違うのはスカウトで出たカードだけ**。
> クラブ・リーグ・コイン・順位は完全に一致する。

