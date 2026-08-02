// 世界(クラブ・選手・日程)の不変条件。
// 選手はセーブに持たず seed から再生成するので、「同じシードなら必ず同じ顔ぶれ」が要。
const assert = require("assert");
const { setup } = require("./_setup");
const E = setup({ tmpName: "_tmp_worldtest.js" });

(async () => {
  // --- リーグ構成(→docs/03 §3.8) ---
  assert.strictEqual(E.LEAGUES.length, 6, "リーグは6つ");
  assert.strictEqual(E.CLUBS.length, 48, "クラブは 6リーグ × 8 = 48");
  for (const lg of E.LEAGUES)
    assert.strictEqual(E.clubsOf(lg.id).length, E.TUNING.league.clubs, lg.name + "は8クラブ");
  assert.deepStrictEqual([...E.LEAGUES].sort((a, b) => a.tier - b.tier).map(l => l.id),
    ["sam", "fra", "ger", "ita", "esp", "eng"], "リーグの格が階段になっている");
  assert.strictEqual(new Set(E.CLUBS.map(c => c.name)).size, 48, "クラブ名に重複が無い");

  // --- 国籍(→docs/03 §3.16) ---
  assert.strictEqual(E.NATIONS.length, 17, "国籍は17(実在16か国 + 日本)");
  assert.strictEqual(new Set(E.NATION_IDS).size, E.NATIONS.length, "国籍IDに重複が無い");
  for (const lg of E.LEAGUES) {
    const box = E.nationBox(lg);
    assert.ok(box.length > 0, lg.name + "の抽選箱が空でない");
    assert.strictEqual(new Set(box).size, E.NATIONS.length,
      lg.name + "はどの国籍からも選手が来うる");
    const homeShare = box.filter(n => n === lg.home).length / box.length;
    assert.ok(homeShare > 0.15 && homeShare < 0.75,
      lg.name + "の自国比率が極端でない: " + (homeShare * 100).toFixed(0) + "%");
  }
  assert.strictEqual(new Set(E.CLUBS.map(c => c.id)).size, 48, "クラブIDが重複しない");
  console.log("リーグ構成OK", E.LEAGUES.length, "リーグ /", E.CLUBS.length, "クラブ /",
    E.NATIONS.length, "国籍");

  // --- 選手生成の決定性(セーブに持たない前提の要) ---
  const a = E.clubRoster(12345, "sam-1");
  const b = E.clubRoster(12345, "sam-1");
  const c = E.clubRoster(99999, "sam-1");
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
  // 姓 — 同じクラブに同姓が並ぶと編成画面で見分けが付かない。
  // 国籍が混ざるので、姓は**ロスター全体で**重複させない(国籍ごとではなく)。
  {
    assert.deepStrictEqual(Object.keys(E.FAMILY).sort(), [...E.NATION_IDS].sort(),
      "姓のプールは国籍ごとに用意されている");
    for (const [nat, list] of Object.entries(E.FAMILY)) {
      assert.ok(list.length >= 20, nat + " の姓が20個以上ある: " + list.length);
      assert.strictEqual(new Set(list).size, list.length, nat + " の姓に重複が無い");
    }
    let worst = 0;
    const natSeen = new Set();
    for (const club of E.CLUBS) {
      const roster = E.clubRoster(12345, club.id);
      const fam = roster.map(c => c.name.split(" ").pop());
      worst = Math.max(worst, fam.length - new Set(fam).size);
      roster.forEach(c => natSeen.add(c.nation));
      // 選手の国籍は実在の16か国のいずれか
      roster.forEach(c => {
        assert.ok(E.nationById(c.nation), "国籍が実在する: " + c.nation);
        // 表示名の並び順は国籍が決める。姓は sur に持つので、末尾が姓とは限らない
        const nat = E.nationById(c.nation);
        assert.ok(c.sur, "姓を別に持っている: " + c.name);
        assert.strictEqual(nat.order === "east" ? c.name.split(" ")[0] : c.name.split(" ").pop(),
          c.sur, nat.name + "の並び順が正しい: " + c.name);
      });
    }
    assert.strictEqual(worst, 0, "どのクラブにも同姓が並ばない");
    assert.strictEqual(natSeen.size, E.NATIONS.length,
      "48クラブ全体ですべての国籍に選手がいる");
    console.log("  姓:", Object.values(E.FAMILY).flat().length, "個 /",
      E.CLUBS.length, "クラブすべてで同姓なし / 出現国籍", natSeen.size);
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
  // --- フォーメーション(→docs/03 §3.17) ---
  {
    const forms = Object.entries(E.FORMATIONS);
    assert.ok(forms.length >= 16, "陣形が16種以上ある: " + forms.length);
    assert.ok(E.FORMATIONS[E.DEFAULT_FORM], "既定の陣形が存在する");
    for (const [f, slots] of forms) {
      assert.strictEqual(slots.length, 11, f + " は11枠");
      assert.strictEqual(slots.filter(([p]) => p === "GK").length, 1, f + " のGKは1枠");
      for (const [sub, x, y] of slots) {
        assert.ok(E.subGroup(sub), f + " の枠 " + sub + " が実在する細分ポジション");
        assert.ok(x >= 8 && x <= 92, f + " の x が範囲内: " + sub + " " + x);
        // y は 13〜87。87を超えると名前帯がゴールラインの外へ出る(実測で確認済み)
        assert.ok(y >= 13 && y <= 87, f + " の y が範囲内: " + sub + " " + y);
      }
    }
    // 呼び名と枠の内訳が一致している("4-3-3" なら DF4/MF3/FW3)
    for (const [f, slots] of forms) {
      const m = f.match(/^(\d)-(\d)-(\d)$/);
      if (!m) continue;
      const n = { DF: 0, MF: 0, FW: 0 };
      slots.forEach(([sub]) => { const g = E.subGroup(sub); if (n[g] != null) n[g]++; });
      assert.deepStrictEqual([n.DF, n.MF, n.FW], m.slice(1).map(Number),
        f + " の枠の内訳が呼び名と一致する");
    }
    // 枠どうしが重ならないこと。1枠の描画は「ポジション名 + 丸 + 名前帯」で
    // 幅 最大56px / 高さ 約60px。ピッチ 354x472 に対して 15.8% / 12.7%。
    // **実測(drive.js)は名前の長さで結果が変わる**ので、座標の側で余裕を保証する。
    const SLOT_W = 15.8, SLOT_H = 12.7;
    for (const [f, slots] of forms) {
      for (let i = 0; i < slots.length; i++) for (let j = i + 1; j < slots.length; j++) {
        const dx = Math.abs(slots[i][1] - slots[j][1]);
        const dy = Math.abs(slots[i][2] - slots[j][2]);
        assert.ok(dx >= SLOT_W || dy >= SLOT_H,
          f + " の枠が近すぎる: " + slots[i][0] + "(" + slots[i][1] + "," + slots[i][2] + ")×"
          + slots[j][0] + "(" + slots[j][1] + "," + slots[j][2] + ") dx" + dx + " dy" + dy);
      }
    }
    console.log("  陣形:", forms.length, "種 / 11枠・GK1枠・y は 13〜87・枠が重ならない");
  }

  // 配置込みの編成力は、適性を無視した平均を上回らない
  {
    const form = Object.keys(E.FORMATIONS)[0], slots = E.FORMATIONS[form];
    const xi = a.slice(0, slots.length);
    assert.ok(E.squadPowerAt(xi, form) <= E.squadPower(xi),
      "配置込みの編成力は OVR 平均を超えない");
  }
  // 係数が実際に効いているか。不一致(0.50)は OVR で覆すのに2倍の差が要る。
  // ここが緩いと OVR がポジションを完全に食う(0.70 のとき実際に起きた)。
  assert.ok(1 / F.none >= 2, "不一致を OVR で覆すには2倍以上の差が要る");
  {
    // 32クラブぶんの自動編成を回して、配置の質を測る。
    //   ・GKがいる名簿でGK枠にGK以外を置かない
    //   ・不一致(0.50)の配置がほぼ出ない
    // main を none に近づけすぎると、高OVRの不一致が「メインのみ」を押しのけて増える。
    let wrongGK = 0, clubs = 0, slots = 0;
    const tier = { a: 0, b: 0, c: 0 };
    for (const club of E.CLUBS) {
      const roster = E.clubRoster(12345, club.id);
      const hasGK = roster.some(c => c.pos === "GK");
      const used = new Set();
      E.FORMATIONS["4-4-2"].forEach(([sub]) => {   // autoSquad と同じ貪欲法
        let best = null, bs = -1;
        for (const c of roster) {
          if (used.has(c.id)) continue;
          const v = E.slotFit(c, sub) * c.ovr;
          if (v > bs) { bs = v; best = c; }
        }
        if (!best) return;
        used.add(best.id); slots++; tier[E.fitTier(best, sub)]++;
        if (hasGK && sub === "GK" && best.pos !== "GK") wrongGK++;
      });
      clubs++;
    }
    assert.strictEqual(wrongGK, 0, "GKがいる名簿でGK枠にGK以外を置かない(" + clubs + "クラブ)");
    assert.ok(tier.c / slots < 0.02,
      "不一致の配置は2%未満: " + tier.c + "/" + slots);
    console.log("  自動編成:", clubs, "クラブ / 完全一致",
      (tier.a / slots * 100).toFixed(1) + "% ・メインのみ",
      (tier.b / slots * 100).toFixed(1) + "% ・不一致", tier.c, "件 / GK枠の誤り", wrongGK);
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
  const top = E.clubPower(12345, "eng-1"), bottom = E.clubPower(12345, "sam-8");
  assert.ok(top > bottom, "上位国の強豪(" + top + ")が下位国の弱小(" + bottom + ")より強い");
  console.log("戦力の階段OK eng-1:", top, "> sam-8:", bottom);

  // --- 日程(ホーム&アウェイの総当たり) ---
  const ids = E.clubsOf("sam").map(c => c.id);
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
  const weak = E.expectedRank(12345, "sam-8", 60);
  const strong = E.expectedRank(12345, "sam-8", 95);
  assert.ok(strong < weak, "強い編成を持ち込むと期待順位も上がる(" + weak + "位 → " + strong + "位)");
  console.log("期待順位OK 弱い編成:", weak, "位 / 強い編成:", strong, "位");

  // --- 名声のしきい値がキャリアの階段になっている ---
  assert.strictEqual(E.requiredFame(E.clubById("sam-8")), 0, "最下位リーグの弱小は名声0で就任できる");
  assert.ok(E.offersFor(0).length >= 3, "名声0でも就任先を選べる(選択肢が複数ある)");
  assert.ok(E.offersFor(0).length < E.CLUBS.length, "名声0では全クラブは開いていない");
  // 6リーグが名声の階段として順に開くこと(飛び級で上位リーグが先に開かない)
  {
    const byTier = [...E.LEAGUES].sort((a, b) => a.tier - b.tier);
    let prev = -1;
    for (const lg of byTier) {
      const min = Math.min(...E.clubsOf(lg.id).map(c => E.requiredFame(c)));
      assert.ok(min > prev, lg.name + " は下位リーグより後に開く: " + min);
      prev = min;
    }
    console.log("  リーグの解禁:", byTier.map(lg =>
      lg.name + " " + Math.min(...E.clubsOf(lg.id).map(c => E.requiredFame(c)))).join(" / "));
  }
  assert.strictEqual(E.offersFor(999999).length, E.CLUBS.length, "名声が十分なら全クラブが開く");
  console.log("名声の階段OK 名声0:", E.offersFor(0).length, "クラブ / 上限:", E.CLUBS.length);

  process.exit(0);
})().catch(e => { console.error("FAIL:", e); process.exit(1); });
