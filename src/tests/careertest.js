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
    E.startTenure("nordia-" + (1 + (i % 8)));
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
  E.startTenure("nordia-8");                 // 弱小クラブ
  E.getS().club.expect = 8;                  // 最下位を期待されている状態にする
  const fame0 = E.getS().player.fame, eval0 = E.getS().club.eval;
  runSeason();
  const rank = E.rankOf(E.getS().world.table, "nordia-8");
  if (rank < 8) {
    assert.ok(E.getS().club.eval >= eval0, "期待を上回れば評価は下がらない");
    assert.ok(E.getS().player.fame > fame0, "期待を上回れば名声が増える");
    console.log("上振れOK", rank + "位(期待8位) / 評価", Math.round(eval0), "→", Math.round(E.getS().club.eval),
      "/ 名声", fame0, "→", E.getS().player.fame);
  } else console.log("上振れ検証: 今回は8位のままだった(乱数依存のためスキップ)");

  // ---------- 期待を大きく下回れば解任されうる ----------
  await E.newGame();
  E.getS().coach = "検証";
  E.startTenure("nordia-8");
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

  // ---------- 試合結果の分布が極端でない ----------
  const rng = E.mulberry32(42);
  let goals = 0, draws = 0, n = 2000;
  for (let i = 0; i < n; i++) {
    const { hg, ag } = E.resolveMatch({ strength: 78 }, { strength: 78 }, rng);
    goals += hg + ag;
    if (hg === ag) draws++;
  }
  const avg = goals / n, drawPct = draws / n;
  assert.ok(avg > 1.5 && avg < 5.0, "1試合の平均得点が現実的な範囲: " + avg.toFixed(2));
  assert.ok(drawPct > 0.08 && drawPct < 0.45, "引き分けの割合が極端でない: " + (drawPct * 100).toFixed(1) + "%");
  console.log("試合結果の分布OK 平均", avg.toFixed(2), "点 / 引き分け", (drawPct * 100).toFixed(1) + "%");

  process.exit(0);
})().catch(e => { console.error("FAIL:", e); process.exit(1); });
