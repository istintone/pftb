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
