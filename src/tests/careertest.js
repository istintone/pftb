// キャリアのバランス検証: 複数シーズンを回して、評価と名声が設計どおりに振る舞うか見る。
// 期待順位ちょうどで終えたら評価は動かない(→docs/03 §3.9)、というのが一番の要。
const assert = require("assert");
const { setup } = require("./_setup");
const E = setup({ tmpName: "_tmp_careertest.js" });

/** 1シーズン走らせて結果を返す。 */
function runSeason() {
  while (!E.seasonOver()) { E.pickHand("train"); E.playMatchday(); }
  const expect = E.getS().club.expect;
  const j = E.judgeSeason();
  return { ...j, expect };
}

(async () => {
  // ---------- 評価は「期待との差」から対称に決まる ----------
  // 累積式だと、期待1位のクラブは減る一方・期待最下位のクラブは決してクビにならない、
  // という非対称が生まれる。順位に依らず対称であることをここで守る。
  await E.newGame();
  E.getS().coach = "検証";
  let matched = 0, checked = 0, aboveSeen = 0, belowSeen = 0;
  for (let i = 0; i < 16; i++) {
    E.startTenure("sam-" + (1 + (i % 8)));
    const r = runSeason();
    const ev = E.getS().club.eval;
    if (r.rank === r.expect) {
      matched++;
      assert.ok(Math.abs(ev - E.TUNING.eval.start) < 1,
        "期待順位ちょうど(" + r.rank + "位)なら評価は基準値のまま: " + ev);
    } else if (r.rank < r.expect) {
      aboveSeen++;
      assert.ok(ev > E.TUNING.eval.start, "期待を上回れば基準値より上: " + r.rank + "位/期待" + r.expect + "位 → " + ev);
    } else {
      belowSeen++;
      assert.ok(ev < E.TUNING.eval.start, "期待を下回れば基準値より下: " + r.rank + "位/期待" + r.expect + "位 → " + ev);
    }
    checked++;
    E.getS().world.season++;
  }
  assert.ok(aboveSeen > 0 && belowSeen > 0, "上振れも下振れも観測できている");
  console.log("評価の対称性OK", checked, "シーズン(ちょうど", matched, "/ 上回り", aboveSeen, "/ 下回り", belowSeen, ")");

  // ---------- 期待を大きく上回れば評価も名声も上がる ----------
  await E.newGame();
  E.getS().coach = "検証";
  E.startTenure("sam-8");                 // 弱小クラブ
  E.getS().club.expect = 8;                  // 最下位を期待されている状態にする
  const fame0 = E.getS().player.fame, eval0 = E.getS().club.eval;
  runSeason();
  const rank = E.rankOf(E.getS().world.table, "sam-8");
  if (rank < 8) {
    assert.ok(E.getS().club.eval >= eval0, "期待を上回れば評価は下がらない");
    assert.ok(E.getS().player.fame > fame0, "期待を上回れば名声が増える");
    console.log("上振れOK", rank + "位(期待8位) / 評価", Math.round(eval0), "→", Math.round(E.getS().club.eval),
      "/ 名声", fame0, "→", E.getS().player.fame);
  } else console.log("上振れ検証: 今回は8位のままだった(乱数依存のためスキップ)");

  // ---------- 期待を大きく下回れば解任されうる ----------
  await E.newGame();
  E.getS().coach = "検証";
  E.startTenure("sam-8");
  E.getS().club.expect = 1;                  // 優勝を期待されている状態にする(弱小なので届かない)
  const r2 = runSeason();
  assert.ok(E.getS().club.eval < E.TUNING.eval.start, "期待を下回れば評価が落ちる");
  assert.strictEqual(r2.dismissed, E.getS().club.eval < E.TUNING.eval.floorDismiss, "解任判定が閾値と一致する");
  console.log("下振れOK", r2.rank + "位(期待1位) / 評価", Math.round(E.getS().club.eval),
    "/", r2.dismissed ? "解任" : "続投");

  // ---------- 名声が上がるとキャリアの階段が開く ----------
  const s = E.getS();
  s.player.fame = 0;
  const low = E.offersFor(s.player.fame).length;
  s.player.fame = 5000;
  const high = E.offersFor(s.player.fame).length;
  assert.ok(high > low, "名声が上がると就任できるクラブが増える(" + low + " → " + high + ")");
  console.log("キャリアの階段OK 名声0:", low, "クラブ / 名声5000:", high, "クラブ");

  // ---------- 試合結果の分布が極端でない(→docs/07 §7.5) ----------
  // 互角の2チームを2000試合。実在の水準(1試合 約2.7点 / 引き分け 約25%)に近いか。
  {
    const side = id => {
      const roster = E.clubRoster(4242, id);
      const form = "4-4-2";
      return { cards: E.bestXI(roster, form), form, name: id };
    };
    const h = side("ger-4"), a = side("ger-4");   // 同じ編成同士 = 完全な互角
    let goals = 0, draws = 0, homeW = 0, n = 2000;
    for (let i = 0; i < n; i++) {
      const { hg, ag } = E.resolveMatch(h, a, i + 1);
      goals += hg + ag;
      if (hg === ag) draws++; else if (hg > ag) homeW++;
    }
    const avg = goals / n, drawPct = draws / n, homePct = homeW / n;
    assert.ok(avg > 1.5 && avg < 5.0, "1試合の平均得点が現実的な範囲: " + avg.toFixed(2));
    assert.ok(drawPct > 0.08 && drawPct < 0.45, "引き分けの割合が極端でない: " + (drawPct * 100).toFixed(1) + "%");
    assert.ok(homePct > drawPct * 0.5, "ホームがある程度勝ち越す: " + (homePct * 100).toFixed(1) + "%");
    console.log("試合結果の分布OK 平均", avg.toFixed(2), "点 / 引き分け",
      (drawPct * 100).toFixed(1) + "% / ホーム勝率", (homePct * 100).toFixed(1) + "%");
  }

  // ---------- 同じたねなら必ず同じ試合になる(見せかけを排する前提 → docs/07 §7.1) ----------
  {
    const side = id => {
      const roster = E.clubRoster(4242, id);
      return { cards: E.bestXI(roster, "4-3-3"), form: "4-3-3", name: id };
    };
    const a = E.simulateMatch(side("eng-1"), side("sam-8"), 12345);
    const b = E.simulateMatch(side("eng-1"), side("sam-8"), 12345);
    assert.strictEqual(a.hg + "-" + a.ag, b.hg + "-" + b.ag, "同じたね → 同じスコア");
    assert.strictEqual(JSON.stringify(a.events), JSON.stringify(b.events), "同じたね → 同じイベント列");
    const c = E.simulateMatch(side("eng-1"), side("sam-8"), 12346);
    assert.notStrictEqual(JSON.stringify(a.events), JSON.stringify(c.events), "たねが違えば別の試合");
    console.log("決定性OK", a.hg + "-" + a.ag, "/ イベント", a.events.length, "件");
  }

  // ---------- モメンタムが起点の高さを決める(D26 → docs/07 §7.8/§7.9) ----------
  {
    const side = id => {
      const roster = E.clubRoster(4242, id);
      return { cards: E.bestXI(roster, "4-4-2"), form: "4-4-2", name: id };
    };
    // キックオフ: 強いチームが前から始められる
    const strong = E.createMatch(side("eng-1"), side("sam-8"), 1);
    const even = E.createMatch(side("ger-4"), side("ger-4"), 1);
    assert.ok(strong.mom > 0.2, "強豪はキックオフ時点で勢いを持つ: " + strong.mom.toFixed(2));
    assert.strictEqual(even.mom, 0, "同じ編成どうしは互角で始まる");
    assert.ok(Math.abs(strong.mom) <= E.TUNING.mom.kickCap, "初期値は上限で抑える");

    // 起点の高さがモメンタムで動く。押されていればDF、勢いがあればFWから始まる
    const bucket = { lo: {}, mid: {}, hi: {} };
    const H = side("ger-4"), A = side("ger-4");
    for (let i = 1; i <= 400; i++) {
      const M = E.finishMatch(E.createMatch(H, A, i));
      let mom = 0;
      for (const e of M.events) {
        if (e.type === "possession") mom = (e.side === "H" ? 1 : -1) * e.mom;
        if (e.type !== "origin") continue;
        const T = e.side === "H" ? M.home : M.away;
        const p = T.players.find(x => x.c.id === e.by);
        if (!p) continue;
        const b = mom < -0.2 ? "lo" : mom > 0.2 ? "hi" : "mid";
        bucket[b][p.role] = (bucket[b][p.role] || 0) + 1;
      }
    }
    const share = (o, r) => (o[r] || 0) / (Object.values(o).reduce((a, b) => a + b, 0) || 1);
    assert.ok(share(bucket.lo, "DF") > 0.5, "押されているとDF起点が主体: "
      + (share(bucket.lo, "DF") * 100).toFixed(0) + "%");
    assert.ok(share(bucket.mid, "MF") > 0.5, "拮抗するとMF起点が主体: "
      + (share(bucket.mid, "MF") * 100).toFixed(0) + "%");
    assert.ok(share(bucket.hi, "FW") > 0.35, "勢いがあるとFW起点が増える: "
      + (share(bucket.hi, "FW") * 100).toFixed(0) + "%");
    // 遠い位置も低確率で選ばれる(決定は確率的 = 一意に決まらない)
    assert.ok(share(bucket.lo, "MF") > 0.02 && share(bucket.hi, "MF") > 0.02,
      "狙いから外れた位置も低確率で起点になる");
    console.log("モメンタムOK 押され DF", (share(bucket.lo, "DF") * 100).toFixed(0) + "%",
      "/ 拮抗 MF", (share(bucket.mid, "MF") * 100).toFixed(0) + "%",
      "/ 勢い FW", (share(bucket.hi, "FW") * 100).toFixed(0) + "%");
  }

  // ---------- 起点のチャンネル(→docs/07 §7.9) ----------
  {
    // サブポジごとに3種そろっていて、能力キーも成功率も妥当な範囲
    for (const [sub, list] of Object.entries(E.ORIGINS)) {
      assert.strictEqual(list.length, 3, sub + " のチャンネルは3種");
      assert.strictEqual(new Set(list.map(c => c.stat)).size, 3, sub + " の3種は別々の能力で決まる");
      for (const c of list) {
        assert.ok(E.STAT_KEYS.includes(c.stat), sub + "/" + c.id + " の stat が実在する能力");
        assert.ok(c.risk > 0 && c.risk < 1, sub + "/" + c.id + " の risk が 0〜1");
        assert.ok(c.gain >= 0 && c.gain <= 1, sub + "/" + c.id + " の gain が 0〜1");
      }
      // to は「最低ここまで届く」。持つのは一発で前線へ送る手だけ(→docs/07 §7.9)
      for (const c of list) if (c.to != null) {
        assert.ok(c.to > 0.5 && c.to <= 0.95, sub + "/" + c.id + " の to が前線側");
        assert.strictEqual(c.kind, "pass", sub + "/" + c.id + " の to はパス系だけに付く");
        assert.ok(c.gain >= 0.5, sub + "/" + c.id + " の to を持つ手は gain も大きい");
      }
      // risk と gain はトレードオフ: 最も安全な選択が最大の gain を持たない
      const safest = list.reduce((a, b) => b.risk > a.risk ? b : a);
      const biggest = list.reduce((a, b) => b.gain > a.gain ? b : a);
      assert.notStrictEqual(safest.id, biggest.id, sub + " は安全と一発が両立しない");
    }
    // 陣形に出てくるサブポジは全部チャンネルを持っている
    const subs = new Set();
    Object.values(E.FORMATIONS).forEach(f => f.forEach(([s]) => subs.add(s)));
    for (const s of subs) assert.ok(E.ORIGINS[s], s + " のチャンネルがある");
    console.log("起点チャンネルOK", Object.keys(E.ORIGINS).length, "サブポジ ×3 =",
      Object.keys(E.ORIGINS).length * 3, "種 / 陣形の全", subs.size, "サブポジを網羅");
  }

  // ---------- 起点はマッチアップで決まる(D27 → docs/07 §7.8) ----------
  {
    const side = id => {
      const roster = E.clubRoster(4242, id);
      return { cards: E.bestXI(roster, "4-4-2"), form: "4-4-2", name: id };
    };
    const H = side("ger-4"), A = side("ger-4");
    const by = {}, vs = {};
    for (let i = 1; i <= 400; i++) {
      const M = E.finishMatch(E.createMatch(H, A, i));
      for (const e of M.events) {
        if (e.type !== "origin") continue;
        const T = e.side === "H" ? M.home : M.away, D = e.side === "H" ? M.away : M.home;
        const p = T.players.find(x => x.c.id === e.by);
        const df = D.players.find(x => x.c.id === e.vs);
        assert.ok(p, "起点の選手がイベントから引ける");
        assert.ok(df, "対応した相手がイベントから引ける");
        assert.notStrictEqual(df.role, "GK", "GKは起点のマッチアップに出ない");
        by[p.role] = by[p.role] || { n: 0, ok: 0 };
        by[p.role].n++; if (e.ok) by[p.role].ok++;
        vs[p.role + ">" + df.role] = (vs[p.role + ">" + df.role] || 0) + 1;
      }
    }
    // 座標のミラーで DF起点↔相手FW / MF起点↔相手MF / FW起点↔相手DF になる
    const top = r => Object.entries(vs).filter(([k]) => k.startsWith(r + ">"))
      .sort((a, b) => b[1] - a[1])[0][0].split(">")[1];
    assert.strictEqual(top("DF"), "FW", "DF起点には相手FWが対応する");
    assert.strictEqual(top("MF"), "MF", "MF起点には相手MFが対応する");
    assert.strictEqual(top("FW"), "DF", "FW起点には相手DFが対応する");
    // FWのdefは低いので、DF起点はほとんど止まらない。逆にFW起点は相手DFに阻まれる
    const rate = r => by[r].ok / by[r].n;
    assert.ok(rate("DF") > 0.85, "DF起点はほぼ止まらない: " + (rate("DF") * 100).toFixed(0) + "%");
    assert.ok(rate("DF") > rate("MF") && rate("MF") > rate("FW"),
      "前へ行くほど止められやすい: DF " + (rate("DF") * 100).toFixed(0)
      + "% > MF " + (rate("MF") * 100).toFixed(0) + "% > FW " + (rate("FW") * 100).toFixed(0) + "%");
    console.log("起点のマッチアップOK DF", (rate("DF") * 100).toFixed(0) + "%",
      "> MF", (rate("MF") * 100).toFixed(0) + "%", "> FW", (rate("FW") * 100).toFixed(0) + "%");
  }

  // ---------- 守備能力が試合結果に効く(→docs/07 §7.8) ----------
  {
    const base = E.bestXI(E.clubRoster(4242, "ger-4"), "4-4-2");
    const conceded = d => {
      const A = JSON.parse(JSON.stringify(base));
      A.forEach(c => { if (c && c.pos !== "GK") c.def = Math.max(1, Math.min(20, c.def + d)); });
      let ga = 0;
      for (let i = 1; i <= 500; i++) {
        const M = E.finishMatch(E.createMatch(
          { cards: base, form: "4-4-2", name: "H" }, { cards: A, form: "4-4-2", name: "A" }, i));
        ga += M.home.score;
      }
      return ga / 500;
    };
    const hi = conceded(+6), lo = conceded(-6);
    // ここが等しくなったら、フィールドの def が試合に効いていない(一度そうなっていた)
    assert.ok(hi < lo * 0.85, "守備が高いほど失点が減る: def+6 " + hi.toFixed(2)
      + " < def-6 " + lo.toFixed(2));
    console.log("守備の効きOK 失点 def+6", hi.toFixed(2), "/ def-6", lo.toFixed(2));

    // 攻守を同じ形にしてあるので、DFの atk も起点の成否に効く(→docs/07 §7.8)
    const dfOrigin = d => {
      const H = JSON.parse(JSON.stringify(base));
      H.forEach(c => { if (c && c.pos === "DF") c.atk = Math.max(1, Math.min(20, c.atk + d)); });
      let ok = 0, n = 0;
      for (let i = 1; i <= 300; i++) {
        const M = E.finishMatch(E.createMatch(
          { cards: H, form: "4-4-2", name: "H" }, { cards: base, form: "4-4-2", name: "A" }, i));
        for (const e of M.events) {
          if (e.type !== "origin" || e.side !== "H") continue;
          const p = M.home.players.find(x => x.c.id === e.by);
          if (!p || p.role !== "DF") continue;
          n++; if (e.ok) ok++;
        }
      }
      return ok / n;
    };
    const aHi = dfOrigin(+6), aLo = dfOrigin(-6);
    assert.ok(aHi > aLo + 0.05, "DFの atk が起点の成否に効く: +6 "
      + (aHi * 100).toFixed(0) + "% > -6 " + (aLo * 100).toFixed(0) + "%");
    console.log("DFのatkの効きOK 起点成功 atk+6", (aHi * 100).toFixed(0) + "%",
      "/ atk-6", (aLo * 100).toFixed(0) + "%");
  }

  // ---------- 連鎖(D28 → docs/07 §7.9) ----------
  {
    const side = id => ({ cards: E.bestXI(E.clubRoster(4242, id), "4-4-2"),
      form: "4-4-2", name: id });
    const H = side("ger-4"), A = side("ger-4");
    const len = {}, kinds = {};
    let shots = 0, goals = 0, deep = 0, byRole = {};
    for (let i = 1; i <= 500; i++) {
      const M = E.finishMatch(E.createMatch(H, A, i));
      let l = 0, carrier = null;
      for (const e of M.events) {
        if (e.type === "origin") { l = 1; carrier = e.by; kinds[e.kind] = (kinds[e.kind] || 0) + 1; continue; }
        if (e.type === "link") {
          l++; kinds[e.kind] = (kinds[e.kind] || 0) + 1;
          // carry は自分が持ち続け、pass は必ず別の選手へ渡る
          const prev = M.events[M.events.indexOf(e) - 1];
          if (prev && prev.kind === "carry" && prev.ok) assert.strictEqual(e.by, prev.by,
            "carry のあとは同じ選手が持つ");
          if (prev && prev.kind === "pass" && prev.ok) assert.notStrictEqual(e.by, prev.by,
            "pass のあとは別の選手が持つ");
          carrier = e.by; continue;
        }
        if (["goal","save","block","miss"].includes(e.type)) {
          shots++; if (e.type === "goal") goals++;
          if (e.h < 0.6) deep++;
          len[l] = (len[l] || 0) + 1; l = 0;
          const T = e.side === "H" ? M.home : M.away;
          const p = T.players.find(x => x.c.id === e.by);
          if (p) byRole[p.role] = (byRole[p.role] || 0) + 1;
        }
      }
    }
    const tot = Object.values(len).reduce((a, b) => a + b, 0);
    const one = (len[1] || 0) / tot;
    assert.ok(one < 0.6, "1手で終わる攻撃が半分以下: " + (one * 100).toFixed(0) + "%");
    assert.ok((len[2] || 0) + (len[3] || 0) > tot * 0.3, "2〜3手の連鎖が主流になる");
    assert.ok(kinds.carry > 0 && kinds.pass > 0 && kinds.shot > 0, "3種の kind が全部出る");
    // 遠くからの苦し紛れが主流になっていないこと(一度そうなった)
    assert.ok(deep / shots < 0.1, "遠距離シュートは1割未満: " + (deep / shots * 100).toFixed(0) + "%");
    assert.ok((byRole.DF || 0) / shots < 0.2, "DFがシュートの主役になっていない: "
      + ((byRole.DF || 0) / shots * 100).toFixed(0) + "%");
    console.log("連鎖OK 手数",
      Object.entries(len).filter(([k]) => k > 0).sort((a, b) => a[0] - b[0])
        .map(([k, v]) => k + "手" + (v / tot * 100).toFixed(0) + "%").join(" "),
      "/ 遠距離", (deep / shots * 100).toFixed(0) + "% / 決定率", (goals / shots * 100).toFixed(0) + "%");
  }

  // ---------- シュートの枝分かれ(D29 → docs/07 §7.9) ----------
  {
    const side = id => ({ cards: E.bestXI(E.clubRoster(4242, id), "4-4-2"),
      form: "4-4-2", name: id });
    const H = side("ger-4"), A = side("ger-4");
    const t = {}; let reb = 0, rebOk = 0; const depth = {};
    for (let i = 1; i <= 500; i++) {
      const M = E.finishMatch(E.createMatch(H, A, i));
      for (const e of M.events) {
        if (["block", "miss", "save", "goal"].includes(e.type)) t[e.type] = (t[e.type] || 0) + 1;
        if (e.type === "rebound") { reb++; if (e.ok) rebOk++; }
        if (["block", "miss", "save", "goal"].includes(e.type))
          depth[e.depth || 0] = (depth[e.depth || 0] || 0) + 1;
        if (e.type === "block") assert.ok(e.vs, "ブロックした選手が記録される");
        if (e.type === "miss") assert.ok(!e.gk, "枠外にGKは関与しない");
        if (e.type === "save" || e.type === "goal") assert.ok(e.gk, "枠内はGKが関与する");
      }
    }
    const att = t.block + t.miss + t.save + t.goal;
    const pct = k => t[k] / att;
    // 現実のサッカーはおおよそ ブロック3割 / 枠外3割 / 枠内4割(うち3割弱が得点)
    assert.ok(pct("block") > 0.15 && pct("block") < 0.40, "ブロックが妥当な割合: "
      + (pct("block") * 100).toFixed(0) + "%");
    assert.ok(pct("miss") > 0.20 && pct("miss") < 0.45, "枠外が妥当な割合: "
      + (pct("miss") * 100).toFixed(0) + "%");
    assert.ok(pct("goal") > 0.07 && pct("goal") < 0.20, "得点が妥当な割合: "
      + (pct("goal") * 100).toFixed(0) + "%");
    // こぼれ球は続いてよいが、**確率で収束する**(回数を決め打ちしない)。
    // 「こぼれる × 詰め合いに勝つ」で1回あたり十数%なので幾何級数的に減る。
    assert.ok(reb > 0, "こぼれ球が起きる");
    const deep = Object.entries(depth).map(([k, v]) => [Number(k), v]).sort((a, b) => a[0] - b[0]);
    assert.ok(deep.length > 1, "詰め直しからのシュートが起きる");
    for (let i = 1; i < deep.length; i++)
      assert.ok(deep[i][1] < deep[i - 1][1] * 0.5,
        deep[i][0] + "回目のこぼれは前より大きく減る: " + deep[i][1] + " < " + deep[i - 1][1]);
    assert.ok(Math.max(...deep.map(d => d[0])) <= E.TUNING.shot.reboundMax,
      "安全網の上限を超えない");
    console.log("シュートの枝分かれOK",
      ["block", "miss", "save", "goal"].map(k => k + " " + (pct(k) * 100).toFixed(0) + "%").join(" / "),
      "/ こぼれ球", (reb / 500).toFixed(1) + "回", "拾えた", (rebOk / reb * 100).toFixed(0) + "%",
      "/ 深さ", deep.map(d => d[0] + ":" + (d[1] / att * 100).toFixed(1) + "%").join(" "));
  }

  // ---------- GKの質が結果に出る(→docs/07 §7.9) ----------
  {
    const base = E.bestXI(E.clubRoster(4242, "ger-4"), "4-4-2");
    const mk = d => { const X = JSON.parse(JSON.stringify(base));
      X.forEach(c => { if (c && c.pos === "GK") c.def = Math.max(1, Math.min(20, c.def + d)); });
      return X; };
    const run = X => { let ga = 0;
      for (let i = 1; i <= 400; i++) ga += E.finishMatch(E.createMatch(
        { cards: base, form: "4-4-2", name: "H" }, { cards: X, form: "4-4-2", name: "A" }, i)).home.score;
      return ga / 400; };
    const hi = run(mk(+4)), lo = run(mk(-4));
    assert.ok(hi < lo * 0.85, "GKが良いほど失点が減る: +4 " + hi.toFixed(2) + " < -4 " + lo.toFixed(2));
    console.log("GKの効きOK 失点 def+4", hi.toFixed(2), "/ def-4", lo.toFixed(2));
  }

  // ---------- 監督は任意のタイミングで手を打てる(D25 → docs/07 §7.6) ----------
  {
    const side = id => {
      const roster = E.clubRoster(4242, id);
      return { cards: E.bestXI(roster, "4-4-2"), form: "4-4-2", name: id };
    };
    const mk = () => E.createMatch(side("ger-4"), side("ger-5"), 999);

    // ① 1ティックずつ解いても、一気に解いても同じ試合になる
    const a = mk(); while (!E.matchOver(a)) E.stepMatch(a); E.finishMatch(a);
    const b = E.finishMatch(mk());
    assert.strictEqual(JSON.stringify(a.events), JSON.stringify(b.events),
      "1ティックずつ解いても一気に解いても同じ");

    // ② 途中で交代を入れると、そこから先だけが変わる
    const c = mk();
    const HALF = Math.floor(c.clock.length / 2);
    for (let i = 0; i < HALF; i++) E.stepMatch(c);
    const before = JSON.stringify(c.events);
    assert.ok(E.orderMatch(c, "H", { type: "sub", out: 10, in: 0 }), "交代の指示を積める");
    E.finishMatch(c);
    assert.ok(JSON.stringify(c.events).startsWith(before.slice(0, -1)),
      "指示より前のイベントは1つも変わらない");
    const subs = c.events.filter(e => e.type === "sub");
    assert.strictEqual(subs.length, 1, "交代が1回だけ記録される");
    assert.ok(subs[0].min > 0, "交代は指示の次のティックで起きる: " + subs[0].min + "分");

    // ③ 交代枠の上限を超えては積めない
    const d = mk(); E.stepMatch(d);
    let ok = 0;
    for (let i = 0; i < 5; i++) if (E.orderMatch(d, "H", { type: "sub", out: 10 - i, in: i })) ok++;
    assert.strictEqual(ok, E.TUNING.squad.subMax, "交代枠は " + E.TUNING.squad.subMax + " まで");

    // ④ 指示を出さなければ、途中で止めても結果は変わらない(=描画は結果に触れない)
    const e = mk();
    for (let i = 0; i < HALF; i++) E.stepMatch(e);
    E.finishMatch(e);
    assert.strictEqual(JSON.stringify(e.events), JSON.stringify(b.events),
      "止めても指示が無ければ同じ試合");
    console.log("任期中の指揮OK 交代", subs[0].min + "分 / 枠", E.TUNING.squad.subMax,
      "/ 止めても結果は不変");
  }

  process.exit(0);
})().catch(e => { console.error("FAIL:", e); process.exit(1); });
