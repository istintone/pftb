// 土台の統合テスト: 新規作成 → 保存 → 読み込み → 書き出し/読み込み → 画面切替。
// ゲームロジックを足したら、この流れの中に「1周プレイできること」を積み増していく。
const assert = require("assert");
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

  // 画面切替(描画が例外を投げないこと)
  ["home", "team", "title"].forEach(id => E.show(id));
  E.toast("テスト");
  console.log("画面切替OK");

  process.exit(0);
})().catch(e => { console.error("FAIL:", e); process.exit(1); });
