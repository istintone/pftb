// ハング耐性: ストレージが永久に応答しない環境でも起動処理が止まらないこと。
// (window.storage.get/set が解決しない → withTimeout で打ち切って既定データで続行する)
const assert = require("assert");
const { setup } = require("./_setup");
const E = setup({ storageHang: true, timeoutDiv: 10, tmpName: "_tmp_hangtest.js" });

(async () => {
  const t0 = Date.now();
  const done = await Promise.race([
    (async () => { await E.loadGame(); await E.flushSave(); return "ok"; })(),
    E._wait(5000).then(() => "timeout"),
  ]);
  assert.strictEqual(done, "ok", "ストレージ無応答でも loadGame が完了する");
  assert.strictEqual(E.getS().v, E.SAVE_VER, "既定データで起動できている");
  console.log("ハング耐性OK", (Date.now() - t0) + "ms");
  process.exit(0);
})().catch(e => { console.error("FAIL:", e); process.exit(1); });
