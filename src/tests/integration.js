// 土台の統合テスト: 新規作成 → 就任 → シーズン完走 → 審判 → 保存/読込 → 画面切替。
// 機能を足したら、この「1周できること」の流れに積み増していく。
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { setup } = require("./_setup");
const E = setup({ tmpName: "_tmp_integration.js" });

(async () => {
  // ---------- 新規データ ----------
  await E.newGame();
  const S = E.getS();
  assert.strictEqual(S.v, E.SAVE_VER, "新規データのスキーマ版が SAVE_VER と一致する");
  assert.ok(S.world.seed > 0, "世界のシードが決まっている");
  assert.strictEqual(S.club, null, "就任前はクラブが無い");
  assert.deepStrictEqual(S.player.coll, [], "コレクションは空から始まる");
  console.log("新規作成OK seed:", S.world.seed);

  // ---------- 就任 ----------
  S.coach = "C. モレッティ";
  E.startTenure("nordia-8");
  assert.strictEqual(S.club.id, "nordia-8", "就任クラブが設定される");
  assert.ok(S.club.loan.length >= 16, "クラブから選手を借りている(D13)");
  assert.strictEqual(S.squad.length, 11, "先発11枠が埋まる");
  assert.ok(S.squad.every(id => id !== null), "空き枠がない");
  assert.strictEqual(S.world.fixtures.length, E.TUNING.league.rounds, "14節の日程が組まれる");
  assert.ok(S.club.expect >= 1 && S.club.expect <= 8, "期待順位が提示される: " + S.club.expect + "位");
  // 就任直後はコレクションが空なので、先発は全員が貸与のはず(D13の狙い通りか)
  assert.strictEqual(E.squadCards().filter(c => S.player.coll.includes(c)).length, 0,
    "手持ちが無いうちは全員クラブからの貸与");
  console.log("就任OK", S.club.id, "/ 期待", S.club.expect, "位 / 貸与", S.club.loan.length, "人");

  // ---------- シーズン完走 ----------
  let guard = 0;
  while (!E.seasonOver()) {
    const f = E.myFixture();
    assert.ok(f, "第" + S.world.matchday + "節に自クラブの試合がある");
    E.pickHand("train");
    const out = E.playMatchday();
    assert.ok(out.my, "自クラブの結果が返る");
    assert.strictEqual(out.others.length, E.TUNING.league.clubs / 2 - 1, "同節の他会場も解決されている");
    assert.ok(++guard < 50, "節が進まず無限ループしていない");
  }
  assert.strictEqual(guard, E.TUNING.league.rounds, "14節すべて消化した");

  // 順位表の整合(全クラブが同数戦い、総得点と総失点が一致する)
  const rows = E.standings(S.world.table);
  assert.strictEqual(rows.length, 8, "順位表に8クラブ");
  let gf = 0, ga = 0;
  rows.forEach(r => {
    assert.strictEqual(r.w + r.d + r.l, 14, r.id + " が14試合こなしている");
    gf += r.gf; ga += r.ga;
  });
  assert.strictEqual(gf, ga, "リーグ全体の総得点と総失点が一致する");
  assert.strictEqual(rows[0].rank, 1, "順位が振られている");
  console.log("シーズン完走OK 優勝:", rows[0].id, rows[0].pts + "pts / 自クラブ:",
    E.rankOf(S.world.table, S.club.id) + "位 / コイン", S.club.coins);

  // ---------- 審判(続投 / 解任 / 名声) ----------
  const fameBefore = S.player.fame;
  const j = E.judgeSeason();
  assert.ok(typeof j.rank === "number" && typeof j.dismissed === "boolean", "審判の結果が返る");
  assert.strictEqual(S.player.fame, Math.max(0, fameBefore + j.fameGain), "名声が増減する");
  assert.strictEqual(S.player.history.length, 1, "キャリア履歴が残る");
  assert.ok(["続投", "解任"].includes(S.player.history[0].result), "在任結果が記録される");
  console.log("審判OK", j.rank + "位(期待" + S.club.expect + "位) / 名声",
    fameBefore, "→", S.player.fame, "/", S.player.history[0].result);

  // ---------- 編成の書き出し(将来の非同期対戦の前提 → §3.2.2) ----------
  const sq = E.exportSquad();
  assert.strictEqual(sq.cards.length, 11, "編成11人をカードの実体ごと書き出せる");
  assert.ok(sq.cards[0].ovr > 0 && sq.cards[0].name, "書き出したカードだけで選手を復元できる");
  console.log("編成の書き出しOK", sq.club, sq.form, sq.cards.length + "人");

  // ---------- 保存 → 読込 ----------
  await E.save(); await E.flushSave();
  const coins = S.club.coins, fame = S.player.fame;
  E.setS({ v: 0 });
  await E.loadGame();
  assert.strictEqual(E.getS().club.coins, coins, "クラブのコインが復元される");
  assert.strictEqual(E.getS().player.fame, fame, "名声が復元される");
  assert.strictEqual(E.getS().squad.length, 11, "編成が復元される");
  console.log("保存/読込OK coins:", coins, "/ fame:", fame);

  // 書き出し → 読み込み(端末移行の往復)
  const text = await E.exportSave();
  await E.importSave(text);
  await E.loadGame();
  assert.strictEqual(E.getS().club.coins, coins, "書き出したデータから復元される");
  await assert.rejects(() => E.importSave("これはJSONではない"), "壊れた入力は例外になる");

  // v1(平置き)のセーブが v2(player/club/world)へ移行できる
  await E.importSave(JSON.stringify({ v: 1, coach: "旧監督", coins: 500, teamName: "旧クラブ" }));
  await E.loadGame();
  assert.strictEqual(E.getS().v, E.SAVE_VER, "旧セーブが最新スキーマへ移行される");
  assert.strictEqual(E.getS().coach, "旧監督", "監督名は引き継がれる");
  assert.ok(E.getS().player && E.getS().world, "新しい入れ物が用意される");
  console.log("移行OK v1 → v" + E.SAVE_VER);

  E.deleteSave();
  assert.strictEqual(await E.hasSave(), false, "削除後はセーブが無い");

  // ---------- 画面レジストリ ↔ HTML(不変条件) ----------
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

  // ---------- 画面切替(描画が例外を投げないこと) ----------
  await E.newGame();
  E.getS().coach = "テスト監督";
  E.startTenure("nordia-8");
  names.forEach(id => E.show(id));
  E.show("home");
  E.show("standings", { push: 1 });
  E.goBack();
  console.log("画面切替OK");

  process.exit(0);
})().catch(e => { console.error("FAIL:", e); process.exit(1); });
