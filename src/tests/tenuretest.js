// 任期(キャリア1周 = 96節、延命で最大120節)の不変条件。→ docs/03 §3.2.3
// 要は「節で通算する」「大会の決着で着地する」「打ち手を選ばないと進めない」の3点。
const assert = require("assert");
const { setup } = require("./_setup");
const E = setup({ tmpName: "_tmp_tenuretest.js" });

/** 1シーズン走らせる(毎節ちゃんと打ち手を選ぶ)。 */
function runSeason(hand) {
  while (!E.seasonOver()) { E.pickHand(hand || "train"); E.playMatchday(); }
  return E.judgeSeason();
}

(async () => {
  // ---------- 打ち手を選ばないと試合に進めない ----------
  await E.newGame();
  E.getS().coach = "検証";
  E.startTenure("nordia-8");
  const node0 = E.getS().career.node;
  assert.strictEqual(E.playMatchday(), null, "打ち手が未選択なら playMatchday は進まない");
  assert.strictEqual(E.getS().career.node, node0, "節も進んでいない");
  assert.strictEqual(E.getS().world.matchday, 1, "リーグの節も進んでいない");
  E.pickHand("bond");
  assert.ok(E.playMatchday(), "打ち手を選べば進む");
  assert.strictEqual(E.getS().career.node, node0 + 1, "任期の節が1つ進む");
  assert.strictEqual(E.getS().career.hand, null, "打ち手は毎節選び直す");
  console.log("打ち手OK 未選択では進まない / 選べば進む / 翌節はリセット");

  // ---------- 記録が残る(カレンダーの過去行になる) ----------
  const e = E.getS().career.log[0];
  assert.strictEqual(e.hand, "bond", "打った手が記録される");
  assert.ok(e.opp && typeof e.gf === "number" && ["win", "draw", "lose"].includes(e.res),
    "対戦相手・スコア・結果が記録される");
  assert.strictEqual(e.node, node0, "通算の節番号が記録される");
  console.log("記録OK", "第" + e.node + "節 " + e.hand + " vs " + e.opp + " " + e.gf + "-" + e.ga + " " + e.res);

  // ---------- 任期は節で通算する(シーズンやクラブをまたいでも続く) ----------
  await E.newGame();
  E.getS().coach = "検証";
  let clubs = 0;
  for (let i = 0; i < 3; i++) {
    E.startTenure("nordia-" + (1 + i));
    clubs++;
    runSeason();
    E.getS().world.season++;
  }
  const C = E.getS().career;
  assert.strictEqual(C.node - 1, E.TUNING.league.rounds * 3, "3シーズン分の節が通算されている");
  assert.strictEqual(C.log.length, E.TUNING.league.rounds * 3, "全節が記録されている");
  assert.strictEqual(new Set(C.log.map(x => x.clubId)).size, clubs, "クラブをまたいで1本の記録になっている");
  console.log("通算OK", C.node - 1, "節 /", clubs, "クラブ / 記録", C.log.length, "件");

  // ---------- 上限に達するまでは任期は終わらない ----------
  assert.strictEqual(C.over, false, "上限前は任期が終わらない");
  assert.strictEqual(C.closing, false, "上限前は closing にならない");
  assert.strictEqual(C.limit, E.TUNING.tenure.limit, "上限は既定値のまま");

  // ---------- 上限に達したら、大会の決着で去就が決まる ----------
  // 96節ちょうどで打ち切らず、進行中のリーグが終わってから判定される。
  await E.newGame();
  E.getS().coach = "検証";
  E.startTenure("nordia-8");
  E.getS().career.node = E.TUNING.tenure.limit - 3;   // 残り3節の状態にする
  E.getS().club.expect = 8;
  let guard = 0;
  while (!E.seasonOver()) {
    E.pickHand("rest"); E.playMatchday();
    assert.ok(++guard < 30, "無限ループしていない");
  }
  const over = E.getS().career.node - 1;
  assert.ok(over > E.TUNING.tenure.limit, "上限を超えてもリーグは最後まで戦う: " + over + "節");
  assert.strictEqual(E.getS().career.closing, true, "上限到達で closing になる");
  const j = E.judgeSeason();
  assert.ok(j.tenure, "大会の決着で任期の去就が返る");
  if (j.tenure.extended) {
    assert.strictEqual(E.getS().career.limit, E.TUNING.tenure.limit + E.TUNING.tenure.extend, "延命で上限が伸びる");
    assert.strictEqual(E.getS().career.closing, false, "延命したら closing が解除される");
    assert.strictEqual(E.getS().career.over, false, "延命したら任期は続く");
    console.log("延命OK", j.rank + "位 → 上限", E.getS().career.limit, "節");
  } else {
    assert.strictEqual(E.getS().career.over, true, "延命しなければ任期終了");
    console.log("任期終了OK", j.rank + "位（" + E.TUNING.tenure.extendRank + "位以内なら延命）");
  }

  // ---------- 延命は上限120節で頭打ち ----------
  const s = E.getS();
  s.career.limit = E.TUNING.tenure.hardMax;
  s.career.closing = true; s.career.over = false;
  const j2 = E.judgeTenure(1);                        // 優勝しても
  assert.strictEqual(s.career.limit, E.TUNING.tenure.hardMax, "上限は " + E.TUNING.tenure.hardMax + " 節を超えない");
  assert.strictEqual(j2.extended, false, "頭打ちなら延命しない");
  assert.strictEqual(s.career.over, true, "頭打ちなら任期終了");
  console.log("頭打ちOK 最大", E.TUNING.tenure.hardMax, "節");

  // ---------- 節は「打ち手 → 出場する大会」の順で決まる ----------
  await E.newGame();
  E.getS().coach = "検証";
  E.startTenure("nordia-8");
  assert.ok(E.compsAvailable().includes("league"), "リーグの日程が残っていれば選べる");
  assert.strictEqual(E.pickComp("cup"), false, "未実装のカップは選べない");
  E.pickHand("train");
  assert.ok(E.playMatchday(), "大会未選択でもリーグに自動で寄せて進める(選択肢が1つのため)");
  assert.strictEqual(E.getS().career.comp, null, "翌節は大会も選び直す");

  // 先に予定が埋まっている節は、その大会しか選べない
  const s2 = E.getS();
  s2.career.plan[s2.career.node] = { comp: "cup", label: "大陸大会 準々決勝" };
  assert.deepStrictEqual(E.compsAvailable(), ["cup"], "予定が確定している節は他の大会を選べない");
  assert.strictEqual(E.pickComp("league"), false, "確定済みの節でリーグは選べない");
  delete s2.career.plan[s2.career.node];
  console.log("大会選択OK 予定確定の節は固定 / 未実装の大会は選べない");

  // 全日程を消化したらリーグは選べなくなる
  while (!E.seasonOver()) { E.pickHand("rest"); E.playMatchday(); }
  assert.ok(!E.compsAvailable().includes("league"), "リーグを消化しきったら選べない");
  console.log("消化後OK 選べる大会:", JSON.stringify(E.compsAvailable()));

  // ---------- 打ち手は3種そろっている ----------
  assert.strictEqual(E.HANDS.length, 3, "打ち手は3種(訓練/交流/休息)");
  assert.deepStrictEqual(E.HANDS.map(h => h.id), ["train", "bond", "rest"], "IDが仕様どおり");
  assert.strictEqual(E.pickHand("nope"), false, "存在しない打ち手は選べない");
  console.log("打ち手の定義OK", E.HANDS.map(h => h.icon + h.label).join(" / "));

  process.exit(0);
})().catch(e => { console.error("FAIL:", e); process.exit(1); });
