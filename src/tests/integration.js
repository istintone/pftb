// 土台の統合テスト: 新規作成 → 保存 → 読み込み → 書き出し/読み込み → 画面切替。
// ゲームロジックを足したら、この流れの中に「1周プレイできること」を積み増していく。
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { setup } = require("./_setup");
const E = setup({ tmpName: "_tmp_integration.js" });

(async () => {
  // 新規データ
  await E.newGame();
  assert.strictEqual(E.getS().v, E.SAVE_VER, "新規データのスキーマ版が SAVE_VER と一致する");
  console.log("新規作成OK v:", E.getS().v);

  // 保存 → 別状態から読み直して復元されること
  E.getS().coins = 123;
  E.getS().teamName = "テストFC";
  await E.save();
  await E.flushSave();
  E.setS({ v: 0, coins: 0, coach: "", teamName: "" });
  await E.loadGame();
  assert.strictEqual(E.getS().coins, 123, "コインが復元される");
  assert.strictEqual(E.getS().teamName, "テストFC", "クラブ名が復元される");
  assert.strictEqual(E.getS().season, 1, "欠落キーが既定値で補完される");
  console.log("保存/読込OK coins:", E.getS().coins, "/", E.getS().teamName);

  // 書き出し → 読み込み(端末移行の往復)
  const text = await E.exportSave();
  E.getS().coins = 0;
  await E.importSave(text);
  await E.loadGame();
  assert.strictEqual(E.getS().coins, 123, "書き出したデータから復元される");
  await assert.rejects(() => E.importSave("これはJSONではない"), "壊れた入力は例外になる");
  console.log("書き出し/読み込みOK");

  // セーブ削除
  E.deleteSave();
  assert.strictEqual(await E.hasSave(), false, "削除後はセーブが無い");
  console.log("削除OK");

  // 画面レジストリ ↔ HTML の対応(不変条件)
  // index.html には src/js・src/css が丸ごと埋め込まれているので、
  // マークアップだけを見るために <script>/<style> の中身を落としてから走査する。
  const html = fs.readFileSync(path.join(__dirname, "..", "..", "index.html"), "utf8")
    .replace(/<script[\s\S]*?<\/script>/g, "")
    .replace(/<style[\s\S]*?<\/style>/g, "");
  const ids = new Set([...html.matchAll(/id="scr-([a-zA-Z]+)"/g)].map(m => m[1]));
  const names = Object.keys(E.SCREENS);
  for (const n of names) assert.ok(ids.has(n), `SCREENS の "${n}" に対応する #scr-${n} がHTMLにある`);
  for (const id of ids) assert.ok(names.includes(id), `#scr-${id} が SCREENS に登録されている`);
  const tabs = [...html.matchAll(/data-s="([a-zA-Z]+)"/g)].map(m => m[1]);
  assert.strictEqual(tabs.length, 5, "タブは5つ(増やさない方針)");
  for (const t of tabs) assert.strictEqual(E.SCREENS[t].tab, t, `タブ "${t}" が同名画面のタブとして登録されている`);
  for (const [n, d] of Object.entries(E.SCREENS))
    if (d.under) assert.ok(tabs.includes(d.under), `"${n}" の under "${d.under}" が実在するタブを指している`);
  console.log("画面レジストリOK", names.length, "画面 / タブ", tabs.length);

  // 画面切替と戻る(描画が例外を投げないこと)
  names.forEach(id => E.show(id));
  E.show("home");
  E.show("standings", { push: 1 });
  E.goBack();
  E.toast("テスト");
  console.log("画面切替OK");

  process.exit(0);
})().catch(e => { console.error("FAIL:", e); process.exit(1); });
