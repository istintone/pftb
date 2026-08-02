// 世界(クラブ・選手・日程)の不変条件。
// 選手はセーブに持たず seed から再生成するので、「同じシードなら必ず同じ顔ぶれ」が要。
const assert = require("assert");
const { setup } = require("./_setup");
const E = setup({ tmpName: "_tmp_worldtest.js" });

(async () => {
  // --- クラブ構成 ---
  assert.strictEqual(E.COUNTRIES.length, 4, "国は4つ");
  assert.strictEqual(E.CLUBS.length, 32, "クラブは 4カ国 × 8 = 32");
  for (const co of E.COUNTRIES)
    assert.strictEqual(E.clubsOf(co.id).length, E.TUNING.league.clubs, co.name + "は8クラブ");
  assert.strictEqual(new Set(E.CLUBS.map(c => c.id)).size, 32, "クラブIDが重複しない");
  console.log("クラブ構成OK", E.COUNTRIES.length, "カ国 /", E.CLUBS.length, "クラブ");

  // --- 選手生成の決定性(セーブに持たない前提の要) ---
  const a = E.clubRoster(12345, "nordia-1");
  const b = E.clubRoster(12345, "nordia-1");
  const c = E.clubRoster(99999, "nordia-1");
  assert.deepStrictEqual(a.map(x => x.name + x.ovr), b.map(x => x.name + x.ovr), "同じシードなら同じ選手");
  assert.notDeepStrictEqual(a.map(x => x.name), c.map(x => x.name), "シードが違えば違う選手");
  assert.ok(a.length >= 16, "1クラブ16人以上");
  assert.ok(a.filter(x => x.pos === "GK").length >= 2, "GKが2人以上いる");
  for (const p of a) {
    // OVR は6能力の合計(最大120)
    assert.strictEqual(p.ovr, E.calcOvr(p.pos, p), "OVRが6能力の合計と一致する: " + p.name);
    assert.strictEqual(p.ovr, E.STAT_KEYS.reduce((s, k) => s + p[k], 0), "合計の定義どおり");
    assert.ok(p.ovr <= E.OVR_MAX, "OVRが上限 " + E.OVR_MAX + " を超えない: " + p.ovr);
    for (const k of E.STAT_KEYS) {
      assert.ok(p[k] >= 1 && p[k] <= E.STAT_MAX, k + " が 1〜" + E.STAT_MAX + " に収まる: " + p[k]);
    }
    // サブポジションは複数持て、プライマリは必ずメインの側から選ばれる
    assert.ok(Array.isArray(p.subs) && p.subs.length >= 1, "サブポジションを持つ");
    assert.strictEqual(E.subGroup(p.subs[0]), p.pos, "プライマリがメインと一致する: " + p.subs[0] + " / " + p.pos);
    assert.strictEqual(new Set(p.subs).size, p.subs.length, "サブポジションが重複しない");
    assert.ok(p.skills.length >= 1, "スキルが1つ以上");
    assert.ok(p.age >= 18 && p.age <= 34, "年齢が範囲内");
  }
  const multi = a.filter(p => p.subs.length > 1).length;
  const cross = a.filter(p => p.subs.some(s => E.subGroup(s) !== p.pos)).length;
  console.log("  複数サブ:", multi, "/", a.length, "人 / 大分類をまたぐサブ持ち:", cross, "人");
  // 枠適性(→docs/03 §3.14): サブ一致 > メインのみ > 不一致 の3段
  const F = E.TUNING.fit;
  assert.ok(F.sub > F.main && F.main > F.none, "3段が階段になっている");
  const sample = a.find(p => p.subs.length > 1);
  if (sample) {
    // プライマリと他のサブは**区別しない**。どちらも本来の力が出る
    sample.subs.forEach(sub =>
      assert.strictEqual(E.slotFit(sample, sub), F.sub, "サブ一致はどれも " + F.sub));
    // 同じ大分類の、本人が持っていない枠 → メインのみ一致
    const otherSub = E.SUBPOS[sample.pos].find(s => !sample.subs.includes(s));
    if (otherSub) assert.strictEqual(E.slotFit(sample, otherSub), F.main, "メインのみ一致");
    // 大分類ごと違う枠 → 不一致
    const alien = E.SUBPOS[["GK", "DF", "MF", "FW"].find(g => g !== sample.pos)][0];
    assert.strictEqual(E.slotFit(sample, alien), F.none, "サブもメインも不一致");
  }
  // 配置込みの編成力は、適性を無視した平均を上回らない
  {
    const form = Object.keys(E.FORMATIONS)[0], slots = E.FORMATIONS[form];
    const xi = a.slice(0, slots.length);
    assert.ok(E.squadPowerAt(xi, form) <= E.squadPower(xi),
      "配置込みの編成力は OVR 平均を超えない");
  }
  console.log("選手生成OK 決定的 / OVR整合 / 例:", a[0].name, a[0].pos, a[0].ovr);

  // --- レアリティ(D18) ---
  const keys = Object.keys(E.RARITY);
  assert.deepStrictEqual(keys, ["STD", "REG", "SPE", "WC", "LEG"], "5段(監督から見た役割で分かれる)");
  // 段が上がるほど OVR 帯・スキル数が下がらない(階段になっている)
  for (let i = 1; i < keys.length; i++) {
    const lo = E.RARITY[keys[i - 1]], hi = E.RARITY[keys[i]];
    assert.ok(hi.ovr[0] >= lo.ovr[0] && hi.ovr[1] >= lo.ovr[1], keys[i] + " の OVR 帯が下がらない");
    assert.ok(hi.skills >= lo.skills, keys[i] + " のスキル数が減らない");
  }
  // 実在選手の段はパックから出ない(手で定義するデータ)
  for (const k of keys) {
    const r = E.RARITY[k];
    assert.strictEqual(r.w > 0, !r.real, k + " は " + (r.real ? "実在選手なのでパックから出ない" : "パックから出る"));
    assert.ok(r.ovr[1] <= E.OVR_MAX, k + " の上限が OVR_MAX を超えない");
  }
  // 大量に引いて、出るのは自動生成の段だけ・比率が重みどおりか
  const rngR = E.mulberry32(3), got = {};
  const roster = [];
  for (let i = 0; i < 400; i++) roster.push(E.makeCard(rngR, "MF"));
  roster.forEach(c => got[c.rarity] = (got[c.rarity] || 0) + 1);
  for (const k of keys) {
    if (E.RARITY[k].real) assert.ok(!got[k], k + " はパックから出ていない");
  }
  assert.ok(got.STD > got.REG && got.REG > got.SPE, "排出比が STD > REG > SPE の順");
  roster.forEach(c => assert.strictEqual(c.skills.length, E.RARITY[c.rarity].skills, "スキル数が段の定義どおり"));
  console.log("レアリティOK", keys.map(k => k + ":" + (got[k] || 0)).join(" / "), "(400枚)");

  // --- クラブの格と戦力が相関する ---
  const top = E.clubPower(12345, "garia-1"), bottom = E.clubPower(12345, "nordia-8");
  assert.ok(top > bottom, "上位国の強豪(" + top + ")が下位国の弱小(" + bottom + ")より強い");
  console.log("戦力の階段OK garia-1:", top, "> nordia-8:", bottom);

  // --- 日程(ホーム&アウェイの総当たり) ---
  const ids = E.clubsOf("nordia").map(c => c.id);
  const fx = E.makeFixtures(ids, E.mulberry32(7));
  assert.strictEqual(fx.length, E.TUNING.league.rounds, "14節");
  const count = {}, pairs = {};
  ids.forEach(i => (count[i] = { n: 0, h: 0 }));
  fx.forEach(round => {
    assert.strictEqual(round.length, ids.length / 2, "各節で全クラブが試合をする(休みが出ない)");
    const seen = new Set();
    round.forEach(m => {
      assert.ok(!seen.has(m.h) && !seen.has(m.a), "同じ節に同じクラブが2回出ない");
      seen.add(m.h); seen.add(m.a);
      count[m.h].n++; count[m.h].h++; count[m.a].n++;
      const k = m.h + ">" + m.a;
      pairs[k] = (pairs[k] || 0) + 1;
    });
  });
  ids.forEach(i => {
    assert.strictEqual(count[i].n, 14, i + " は14試合");
    assert.strictEqual(count[i].h, 7, i + " はホーム7試合");
  });
  Object.entries(pairs).forEach(([k, n]) => assert.strictEqual(n, 1, k + " の対戦は1回だけ"));
  assert.strictEqual(Object.keys(pairs).length, 56, "全組み合わせ 8×7 = 56");
  console.log("日程OK", fx.length, "節 / 各クラブ14試合(H7 A7) / 重複なし");

  // --- 期待順位は持ち込んだ編成の強さを見る(→docs/03 §3.9) ---
  const weak = E.expectedRank(12345, "nordia-8", 60);
  const strong = E.expectedRank(12345, "nordia-8", 95);
  assert.ok(strong < weak, "強い編成を持ち込むと期待順位も上がる(" + weak + "位 → " + strong + "位)");
  console.log("期待順位OK 弱い編成:", weak, "位 / 強い編成:", strong, "位");

  // --- 名声のしきい値がキャリアの階段になっている ---
  assert.strictEqual(E.requiredFame(E.clubById("nordia-8")), 0, "最下位国の弱小は名声0で就任できる");
  assert.ok(E.offersFor(0).length >= 3, "名声0でも就任先を選べる(選択肢が複数ある)");
  assert.ok(E.offersFor(0).length < E.CLUBS.length, "名声0では全クラブは開いていない");
  assert.strictEqual(E.offersFor(999999).length, E.CLUBS.length, "名声が十分なら全クラブが開く");
  console.log("名声の階段OK 名声0:", E.offersFor(0).length, "クラブ / 上限:", E.CLUBS.length);

  process.exit(0);
})().catch(e => { console.error("FAIL:", e); process.exit(1); });
