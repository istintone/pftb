// 世界(クラブ・選手・日程)の不変条件。
// 選手はセーブに持たず seed から再生成するので、「同じシードなら必ず同じ顔ぶれ」が要。
const assert = require("assert");
const { setup } = require("./_setup");
const E = setup({ tmpName: "_tmp_worldtest.js" });

(async () => {
  // --- リーグ構成(→docs/03 §3.8) ---
  assert.strictEqual(E.LEAGUES.length, 6, "リーグは6つ");
  assert.strictEqual(E.CLUBS.length, 144, "クラブは 6リーグ × 3部 × 8 = 144");
  for (const lg of E.LEAGUES) {
    assert.strictEqual(E.clubsOf(lg.id).length, 24, lg.name + "は3部で24クラブ");
    for (const d of E.DIVS)
      assert.strictEqual(E.clubsOfDiv(lg.id, d).length, E.TUNING.league.clubs,
        lg.name + " " + E.divName(d) + "は8クラブ");
  }
  assert.deepStrictEqual([...E.LEAGUES].sort((a, b) => a.tier - b.tier).map(l => l.id),
    ["sam", "fra", "ger", "ita", "esp", "eng"], "リーグの格が階段になっている");
  assert.strictEqual(new Set(E.CLUBS.map(c => c.name)).size, 144, "クラブ名に重複が無い");

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
  assert.strictEqual(new Set(E.CLUBS.map(c => c.id)).size, 144, "クラブIDが重複しない");
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
      // **姓は sur を見る**。並び順が east の国籍だと表示名の末尾は名になるので、
      // 表示名から取ると「姓が同じ」ではないものまで衝突として数えてしまう
      const fam = roster.map(c => c.sur);
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
      E.CLUBS.length + "クラブ全体ですべての国籍に選手がいる");
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
    const byDiv = {};
    const tier = { a: 0, b: 0, c: 0 };
    for (const club of E.CLUBS) {
      const roster = E.clubRoster(12345, club.id);
      const hasGK = roster.some(c => c.pos === "GK");
      // **本番と同じ埋め方で測る**(→docs/03 §3.38)。テスト側で貪欲法を書き写すと、
      // 実装を直したときに検査だけが古いまま残る(実際に左右の偏りを見落とした)
      const xi = E.bestXI(roster, "4-4-2");
      E.FORMATIONS["4-4-2"].forEach(([sub], ix) => {
        const best = xi[ix];
        if (!best) return;
        slots++; tier[E.fitTier(best, sub)]++;
        byDiv[club.div] = byDiv[club.div] || { n: 0, c: 0 };
        byDiv[club.div].n++; if (E.fitTier(best, sub) === "c") byDiv[club.div].c++;
        if (hasGK && sub === "GK" && best.pos !== "GK") wrongGK++;
      });
      clubs++;
    }
    assert.strictEqual(wrongGK, 0, "GKがいる名簿でGK枠にGK以外を置かない(" + clubs + "クラブ)");
    // **下の部ほど名簿が薄く**、枠にぴったりの選手が居ないことが増える。
    // 3%を超えるようなら生成側(ポジション配分)を疑う
    assert.ok(tier.c / slots < 0.03,
      "不一致の配置は3%未満: " + tier.c + "/" + slots);
    console.log("  部ごとの不一致:", E.DIVS.map(d =>
      E.divName(d) + " " + (byDiv[d].c / byDiv[d].n * 100).toFixed(1) + "%").join(" / "));
    {
      // **左右で不利が出ない**こと(→docs/03 §3.38)。枠の順に貪欲だと、先に並んだ枠が
      // 得をする。実測で LSB 72.5 に対し RSB 66.5 まで開いていた
      const per = {};
      for (const club of E.CLUBS) {
        const form = "4-4-2", xi = E.bestXI(E.clubRoster(12345, club.id), form);
        E.FORMATIONS[form].forEach(([sub], ix) => {
          if (!xi[ix]) return;
          const t = per[sub] || (per[sub] = { n: 0, ovr: 0, a: 0 });
          t.n++; t.ovr += xi[ix].ovr; if (E.fitTier(xi[ix], sub) === "a") t.a++;
        });
      }
      for (const [l, r] of [["LSB", "RSB"], ["LMF", "RMF"]]) {
        const L = per[l], R = per[r];
        const d = Math.abs(L.ovr / L.n - R.ovr / R.n);
        assert.ok(d < 1.5, l + " と " + r + " に入る選手の質がほぼ同じ: "
          + (L.ovr / L.n).toFixed(1) + " / " + (R.ovr / R.n).toFixed(1)
          + "(差 " + d.toFixed(1) + ")");
        assert.ok(Math.abs(L.a / L.n - R.a / R.n) < 0.08,
          l + " と " + r + " の適性一致率がほぼ同じ: "
          + (L.a / L.n * 100).toFixed(0) + "% / " + (R.a / R.n * 100).toFixed(0) + "%");
      }
      console.log("  左右の均等:", ["LSB", "RSB", "LMF", "RMF"]
        .map(k => k + " " + (per[k].ovr / per[k].n).toFixed(1)).join(" / "));
    }
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
    assert.strictEqual(r.w > 0, !r.real, k + " は " + (r.real ? "既定の重みでは出ない" : "パックから出る"));
    assert.ok(r.ovr[1] <= E.OVR_MAX, k + " の上限が OVR_MAX を超えない");
  }
  // 大量に引いて、出るのは自動生成の段だけ・比率が重みどおりか
  const rngR = E.mulberry32(3), got = {};
  const roster = [];
  for (let i = 0; i < 400; i++) roster.push(E.makeCard(rngR, "MF"));
  roster.forEach(c => got[c.rarity] = (got[c.rarity] || 0) + 1);
  for (const k of keys) {
    if (E.RARITY[k].real) assert.ok(!got[k], k + " は既定の重みでは出ていない");
  }
  assert.ok(got.STD > got.REG && got.REG > got.SPE, "排出比が STD > REG > SPE の順");
  roster.forEach(c => assert.strictEqual(c.skills.length, E.RARITY[c.rarity].skills, "スキル数が段の定義どおり"));
  console.log("レアリティOK", keys.map(k => k + ":" + (got[k] || 0)).join(" / "), "(400枚)");

  // --- クラブの格と戦力が相関する ---
  const top = E.clubPower(12345, "eng-1"), bottom = E.clubPower(12345, "sam-24");
  assert.ok(top > bottom, "上位国の強豪(" + top + ")が下位国の弱小(" + bottom + ")より強い");
  // **部の段差がリーグの段差より大きい**(昇格したら相手が強くなったと分かる)
  {
    const d1 = E.clubPower(12345, "sam-1"), d2 = E.clubPower(12345, "sam-9"),
          d3 = E.clubPower(12345, "sam-17");
    assert.ok(d1 > d2 && d2 > d3, "部が上がるほど強い: " + d1 + " > " + d2 + " > " + d3);
    console.log("  部の階段: DIV1", d1, "> DIV2", d2, "> DIV3", d3);
  }
  console.log("戦力の階段OK eng-1:", top, "> sam-24:", bottom);

  // --- 能力は天井(20)に張り付かない(→docs/03 §3.27) ---
  {
    const K=E.STAT_KEYS, MAX=E.STAT_MAX;
    // どの重みも 1.35 以下 / pow・tec・spd は 1.20 以下 / 各行の合計は 6.0
    const W=E.STAT_W;
    for(const pos of Object.keys(W)){
      const w=W[pos];
      assert.ok(Math.abs(w.reduce((s,v)=>s+v,0)-K.length)<1e-9, pos+" の重みの合計が6.0");
      assert.ok(Math.max(...w)<=1.35, pos+" の主能力の重みが1.35以下: "+Math.max(...w));
      // pow/tec/spd は**主能力でない限り**1.20まで(主能力より先に頭打ちにさせない)
      const primary=w.indexOf(Math.max(...w));
      ["pow","tec","spd"].forEach(k=>{
        const i=K.indexOf(k);
        if(i!==primary)assert.ok(w[i]<=1.20, pos+" の "+k+" が1.20以下: "+w[i]);
      });
      // 20 に届くのは LEGENDS の頂点あたり
      assert.ok(Math.round(E.OVR_MAX/Math.max(...w))>=E.RARITY.WC.ovr[1],
        pos+" は WORLD CLASS の帯では20に届かない");
    }
    // **とがり(最大能力−最小能力)が段を上がるほど大きくなる**。
    // 途中で丸くなるなら、それは天井に当たっている印
    const sharp=r=>{
      const rng=E.mulberry32(31); let sum=0, pin=0, n=600;
      for(let i=0;i<n;i++){
        const c=E.makeCard(rng,["GK","DF","MF","FW"][i%4],{rarity:r});
        const v=K.map(k=>c[k]);
        sum+=Math.max(...v)-Math.min(...v);
        pin+=v.filter(x=>x>=MAX).length;
      }
      return { sharp:sum/n, pin:pin/n };
    };
    const got=E.RAR_KEYS.map(r=>({ r, ...sharp(r) }));
    for(let i=1;i<got.length;i++)
      assert.ok(got[i].sharp>got[i-1].sharp,
        got[i].r+" は "+got[i-1].r+" より尖っている: "
        +got[i-1].sharp.toFixed(1)+" → "+got[i].sharp.toFixed(1));
    assert.ok(got[0].pin<0.02, "STANDARD は天井に触れない");
    assert.ok(got[3].pin<0.5, "WORLD CLASS でも天井は例外的: "+got[3].pin.toFixed(2));
    console.log("  とがり:", got.map(g=>g.r+" "+g.sharp.toFixed(1)).join(" → "));
    console.log("  20張り付き(6能力中):", got.map(g=>g.r+" "+g.pin.toFixed(2)).join(" / "));
  }

  // --- 部ごとの編成の内訳(→docs/03 §3.25) ---
  {
    const share=(lgid,d)=>{
      const got={};
      E.clubsOfDiv(lgid,d).forEach(c=>E.clubRoster(4242,c.id)
        .forEach(x=>got[x.rarity]=(got[x.rarity]||0)+1));
      return got;
    };
    // DIV3 は STANDARD + REGULAR だけ。SPECIALS 以上は出てこない
    const d3=share("sam",3);
    assert.ok(!d3.SPE&&!d3.WC&&!d3.LEG, "DIV3 は STD/REG のみ: "+JSON.stringify(d3));
    assert.ok(d3.STD>d3.REG, "DIV3 は STANDARD が主体");
    // DIV2 は REGULAR/SPECIALS 中心で、WORLD CLASS が各クラブ1人
    const d2=share("sam",2);
    assert.strictEqual(d2.WC, E.TUNING.league.clubs, "DIV2 は1クラブに WC が1人");
    assert.ok(d2.REG>d2.STD&&d2.SPE>0, "DIV2 は REG/SPE 中心: "+JSON.stringify(d2));
    // DIV1 は SPECIALS と WORLD CLASS 中心。**国の格が上がるほど WC が増える**
    const wcOf=lgid=>share(lgid,1).WC||0;
    const byTier=[...E.LEAGUES].sort((a,b)=>a.tier-b.tier).map(l=>l.id);
    let prev=-1;
    for(const id of byTier){
      const n=wcOf(id);
      assert.ok(n>prev, id+" は下位リーグより WC が多い: "+n);
      prev=n;
    }
    const d1=share("sam",1);
    assert.ok(!d1.STD, "DIV1 に STANDARD は居ない");
    assert.ok(d1.SPE>d1.WC, "カンピオナート DIV1 は SPECIALS 多め: "+JSON.stringify(d1));
    const eng1=share("eng",1);
    assert.ok(eng1.WC>eng1.SPE, "プレミア DIV1 は WORLD CLASS がほとんど: "+JSON.stringify(eng1));
    console.log("  部の編成: DIV3", JSON.stringify(d3), "/ DIV2", JSON.stringify(d2));
    console.log("  DIV1 の WC 枚数(格の順):", byTier.map(id=>
      E.leagueById(id).name+" "+wcOf(id)).join(" / "));
  }

  // --- 日程(ホーム&アウェイの総当たり) ---
  const ids = E.clubsOfDiv("sam", 1).map(c => c.id);
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
  E.getS().world.divs = E.makeDivs("sam"); E.getS().world.div = 1;
  const weak = E.expectedRank(12345, "sam-8", 60);
  const strong = E.expectedRank(12345, "sam-8", 95);
  assert.ok(strong < weak, "強い編成を持ち込むと期待順位も上がる(" + weak + "位 → " + strong + "位)");
  console.log("期待順位OK 弱い編成:", weak, "位 / 強い編成:", strong, "位");

  // --- 名声のしきい値がキャリアの階段になっている ---
  assert.strictEqual(E.requiredFame(E.clubById("sam-24")), 0,
    "最下位リーグ最下部の弱小は名声0で就任できる");
  assert.ok(E.requiredFame(E.clubById("sam-1")) > E.requiredFame(E.clubById("sam-17")),
    "同じリーグでも上の部ほど名声が要る");
  assert.ok(E.offersFor(0).length >= 3, "名声0でも就任先を選べる(選択肢が複数ある)");
  assert.ok(E.offersFor(0).length < E.CLUBS.length, "名声0では全クラブは開いていない");
  // 6リーグが名声の階段として順に開くこと(飛び級で上位リーグが先に開かない)
  {
    const byTier = [...E.LEAGUES].sort((a, b) => a.tier - b.tier);
    let prev = -1;
    for (const lg of byTier) {
      const min = Math.min(...E.clubsOfDiv(lg.id, 3).map(c => E.requiredFame(c)));
      assert.ok(min > prev, lg.name + " は下位リーグより後に開く: " + min);
      prev = min;
    }
    console.log("  リーグの解禁(DIV3):", byTier.map(lg =>
      lg.name + " " + Math.min(...E.clubsOfDiv(lg.id, 3).map(c => E.requiredFame(c)))).join(" / "));
  }
  assert.strictEqual(E.offersFor(999999).length, E.CLUBS.length, "名声が十分なら全クラブが開く");
  console.log("名声の階段OK 名声0:", E.offersFor(0).length, "クラブ / 上限:", E.CLUBS.length);

  process.exit(0);
})().catch(e => { console.error("FAIL:", e); process.exit(1); });
