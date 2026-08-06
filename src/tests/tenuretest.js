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
  E.startTenure("sam-8");
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
    E.startTenure("sam-" + (1 + i));
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
  E.startTenure("sam-8");
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
  E.startTenure("sam-8");
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
  console.log("大会選択OK 予定確定の節は固定 / 条件を満たさない大会は選べない");

  // ---------- カップ戦(D41 → docs/03 §3.23) ----------
  {
    const cup = E.CUPS[0];
    const S3 = E.getS(), C = S3.career;
    const at = (node, exp) => { C.cup = null; C.node = node; S3.club.exp = exp; return E.cupEnterable(); };
    // **開催サイクルと参加条件の両方**を満たしたときだけエントリーできる
    assert.ok(!at(cup.every - 1, cup.needExp + 500), "開催節でなければエントリーできない");
    assert.ok(!at(cup.every, cup.needExp - 1), "熟練度が足りなければエントリーできない");
    assert.ok(at(cup.every, cup.needExp), "条件を満たせばエントリーできる");
    // エントリーする前は、開催節でもカップは選べない(**打ち手から入る**)
    assert.ok(!E.compsAvailable().includes("cup"), "エントリー前はカップに出られない");

    // 回戦の呼び名は決勝から逆算する(rounds を変えても崩れない)
    assert.strictEqual(E.cupRoundName(cup, cup.rounds), "決勝", "最後は決勝");
    assert.strictEqual(E.cupRoundName(cup, cup.rounds - 1), "準決勝", "その前は準決勝");

    // --- エントリー: **節は進まず**、大会の予定が節に並ぶ ---
    const node0 = C.node;
    assert.ok(E.enterCup(cup.id), "エントリーできる");
    assert.strictEqual(C.node, node0, "エントリーしても節は進まない");
    assert.deepStrictEqual(E.cupNodes(), [node0, node0 + 1, node0 + 2], "大会の予定が節に並ぶ");
    assert.strictEqual(E.cupLastNode(), node0 + cup.rounds - 1, "決勝の節");
    assert.ok(!E.cupEnterable(), "同時に複数の大会へはエントリーできない");

    // **組み合わせ表はエントリー時に出来上がる**。先の回戦はまだ TBD
    {
      const c = C.cup, n = Math.pow(2, cup.rounds);
      assert.strictEqual(c.field.length, n, "参加は " + n + " クラブ");
      assert.strictEqual(new Set(c.field).size, n, "同じクラブが2枠に入らない");
      assert.strictEqual(c.field[c.slot], E.getS().club && E.clubById(E.getS().club.id).name,
        "自クラブが表に入っている");
      assert.strictEqual(E.cupPairs(c, 1).length, n / 2, "1回戦の組み合わせは決まっている");
      assert.ok(E.cupMyPair(c, 1), "自分の1回戦の相手が決まっている");
      assert.strictEqual(E.cupPairs(c, 2), null, "2回戦以降はまだ TBD");
      const f0 = E.cupFixtureOf();
      const pair = E.cupMyPair(c, 1), foe = pair[0] === c.slot ? pair[1] : pair[0];
      assert.strictEqual(f0.side.name, E.cupTeamName(c, foe), "表の相手とそのまま戦う");
    }
    assert.deepStrictEqual(E.compsAvailable(), ["cup"], "勝ち残っている間はカップ一択");
    assert.strictEqual(E.pickComp("league"), false, "辞退してリーグへは回れない");

    // 相手は**自クラブと同等かやや強い**
    const f = E.cupFixtureOf();
    assert.ok(f && f.side && f.side.cards.length >= 11, "組み合わせが作れる");
    const mine = E.squadPower(E.squadCards().slice(0, E.TUNING.squad.starters));
    assert.ok(E.squadPower(f.side.cards) >= mine - 8, "相手が極端に弱くない");

    // --- 1回戦: リーグの日程は進まない / 勝敗で勝ち残りが決まる ---
    const md0 = S3.world.matchday;
    C.hand = "train"; C.comp = "cup";
    const r = E.playCupDay(null);
    assert.ok(r && r.my && r.my.cup === cup.id, "カップの結果が返る");
    assert.strictEqual(r.my.draw, false, "カップに引き分けは無い");
    // **並んだらPK戦で決める**(→docs/03 §3.33)。裏で決めない
    if (r.my.gf === r.my.ga) {
      assert.ok(r.M.pso, "同点ならPK戦がある");
      assert.notStrictEqual(r.M.pso.hg, r.M.pso.ag, "PK戦は必ず決着する");
      assert.strictEqual(r.my.win, r.M.pso.win === "H", "PK戦の結果が勝敗になる");
      assert.ok(r.my.pso, "結果にPKのスコアが載る");
      const kicks = r.M.events.filter(e => e.type === "pso");
      assert.ok(kicks.length >= 2, "1本ずつ記録されている: " + kicks.length);
      assert.ok(r.M.events.some(e => e.type === "psoEnd"), "決着の記録がある");
    } else {
      assert.ok(!r.M.pso, "決着していればPK戦は無い");
    }
    assert.strictEqual(S3.world.matchday, md0, "リーグの節は進まない");
    assert.strictEqual(C.node, node0 + 1, "任期の節は進む");
    assert.ok(C.cup, "敗退しても大会は残る(進行を確認できる)");
    // 1回戦を戦うと、表が1回戦ぶん埋まり**2回戦の枠が決まる**
    assert.strictEqual(C.cup.res[0].length, Math.pow(2, cup.rounds - 1), "1回戦が全部埋まる");
    assert.ok(C.cup.res[0].every(m => m.w === m.i || m.w === m.j), "各試合に勝者が居る");
    assert.ok(E.cupPairs(C.cup, 2), "2回戦の組み合わせが決まる");
    assert.ok(C.cup.res[0].every(m => m.gi !== m.gj || m.pk), "同点ならPKが記録される");
    if (r.my.win) assert.ok(C.cup.alive && C.cup.round === 2, "勝てば次の回戦へ");
    else {
      assert.ok(!C.cup.alive && C.cup.out === 1, "負ければ勝ち残りが消える");
      assert.ok(E.compsAvailable().includes("league"), "敗退した翌節からリーグへ戻れる");
      assert.ok(!E.cupEnterable(), "大会が終わるまで次の大会には入れない");
    }

    // --- 敗退したまま決勝の節を越えると、そこで大会が締まって賞金が入る ---
    {
      C.cup = null; C.node = cup.every; S3.club.exp = cup.needExp + 500;
      assert.ok(E.enterCup(cup.id), "入り直せる");
      E.cupResolveRound(C.cup, 1, { gf: 0, ga: 2, win: false });   // 1回戦で敗退
      assert.ok(!C.cup.alive && C.cup.out === 1, "敗退が表から読める");
      C.node = E.cupLastNode();
      const coin0 = S3.club.coins;
      const closed = E.advanceNode();
      assert.ok(closed && !closed.win, "決勝の節を越えたら大会が締まる");
      assert.ok(C.cup.done, "大会は完了扱いになる");
      assert.strictEqual(S3.club.coins - coin0, closed.coin, "順位の賞金は完了節に入る");
      // **名声も完了節に入る**(→docs/03 §3.9)
      assert.strictEqual(closed.fame, cup.fame[closed.dist], "順位ぶんの名声が付く");
      assert.ok(closed.fame > 0, "敗退でも名声は増える: " + closed.fame);
      assert.ok(closed.coin > 0, "敗退でも賞品はある: " + closed.coin);
      assert.strictEqual(S3.player.trophies.filter(t => t.id === cup.id).length, 0,
        "優勝していなければ実績は付かない");
    }

    // --- 優勝: 賞金は最上位 / 実績は初優勝の1つだけ ---
    let champ = null;
    const coin1 = S3.club.coins;
    for (let i = 0; i < 40 && !champ; i++) {
      C.cup = null; C.node = cup.every;
      E.enterCup(cup.id);
      // 決勝まで勝ち上がった状態にする(手前の回戦は自分の勝ちで埋める)
      for (let r = 1; r < cup.rounds; r++) E.cupResolveRound(C.cup, r, { gf: 2, ga: 0, win: true });
      C.node = E.cupLastNode();
      C.hand = "train"; C.comp = "cup";
      S3.world.seed = (S3.world.seed + 7919) >>> 0;      // 勝つまでたねを変えて探す
      const x = E.playCupDay(null);
      if (x && x.cupClosed && x.cupClosed.win) champ = x;
    }
    assert.ok(champ, "決勝に勝てば優勝になる");
    assert.strictEqual(champ.cupClosed.coin, cup.prize[0], "優勝の賞金");
    assert.strictEqual(champ.cupClosed.fame, cup.fame[0], "優勝の名声");
    assert.ok(cup.fame[0] > cup.fame[1] && cup.fame[1] > cup.fame[3],
      "勝ち上がるほど名声が増える: " + cup.fame.join(" > "));
    assert.ok(S3.club.coins >= coin1 + cup.prize[0], "賞金が入る");
    assert.ok(C.cup.win && C.cup.champ, "優勝クラブとして残る: " + C.cup.champ);
    assert.strictEqual(E.cupPlaceName(cup, C.cup), "優勝", "成績の呼び名");
    assert.strictEqual(S3.player.trophies.filter(t => t.id === cup.id).length, 1,
      "トロフィーは初優勝の1つだけ");
    // **終わった大会は次の開催を塞がない**(記録は結果を見せるために残る)
    assert.ok(C.cup.done, "大会は完了している");
    C.node = cup.every * 2; S3.club.exp = cup.needExp + 500;
    const again = E.cupEnterable();
    assert.ok(again, "完了後の開催節にはまた出られる");
    assert.strictEqual(again.id, cup.id, "同じ大会にもう一度エントリーできる");
    assert.ok(E.enterCup(again.id), "実際に入れる");
    assert.ok(!C.cup.done, "新しい大会として始まる");
    assert.strictEqual(C.cup.node0, C.node, "エントリーした節から始まる");
    console.log("再エントリーOK 完了した大会は次の開催を塞がない");
    C.comp = null;                      // enterCup が立てた出場先を戻す
    console.log("  名声:", cup.fame.join(" / "), "(優勝/準優勝/ベスト4/ベスト8)");
    console.log("カップ戦OK", cup.name, "／ 熟練度" + cup.needExp + "以上・"
      + cup.every + "の倍数の節にエントリー ／ " + cup.rounds + "回戦 ／ 賞金 "
      + cup.prize.join("/") + " は完了節に入金");
    C.cup = null;
  }

  // ---------- 大陸大会は DIV1 に上がるまで開かない(→docs/03 §3.24) ----------
  {
    const conti = E.CUPS.find(c => c.needDiv);
    assert.ok(conti, "部で解禁される大会がある");
    const S4 = E.getS();
    S4.career.cup = null;
    S4.club.exp = conti.needExp + 100;
    S4.world.div = 2;
    assert.ok(!E.cupOpen(conti), conti.name + " は DIV2 では出られない");
    S4.world.div = 1;
    assert.ok(E.cupOpen(conti), conti.name + " は DIV1 で開く");
    // 同じ節に2つ重なったら格の高いほうが出る
    S4.career.node = conti.every * E.CUPS[0].every;          // 両方の開催サイクル
    const pick = E.cupEnterable();
    assert.strictEqual(pick && pick.id, conti.id, "重なったら賞金の大きいほうを選ぶ");
    // 大陸カップの相手は**DIV1 のリーグ首位級**(→docs/03 §3.25)
    {
      const plan = E.cupPlan(conti, false), elite = E.cupPlan(conti, true);
      const n = k => plan[k] || 0;
      assert.ok(n("WC") >= 8, "WORLD CLASS が主体: " + JSON.stringify(plan));
      assert.ok(!n("STD"), "STANDARD は居ない");
      assert.ok((elite.WC || 0) > n("WC"), "強豪(★)はさらに WC が厚い");
      console.log("  大陸カップの相手:", JSON.stringify(plan), "／ ★", JSON.stringify(elite));
      // **格の高い大会ほど名声が大きい**
      const kings = E.CUPS.find(c => c.id === "kings");
      assert.ok(conti.fame[0] > kings.fame[0],
        "大陸のほうが名声が大きい: " + kings.fame[0] + " → " + conti.fame[0]);
    }
    S4.world.div = 3; S4.club.exp = 0; S4.career.node = 1;
    console.log("大会の解禁OK", conti.name, "は " + E.divName(conti.needDiv)
      + " ／ 熟練度" + conti.needExp + " ／ 賞金 " + conti.prize[0]);
  }

  // 全日程を消化したらリーグは選べなくなる
  while (!E.seasonOver()) { E.pickHand("rest"); E.playMatchday(); }
  assert.ok(!E.compsAvailable().includes("league"), "リーグを消化しきったら選べない");
  console.log("消化後OK 選べる大会:", JSON.stringify(E.compsAvailable()));

  // ---------- 打ち手は3種だけ ----------
  // **カップのエントリーは打ち手ではない**(手続きだけ → docs/03 §3.23)。
  // 打ち手にすると、エントリーした節だけ選手を呼べなくなる
  assert.strictEqual(E.HANDS.length, 3, "打ち手は3種(訓練/交流/休息)");
  assert.deepStrictEqual(E.HANDS.map(h => h.id), ["train", "bond", "rest"], "IDが仕様どおり");
  assert.ok(!E.HANDS.some(h => h.cup), "エントリーは打ち手に混ざらない");
  assert.strictEqual(E.pickHand("nope"), false, "存在しない打ち手は選べない");
  console.log("打ち手の定義OK", E.HANDS.map(h => h.icon + h.label).join(" / "));

  process.exit(0);
})().catch(e => { console.error("FAIL:", e); process.exit(1); });
