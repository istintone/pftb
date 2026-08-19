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
  // **上限に達したら終わり**。延命の判断は第80節に済んでいる(→docs/03 §3.9)
  assert.ok(j.tenure, "大会の決着で任期の去就が返る");
  assert.strictEqual(j.tenure.extended, false, "上限のあとに延命は起きない");
  assert.strictEqual(E.getS().career.over, true, "上限に達したら任期終了");
  console.log("任期終了OK", j.rank + "位 / 上限", E.TUNING.tenure.limit, "節で明ける");

  // ---------- 延命は上限120節で頭打ち ----------
  const s = E.getS();
  s.career.limit = E.TUNING.tenure.hardMax;
  s.career.tenureDone = false;
  s.club.eval = 100;                                  // 評価が満点でも
  const t2 = E.ownerTenure();
  assert.strictEqual(s.career.limit, E.TUNING.tenure.hardMax, "上限は " + E.TUNING.tenure.hardMax + " 節を超えない");
  assert.strictEqual(t2.ok, true, "評価が足りていれば話は通る");
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
    // **キングズを基準に見る**。プレシーズンは「難易度が低い」大会なので、
    // 相手の強さの下限を測る土台にはならない(別に下で見る)
    const cup = E.cupById("kings");
    const S3 = E.getS(), C = S3.career;
    // **キングズは DIV3 水準の相手を出す**(→docs/03 §3.23)ので、
    // 自クラブも DIV3 に置いて比べる。DIV1 のまま比べると「相手が弱い」のは当たり前
    S3.world.div = 3;
    // 大会を終えると間があく(→docs/03 §3.23)ので、検証では毎回そこも戻す
    const at = (node, exp) => { C.cup = null; C.cupRest = 0;
      C.node = node; S3.club.exp = exp; return E.cupEnterable(); };
    // **開催サイクルと参加条件の両方**を満たしたときだけエントリーできる
    // **どの大会も開かない節**を探す。大会が増えたので `every-1` では
    // 別の大会の開催日に当たってしまう(プレシーズンは6の倍数)
    let quiet = 0;
    for (let n = 20; n < 200 && !quiet; n++)
      if (!E.CUPS.some(c => n % c.every === 0)) quiet = n;
    assert.ok(quiet, "どの大会も開かない節がある");
    assert.ok(!at(quiet, cup.needExp + 500), "開催節でなければエントリーできない");
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

    const f = E.cupFixtureOf();
    assert.ok(f && f.side && f.side.cards.length >= 11, "組み合わせが作れる");
    // **相手の強さは大会が決める**(→docs/03 §3.23)。自クラブとの比較では見ない —
    // キングズは DIV3 水準の相手を出すので、DIV1 のクラブが出れば当然弱い。
    // 見るのは「回戦が上がるほど強くなる」ことと、下の「大会の階段」。
    {
      // **1枠だけで比べない**。下駄は1回戦あたり +1 で、名簿の揺れのほうが大きい。
      // 枠は8つしかないが、cupSide はたねを枠番号から作るだけなので、
      // **架空の枠番号でいくらでも標本が取れる**。7個では足りず、実際に
      // 「56.7 → 56.6」で落ちた(下駄 +2 に対して揺れが ±1.5 あった)
      const avg = r => { let n = 0, v = 0;
        for (let k = 0; k < 48; k++) { if (k === C.cup.slot || k === C.cup.elite) continue;
          v += E.squadPower(E.cupSide(cup, r, k).cards.slice(0, 11)); n++; }
        return v / n; };
      const p1 = avg(1), p3 = avg(cup.rounds);
      assert.ok(p3 > p1, "勝ち上がるほど相手が強い: "
        + p1.toFixed(1) + " → " + p3.toFixed(1));
    }
    // **大会ごとに相手の強さが階段になっている**(→docs/03 §3.23)。
    // 同じ回戦・同じ枠で並べると、上の大会ほど強い
    {
      // 大会ごとの比較も**8枠の平均**で見る(1枠だと名簿の揺れに埋もれる)
      const pw = id => { const cu = E.cupById(id); let n = 0, v = 0;
        for (let k = 0; k < 8; k++) { if (k === C.cup.slot) continue;
          v += E.squadPower(E.cupSide(cu, 1, k).cards.slice(0, 11)); n++; }
        return Math.round(v / n); };
      const order = ["pre", "kings", "super", "conti", "trophy", "world"];
      const vals = order.map(pw);
      for (let i = 1; i < vals.length; i++)
        assert.ok(vals[i] >= vals[i - 1] - 2,
          order[i - 1] + " より " + order[i] + " が弱い: " + vals[i - 1] + " → " + vals[i]);
      assert.ok(vals[vals.length - 1] > vals[0] + 8,
        "最上位と最下位で差が付く: " + vals[0] + " → " + vals[vals.length - 1]);
      console.log("  大会の階段OK", order.map((id, i) => id + " " + vals[i]).join(" / "));
    }

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
      C.cup = null; C.cupRest = 0; C.node = cup.every; S3.club.exp = cup.needExp + 500;
      assert.ok(E.enterCup(cup.id), "入り直せる");
      E.cupResolveRound(C.cup, 1, { gf: 0, ga: 2, win: false });   // 1回戦で敗退
      assert.ok(!C.cup.alive && C.cup.out === 1, "敗退が表から読める");
      C.node = E.cupLastNode();
      const coin0 = S3.club.coins;
      const gate = E.gateIncome();          // 節が進むと観客収入も入る(→docs/03 §3.5)
      const closed = E.advanceNode();
      assert.ok(closed && !closed.win, "決勝の節を越えたら大会が締まる");
      assert.ok(C.cup.done, "大会は完了扱いになる");
      assert.strictEqual(S3.club.coins - coin0 - gate, closed.coin, "順位の賞金は完了節に入る");
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
      C.cup = null; C.cupRest = 0; C.node = cup.every;
      assert.ok(E.enterCup(cup.id), "入り直せる");
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
    // **勝ち抜いてこそ**。出るだけで貰えると、1試合あたりの実入りがリーグを上回る
    assert.ok(cup.fame[0] >= cup.fame[3] * 10,
      "初戦敗退は token: " + cup.fame[3] + " ↔ 優勝 " + cup.fame[0]);
    assert.ok(cup.fame[0] / cup.rounds <= 400,
      "1試合あたりが大きすぎない: " + (cup.fame[0] / cup.rounds).toFixed(0));
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

  // ---------- チュートリアル(→docs/03 §3.43) ----------
  {
    await E.newGame();
    const S9 = E.getS(); S9.coach = "案内";
    const tut = E.MAILS.filter(m => m.tut);
    assert.strictEqual(tut.length, E.TUT_ALL, "案内の通数");
    assert.deepStrictEqual(tut.map(m => m.tut), tut.map((_, i) => i + 1),
      "番号が1から抜けなく振られている");
    // **行き先のある案内は、実在する画面を指す**(飛べない案内を出さない)
    for (const m of tut) if (m.go)
      assert.ok(E.SCREENS[m.go], m.id + " の行き先が無い画面: " + m.go);

    assert.strictEqual(S9.player.mail.length, 0, "就任する前は何も届かない");
    E.startTenure("sam-8");
    const C9 = S9.career;
    const step = () => E.mailList().filter(m => E.mailById(m.id).tut).length;
    assert.strictEqual(step(), 1, "就任した時点で1通目が届く");

    // **きっかけが立つまで次は来ない**。順番どおりに1通ずつ進む
    E.show("home"); E.show("home");
    assert.strictEqual(step(), 1, "オーナーに会うまで2通目は来ない");
    // **画面の外で立つきっかけ**。あいさつは HOME のタイルから始まって HOME に戻ってくる。
    // 「初めて見た画面」でだけ配っていたときは、ここで案内が止まっていた
    C9.opened = true; E.show("home");
    assert.strictEqual(step(), 2, "あいさつが済んで HOME に戻ると2通目");
    E.show("cards");
    assert.strictEqual(step(), 3, "顔合わせで3通目");
    E.show("cards");
    assert.strictEqual(step(), 3, "同じ画面を開き直しても増えない");
    E.show("deck");
    assert.strictEqual(step(), 4, "編成で4通目");
    E.show("season");
    assert.strictEqual(step(), 4, "試合をしていなければ5通目は来ない");
    C9.log.push({ node: 1, res: "lose" });
    E.show("home");
    assert.strictEqual(step(), 5, "初戦を終えれば5通目(勝ち負けは問わない)");
    E.seeNow("scoutDone");
    assert.strictEqual(step(), E.TUT_ALL, "補強をやり切って最後の1通");

    // **HOME のひとことは最新を映す**。同じ節に2通あっても、あとから届いたほうが上
    const last = E.mailById(E.mailLatest().id);
    assert.strictEqual(last.tut, E.TUT_ALL, "最新は最後の案内: " + last.title);

    // --- 二度目の就任では案内は出ない(キャリアで一度きり) ---
    const n1 = S9.player.mail.length;
    C9.node = C9.limit + 1; C9.closing = false;
    E.judgeTenure();
    S9.player.fame = 3000;
    E.startTenure("sam-8");
    E.mailTick();
    assert.strictEqual(S9.player.mail.length, n1, "次の任期でもう一度は届かない");
    assert.ok(E.seenHas("cards"), "見たことは任期をまたいでも残る");
    console.log("チュートリアルOK " + E.TUT_ALL + "通 ／ 就任→あいさつ→CARDS→DECK→試合→スカウト"
      + " ／ 1通ずつ順に ／ キャリアで一度きり");
  }

  // ---------- 秘書からの連絡と引換券(→docs/03 §3.42) ----------
  {
    await E.newGame();
    const S8 = E.getS(); S8.coach = "検証"; E.startTenure("sam-8");
    // **就任した時点でチュートリアルの1通目が届く**(→§3.43)。
    // ここで見たいのは配布物のほうなので、案内は済んだことにしておく
    assert.strictEqual(E.mailUnread(), 1, "就任で届くのは案内の1通目だけ");
    for (const d of E.MAILS) if (d.tut && !E.mailHas(d.id))
      S8.player.mail.push({ id: d.id, at: 0, read: true, got: true });
    S8.player.mail.forEach(x => { x.read = true; });        // 届いていた1通目も読んだ扱い
    const base = S8.player.mail.length;

    // **条件を満たすまで届かない**。テストの連絡は初勝利がきっかけ
    E.mailTick();
    assert.strictEqual(S8.player.mail.length, base, "条件が立つまで届かない");
    S8.career.log.push({ node:1, res:"lose" });
    E.mailTick();
    assert.strictEqual(S8.player.mail.length, base, "負けでは届かない");
    S8.career.log.push({ node:2, res:"win" });
    E.mailTick();
    assert.ok(E.mailUnread() > 0, "初勝利で届く");
    const n0 = S8.player.mail.length;
    E.mailTick(); E.mailTick();
    assert.strictEqual(S8.player.mail.length, n0, "同じ連絡は二度届かない");

    const m = E.mailLatest();
    assert.ok(m, "最新の連絡が取れる");
    const def = E.mailById(m.id);
    assert.ok(def && def.gift && def.gift.ticket, "テストの連絡には引換券が付く");

    // --- 受け取りは一度きり。券が増える ---
    assert.strictEqual(E.ticketCount(def.gift.ticket), 0, "受け取る前は0枚");
    assert.ok(E.mailTake(m.id), "受け取れる");
    assert.strictEqual(E.ticketCount(def.gift.ticket), 1, "券が1枚入る");
    assert.strictEqual(E.mailTake(m.id), null, "二度は受け取れない");
    assert.strictEqual(E.ticketCount(def.gift.ticket), 1, "枚数も増えない");
    assert.strictEqual(E.mailUnread(), 0, "受け取ると既読になる");

    // --- 券を使うと LEGENDS が1枚。**手で作った選手から**出る ---
    const coin0 = S8.club.coins, coll0 = S8.player.coll.length;
    const rng = E.mulberry32(7);
    const got = E.drawLegend(rng);
    assert.strictEqual(got.rarity, "LEG", "LEGENDS が出る");
    assert.ok(got.sig, "手で作った選手から出る: " + got.name);
    assert.ok(E.ticketUse(def.gift.ticket), "券を使える");
    assert.strictEqual(E.ticketCount(def.gift.ticket), 0, "券が減る");
    assert.strictEqual(E.ticketUse(def.gift.ticket), false, "無い券は使えない");
    assert.strictEqual(S8.club.coins, coin0, "コインは減らない");

    // --- 持っている選手は出ない(全員そろうまで重複しない) ---
    S8.player.coll = E.signatureCards().filter(c => c.rarity === "LEG").slice(0, 11);
    const rest = E.drawLegend(E.mulberry32(3));
    assert.ok(rest.sig, "残り1人が出る: " + rest.name);
    assert.ok(!S8.player.coll.some(c => c.sig === rest.sig), "持っていない選手が出る");
    S8.player.coll = E.signatureCards().filter(c => c.rarity === "LEG");
    const over = E.drawLegend(E.mulberry32(3));
    assert.strictEqual(over.rarity, "LEG", "全員そろっても引ける(自動生成に落ちる)");
    assert.ok(!over.sig, "そのときは手で作った選手ではない");
    S8.player.coll = [];
    console.log("連絡と引換券OK 初勝利で届く ／ 受け取りは一度きり ／"
      + " 券でLEGENDS(手で作った12人から)");
  }

  // ---------- スポンサー(→docs/03 §3.40) ----------
  {
    await E.newGame();
    const S7 = E.getS(); S7.coach = "検証"; E.startTenure("sam-8");
    const T = E.TUNING.spon, C7 = S7.career;

    // --- 相談は「契約が無いとき」だけ。候補は名声で開く ---
    assert.ok(E.sponPending(), "契約が無ければ相談が来る");
    const low = E.sponOffers();
    assert.strictEqual(low.length, T.pick, "候補は " + T.pick + " 社");
    assert.ok(low.every(o => o.need <= S7.player.fame), "名声が届いている会社だけ");
    assert.ok(!low.some(o => o.tier >= 3), "名声0で上位の会社は来ない: " + low.map(o => o.name));
    S7.player.fame = 99999;
    const hi = E.sponOffers();
    assert.ok(hi.some(o => o.tier === 4), "名声を積むと最上位が来る: " + hi.map(o => o.name));
    assert.ok(!hi.some(o => o.league && o.league !== E.clubById(S7.club.id).league),
      "他リーグ専属の会社は来ない");
    S7.player.fame = 0;

    // --- 契約すると課題・報酬・支援が決まり、打ち手が4つになる ---
    assert.strictEqual(E.handsNow().length, 3, "契約前の打ち手は3つ");
    const pick = E.sponOffers()[0];
    const sp = E.sponSign(pick.id);
    assert.ok(sp, "契約できる");
    assert.strictEqual(sp.until, C7.node + T.term, "期限は " + T.term + "節先");
    assert.ok(!E.sponPending(), "契約中は相談が来ない");
    assert.ok(E.sponGoalText(sp).indexOf("第" + sp.until + "節") >= 0, "課題に期限が入る");
    const hands = E.handsNow();
    assert.strictEqual(hands.length, 4, "契約中は打ち手が4つ");
    assert.strictEqual(hands[3].id, "spon", "4つ目はスポンサー支援");
    assert.strictEqual(hands[3].label, E.sponAidById(sp.aid).label, "支援の名前が出る");
    assert.ok(E.handNow("spon"), "4つ目を選べる");
    assert.ok(T.great > E.TUNING.chat.great && T.fail < E.TUNING.chat.fail,
      "支援は通常より当たりが厚い: " + T.great + " / " + T.fail);

    // --- 課題は種類が合ったときだけ立つ。**報酬は一度きり** ---
    sp.goal = { kind: "streak", n: 3 };
    C7.streak = 0;
    E.streakAdd("win"); E.streakAdd("win");
    assert.ok(!sp.hit, "足りないうちは達成しない: " + C7.streak + "連勝");
    E.streakAdd("draw");
    assert.strictEqual(C7.streak, 0, "引き分けで連勝が切れる");
    E.streakAdd("win"); E.streakAdd("win"); E.streakAdd("win");
    assert.ok(sp.hit, "課題を達成する");
    const coin0 = S7.club.coins, coll0 = S7.player.coll.length;
    const r = E.sponPay(null);
    assert.ok(r, "報酬が出る");
    if (r.kind === "coin") assert.ok(S7.club.coins > coin0, "コインが入る");
    else assert.strictEqual(S7.player.coll.length, coll0 + 1, "カードが1枚入る");
    assert.strictEqual(E.sponPay(null), null, "報酬は一度きり");

    // --- 期限を越えると契約が切れる。達成していれば名声は減らない ---
    C7.node = sp.until + 1;
    const end = E.sponTick();
    assert.ok(end && end.hit, "達成のまま満了する");
    assert.strictEqual(end.lost, 0, "達成していれば名声は減らない");
    assert.strictEqual(E.sponsor(), null, "契約が外れる");
    assert.strictEqual(E.handsNow().length, 3, "打ち手が3つに戻る");

    // --- 落とすと名声が下がる(**名声が減る唯一の経路**) ---
    S7.player.fame = 5000; C7.node = 10;
    const sp2 = E.sponSign(E.sponOffers()[0].id);
    C7.node = sp2.until + 1;
    const fame0 = S7.player.fame;
    const end2 = E.sponTick();
    assert.ok(end2 && !end2.hit, "未達成のまま満了する");
    assert.strictEqual(end2.lost, T.fameFail[sp2.tier - 1], "段ぶんの名声が引かれる");
    assert.strictEqual(S7.player.fame, fame0 - end2.lost, "名声が減っている");
    E.fameLose(999999);
    assert.strictEqual(S7.player.fame, 0, "名声は0より下に行かない");

    // --- 報酬は**受信箱で受け取る**(→docs/03 §3.40) ---
    {
      const S6 = E.getS();
      S6.player.mail = [];
      S6.club.sponsor = { id: E.SPONSORS[0].id, tier: 1, aid: "atk",
        goal: { kind: "league" }, node0: 1, until: 90, hit: false, paid: false };
      const before = S6.player.mail.length;
      assert.ok(E.sponHit("league"), "課題を達成する");
      assert.strictEqual(S6.player.mail.length, before + 1, "達成したら連絡が届く");
      const m = E.mailList()[0];
      const d = E.mailDef(m);
      assert.ok(d && d.gift && d.gift.spon, "報酬が添えられている");
      assert.ok(!E.sponsor().paid, "開くまでは渡っていない");
      const coin0 = S6.club.coins;
      const got = E.mailTake(m.id);
      assert.ok(got && got.got, "受信箱で受け取れる");
      assert.ok(S6.club.coins > coin0, "コインが入る");
      assert.ok(E.sponsor().paid, "受け取ると清算済みになる");
      assert.strictEqual(E.mailTake(m.id), null, "二度は受け取れない");

      // **枠を選ぶ報酬は、枠を渡すまで受け取れない**
      S6.player.mail = [];
      S6.club.sponsor = { id: E.SPONSORS.find(x => x.tier === 2).id, tier: 2, aid: "atk",
        goal: { kind: "league" }, node0: 2, until: 90, hit: false, paid: false };
      E.sponHit("league");
      const m2 = E.mailList()[0], d2 = E.mailDef(m2);
      assert.ok(d2.gift.pick, "枠を選ぶ報酬だと分かる");
      assert.strictEqual(E.mailTake(m2.id), null, "枠を渡さないと受け取れない");
      const r2 = E.mailTake(m2.id, "FW");
      assert.ok(r2 && r2.got.card, "枠を渡せば受け取れる");
      assert.strictEqual(r2.got.card.pos, "FW", "選んだ枠で来る");
      console.log("スポンサーの報酬OK 達成で連絡が届く ／ 受信箱で受け取る ／"
        + " 枠は受け取る前に選ぶ");
    }

    // --- 溜まった連絡は上限で落ちる(→docs/03 §3.42) ---
    {
      const S7 = E.getS();
      S7.player.mail = [];
      const max = E.TUNING.mail.keep;
      for (let i = 0; i < max + 12; i++) E.mailPush("t" + i, { title: "t", text: "t" });
      assert.strictEqual(S7.player.mail.length, max, "上限 " + max + " 通に収まる");
      assert.strictEqual(S7.player.mail[0].id, "t12", "古いものから落ちる");
      // **受け取っていない贈り物は残る**
      S7.player.mail = [];
      E.mailPush("gift", { title: "g", text: "g", gift: { coin: 100 } });
      for (let i = 0; i < max + 5; i++) E.mailPush("u" + i, { title: "u", text: "u" });
      assert.ok(S7.player.mail.some(x => x.id === "gift"), "受け取り待ちは消えない");
      assert.strictEqual(S7.player.mail.length, max, "それでも上限は守る");
      console.log("連絡の上限OK " + max + "通 ／ 古いものから落ちる ／ 受け取り待ちは残る");
    }

    // --- 段の階段(→docs/03 §3.40)。**5段。4段はポジションまで選べる WORLD CLASS** ---
    assert.deepStrictEqual(E.SPON_PRIZE.map(x => x.kind),
      ["coin", "scoutPos", "scoutWc", "scoutWcPos", "scoutLe"], "報酬の段の並び");
    const kinds = [];
    for (let tier = 1; tier <= E.SPON_PRIZE.length; tier++) {
      const co = E.SPONSORS.find(x => x.tier === tier);
      assert.ok(co, tier + "段の会社がある");
      const P = E.sponPrize(tier);
      S7.club.sponsor = { id: co.id, tier: tier, aid: "atk", goal: { kind: "league" },
        node0: 1 + tier, until: 90, hit: true, paid: false };
      // **ポジションを選ぶ段だけ**監督に聞く。それ以外は null で渡る(ui と同じ)
      const r = E.sponPay(P.pick ? "FW" : null);
      assert.ok(r, tier + "段の報酬が出る");
      assert.strictEqual(r.kind, P.kind, tier + "段は " + P.kind);
      if (P.pick) assert.strictEqual(r.card.pos, "FW",
        tier + "段は呼んだポジションで来る: " + r.card.pos);
      if (P.kind === "scoutWc" || P.kind === "scoutWcPos") {
        assert.strictEqual(r.card.rarity, "WC", tier + "段は WORLD CLASS 確定");
        // **実在選手が先**(→docs/03 §3.13)。持っていない人が居るうちは必ずそちら
        assert.ok(r.card.sig, tier + "段で手で作った選手が出ない: " + r.card.name);
      }
      if (P.kind === "scoutLe") assert.strictEqual(r.card.rarity, "LEG", "5段は LEGENDS 確定");
      kinds.push(P.label);
    }
    // **LEGENDS の重さは動かさない**。4段を挟んでも5段の課題は前のままにしてある
    assert.strictEqual(T.streak[4], T.streak[3], "4段と5段の連勝数は同じ");
    assert.ok(T.fameFail[3] < T.fameFail[4], "落としたときの痛みは段で増える");

    // --- 実在選手は重複しない。全員そろったら自動生成に落ちる ---
    {
      const S9 = E.getS();
      const keep = S9.player.coll.slice();
      const wcs = E.signatureCards().filter(c => c.rarity === "WC");
      assert.ok(wcs.length >= 8, "WORLD CLASS の実在選手が居る: " + wcs.length + "人");
      const got = new Set();
      S9.player.coll = [];
      for (let i = 0; i < wcs.length; i++) {
        const c = E.drawSig(E.mulberry32(100 + i), "WC");
        assert.ok(c.sig, "そろうまでは実在選手が出る");
        assert.ok(!got.has(c.sig), "同じ人は二度出ない: " + c.name);
        got.add(c.sig); S9.player.coll.push(c);
      }
      const over = E.drawSig(E.mulberry32(7), "WC");
      assert.strictEqual(over.rarity, "WC", "全員そろっても引ける");
      assert.ok(!over.sig, "そのときは自動生成に落ちる");
      // **枠を指定すると、その枠の実在選手から出る**
      S9.player.coll = [];
      const fw = E.drawSig(E.mulberry32(3), "WC", "FW");
      assert.strictEqual(fw.pos, "FW", "指定した枠で来る");
      assert.ok(fw.sig, "枠を指定しても実在選手が先");
      S9.player.coll = keep;
      console.log("実在選手の引き当てOK WC " + wcs.length + "人 ／ 重複しない ／"
        + " 枠の指定も効く ／ そろったら自動生成");
    }

    // --- 1段は**会社ごとに額が違う**。名声0でも「どれと組むか」の判断になる ---
    const t1 = E.SPONSORS.filter(x => x.tier === 1);
    const coins = [...new Set(t1.map(x => x.coin))];
    assert.ok(t1.length >= 5, "1段の会社が " + t1.length + "社");
    assert.ok(coins.length >= 5, "額が " + coins.length + " 通り: " + coins.join("/"));
    S7.player.fame = 0; S7.club.sponsor = null;
    const seen = new Set();
    for (let n = 1; n <= 40; n++) { C7.node = n; E.sponOffers().forEach(o => seen.add(o.id)); }
    assert.ok(seen.size > T.pick, "名声0でも顔ぶれが入れ替わる: " + seen.size + "社");
    console.log("スポンサーの段OK " + kinds.map((l, i) => (i + 1) + "段=" + l).join(" / "));
    console.log("  1段の額: " + t1.map(x => x.name + " " + x.coin).join(" / "));

    // --- 任期の終わりに契約を残さない(→docs/03 §3.40) ---
    S7.player.fame = 5000; S7.club.sponsor = null;
    C7.node = C7.limit - T.least + 2;                  // 残り least-1 節
    assert.ok(!E.sponPending(), "任期の残りが " + T.least + "節を切ったら相談は来ない");
    C7.node = C7.limit - T.term + 4;                   // 24節ぶんは残っていない
    assert.ok(E.sponPending(), "残っていれば相談は来る");
    const late = E.sponSign(E.sponOffers()[0].id);
    assert.strictEqual(late.until, C7.limit, "期限は任期の上限で止まる: 第" + late.until + "節");

    // **任期の終わりで清算される**。未達成なら名声が下がる(流して逃げられない)
    C7.node = C7.limit + 1; C7.closing = false;
    const fame1 = S7.player.fame;
    const t3 = E.judgeTenure();
    assert.ok(S7.career.over, "任期が明ける");
    assert.ok(t3.sponsor && !t3.sponsor.hit, "契約は未達成のまま閉じる");
    assert.ok(S7.player.fame < fame1, "名声が下がる: " + fame1 + " → " + S7.player.fame);
    assert.strictEqual(E.sponsor(), null, "契約は任期と一緒に外れる");
    console.log("スポンサーOK 候補" + T.pick + "社 ／ " + T.term + "節契約 ／ 打ち手4つ目 ／"
      + " 報酬は一度きり ／ 未達成で名声 -" + T.fameFail[sp2.tier - 1]
      + " ／ 任期の終わりで清算");
  }

  // ---------- 信頼と師弟(→docs/03 §3.39) ----------
  {
    await E.newGame();
    const S6 = E.getS(); S6.coach = "検証"; E.startTenure("sam-8");
    const T = E.TUNING.trust;
    const xi = S6.squad.slice(0, E.TUNING.squad.starters).filter(Boolean);
    assert.ok(xi.length >= 11, "先発が揃っている");
    assert.strictEqual(E.trustOf(xi[0]), 0, "信頼は0から始まる");

    // --- 試合と打ち手で動く。**下がりもする** ---
    E.trustMatch();
    assert.strictEqual(E.trustOf(xi[0]), T.startXI, "スタメンで出ると上がる");
    const bench = S6.squad[E.TUNING.squad.starters];
    if (bench) assert.strictEqual(E.trustOf(bench), 0, "出ていない選手は動かない");
    E.trustHand(xi[0], "train", "great");
    E.trustHand(xi[0], "train", "fail");
    assert.strictEqual(E.trustOf(xi[0]), T.startXI + T.trainGreat + T.trainFail,
      "訓練は大成功で" + T.trainGreat + " / 失敗で" + T.trainFail);
    S6.career.trust[xi[1]] = 0;                        // 試合ぶんを除いて見る
    E.trustHand(xi[1], "bond", "ok");
    assert.strictEqual(E.trustOf(xi[1]), T.bondOk, "交流は成功で" + T.bondOk);
    S6.career.trust[xi[1]] = 0;
    E.trustAdd(xi[1], -50);
    assert.strictEqual(E.trustOf(xi[1]), 0, "0より下には行かない");

    // --- 予兆 → 相談。**しきい値を跨ぐまで来ない** ---
    S6.career.trust[xi[0]] = T.news - 1;
    assert.strictEqual(E.trustNews().length, 0, "予兆はしきい値の手前では出ない");
    S6.career.trust[xi[0]] = T.news;
    assert.deepStrictEqual(E.trustNews(), [xi[0]], "予兆が CLUB NEWS に出る");
    assert.strictEqual(E.mentorPending(), null, "予兆だけでは相談は来ない");
    S6.career.trust[xi[0]] = T.need;
    assert.strictEqual(E.mentorPending(), xi[0], "しきい値を越えると相談が来る");

    // --- 断っても二度目は来ない ---
    assert.strictEqual(E.mentorAnswer(xi[0], false), false, "断れば師弟にならない");
    assert.strictEqual(E.mentorPending(), null, "断った選手は二度と相談してこない");
    assert.ok(!E.isMentor(xi[0]), "師弟の一覧にも入らない");

    // --- 受けると師弟。上限に達したらもう起きない ---
    const mentors = [];
    for (let i = 1; i <= T.max + 1 && i < xi.length; i++) {
      S6.career.trust[xi[i]] = T.need + 10;
      const p2 = E.mentorPending();
      if (mentors.length >= T.max) { assert.strictEqual(p2, null, "上限に達したら相談は来ない"); break; }
      assert.strictEqual(p2, xi[i], "次の選手が相談してくる");
      assert.ok(E.mentorAnswer(xi[i], true), "受ければ師弟になる");
      mentors.push(xi[i]);
    }
    assert.strictEqual(mentors.length, T.max, "師弟は " + T.max + "人まで");
    assert.ok(E.mentorFull(), "上限に達している");

    // --- 覚醒と連携を持って次の任期へ ---
    E.trainAwake(mentors[0], "atk"); E.trainAwake(mentors[0], "atk");
    E.bondAdd(mentors[0], mentors[1], 300);
    E.bondAdd(mentors[0], xi[0], 300);                 // 師弟でない相手との線
    const star0 = E.trainStar(mentors[0]), up0 = E.trainUp(mentors[0], "atk");
    const loanMentor = mentors.filter(id => !S6.player.coll.some(c => c.id === id));
    const coll0 = S6.player.coll.length;
    // **名前は任期を畳む前に控える**。畳んだあとは貸与の名簿が入れ替わり、
    // 古いIDでは引けなくなる(引けないまま★0を見て落ちた)
    const names = mentors.map(id => E.cardById(id).name);

    E.newTenure();
    assert.ok(S6.player.legacy, "持ち越しが作られる");
    assert.deepStrictEqual(S6.career.mentor, [], "任期の中身は畳まれる");
    assert.strictEqual(E.trustOf(mentors[0]), 0, "信頼は次の任期で0に戻る");

    E.startTenure("sam-12");                            // 別のクラブへ就任
    assert.strictEqual(S6.player.legacy, null, "持ち越しは一度使うと消える");
    assert.strictEqual(S6.player.coll.length, coll0 + loanMentor.length,
      "貸与だった師弟はカードとして手元に残る");
    // 持ち越したカードのIDは引き直されるので、名前で探す
    const byName = n => S6.player.coll.find(c => c.name === n);
    const m0 = byName(names[0]), m1 = byName(names[1]);
    assert.ok(m0 && m1, "連れてきた選手が手元に居る: " + names.join(" / "));
    assert.strictEqual(E.trainStar(m0.id), star0, "覚醒の★が残る: ★" + star0);
    assert.strictEqual(E.trainUp(m0.id, "atk"), up0, "伸びた能力も残る");
    assert.ok(E.bondOf(m0.id, m1.id) > 0, "師弟どうしの連携は残る: " + E.bondOf(m0.id, m1.id));
    assert.strictEqual(Object.keys(S6.career.bond).length, 1,
      "師弟でない相手との連携は残らない");
    console.log("師弟OK 信頼", T.need, "で相談 ／ " + T.max + "人まで ／ 一度きり ／"
      + " ★" + star0 + "と連携を持って次の任期へ");
  }

  // ---------- 実績トロフィー(→docs/03 §3.36) ----------
  {
    await E.newGame();
    const S5 = E.getS(); S5.coach = "検証";
    // **DIV3 のクラブから始める**。昇格させて「刻んだのは昇格前の部」を見たい
    E.startTenure(E.clubsOfDiv("sam", 3)[0].id);
    assert.strictEqual(S5.world.div, 3, "DIV3 から始める");
    const defs = E.trophyDefs();
    assert.strictEqual(defs.length, E.CUPS.length + E.LEAGUES.length * E.DIVS.length,
      "棚はカップ + 各リーグ各部: " + defs.length);
    assert.strictEqual(new Set(defs.map(d => d.id)).size, defs.length, "IDが重複しない");
    // **カップのIDと衝突しない**。cupWins() はカップだけを数える
    assert.ok(!defs.filter(d => d.kind === "league").some(d => E.cupById(d.id)),
      "リーグの実績がカップとして数えられない");
    assert.deepStrictEqual(S5.player.trophies, [], "はじめは空");

    // --- リーグ制覇で刻まれる。**部を上げる前の部**で記録すること ---
    const div0 = S5.world.div;
    for (const id of Object.keys(S5.world.table)) {          // 自分だけ勝たせる
      const t = S5.world.table[id];
      if (id === S5.club.id) { t.w = 99; t.d = 0; t.l = 0; t.gf = 99; t.ga = 0; }
      else { t.w = 0; t.d = 0; t.l = 99; t.gf = 0; t.ga = 99; }
    }
    S5.world.matchday = S5.world.fixtures.length + 1;        // 全日程を終えた状態
    const j5 = E.judgeSeason();
    assert.strictEqual(j5.rank, 1, "1位で終えている");
    assert.ok(j5.trophy && j5.trophy.first, "総括に実績が返る");
    const lgId = E.lgTrophyId(E.clubById(S5.club.id).league, div0);
    const t1 = E.trophyOf(lgId);
    assert.ok(t1, "リーグの実績が刻まれる: " + lgId);
    assert.strictEqual(t1.n, 1, "1回目");
    assert.strictEqual(t1.kind, "league", "種別はリーグ");
    assert.ok(j5.move.promoted, "昇格している(次の季は上の部)");
    assert.ok(!E.trophyOf(E.lgTrophyId(E.clubById(S5.club.id).league, S5.world.div)),
      "昇格後の部の実績にはなっていない");

    // --- 2度目は回数だけ増える。初めて獲った季は残る ---
    const s0 = t1.season;
    S5.world.season += 3;
    const d2 = E.trophyAdd(lgId, t1.name, "league");
    assert.strictEqual(d2.first, false, "2度目は初回ではない");
    assert.strictEqual(E.trophyOf(lgId).n, 2, "回数が増える");
    assert.strictEqual(E.trophyOf(lgId).season, s0, "初めて獲った季は動かない");
    assert.strictEqual(E.trophyOf(lgId).last, S5.world.season, "最後に獲った季は更新される");
    assert.strictEqual(E.trophyCount(), 1, "同じ実績で枠は増えない");

    // --- カップも同じ扱い。cupWins() は種類数のまま ---
    E.trophyAdd("kings", E.cupById("kings").trophy, "cup");
    E.trophyAdd("kings", E.cupById("kings").trophy, "cup");
    assert.strictEqual(E.trophyOf("kings").n, 2, "カップも回数が増える");
    assert.strictEqual(E.trophyCount(), 2, "枠は2つ");
    console.log("実績OK", defs.length + "枠（カップ" + E.CUPS.length
      + " / リーグ" + E.LEAGUES.length * E.DIVS.length + "）／ 重複は回数だけ増える");
  }

  // ---------- 大陸大会は DIV1 に上がるまで開かない(→docs/03 §3.24) ----------
  {
    // **部で解禁される大会は複数ある**(スーパーキングズは DIV2、コンチネンタルは DIV1)。
    // ここで見るのは「その部に上がるまで開かない」という規則そのもの
    const conti = E.cupById("conti");
    assert.strictEqual(conti.needDiv, 1, "コンチネンタルは DIV1 で開く");
    const S4 = E.getS();
    S4.career.cup = null;
    S4.club.exp = conti.needExp + 100;
    S4.world.div = 2;
    assert.ok(!E.cupOpen(conti), conti.name + " は DIV2 では出られない");
    S4.world.div = 1;
    assert.ok(E.cupOpen(conti), conti.name + " は DIV1 で開く");
    // **重なった節は全部が選択肢になる**(→docs/03 §3.23)。筆頭は格の高いほう
    S4.career.node = conti.every * E.CUPS[0].every;          // 両方の開催サイクル
    const all = E.cupEnterables();
    assert.ok(all.length >= 2, "重なった大会が全部返る: " + all.map(c => c.id));
    assert.strictEqual(all[0].id, conti.id, "筆頭は賞金の大きいほう");
    assert.strictEqual(E.cupEnterable().id, conti.id, "1つだけ知りたい側にも筆頭が出る");
    // **格下をあえて選べる**。ここが選べないと「今節は軽い大会を獲る」手が消える
    const low = all[all.length - 1];
    assert.notStrictEqual(low.id, conti.id, "筆頭以外の選択肢がある");
    assert.ok(E.enterCup(low.id), low.name + " を選んで入れる");
    assert.strictEqual(S4.career.cup.id, low.id, "選んだ大会に入っている");
    S4.career.cup = null; S4.career.comp = null;
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

  // ---------- カードの売却(→docs/03 §3.46) ----------
  {
    await E.newGame();
    const S = E.getS(); S.coach = "検証"; E.startTenure("sam-8");

    // **値段は段が幹、OVR が枝**
    const mk = (rar, ovr) => ({ id: 900000 + Math.floor(Math.random() * 1e6),
      rarity: rar, ovr: ovr, pos: "MF", name: "検証 " + rar });
    const V = E.TUNING.sell;
    assert.ok(E.sellPrice(mk("LEG", 88)) > E.sellPrice(mk("WC", 88)), "段が上なら高い");
    assert.ok(E.sellPrice(mk("REG", 75)) > E.sellPrice(mk("REG", 60)), "OVR が高いほど高い");
    // **引く値段より必ず安い**(引いて売るが回らないように)
    for (const pk of E.TUNING.scout) {
      const worst = E.sellPrice(mk("WC", 85));
      assert.ok(worst < 4000 || pk.cost >= worst, "売値がパックの値段を超えない");
    }

    // **貸与は売れない / 編成に入っていると売れない / 師弟は売れない**
    const loan = S.club.loan[0];
    assert.ok(E.sellWhy(loan), "貸与は売れない: " + E.sellWhy(loan));
    const own = E.makeCard(E.mulberry32(5), "MF", { rarity: "REG" });
    S.player.coll.push(own);
    assert.strictEqual(E.sellWhy(own), null, "手持ちは売れる");
    S.squad[3] = own.id;
    assert.ok(E.sellWhy(own), "編成に入っていると売れない: " + E.sellWhy(own));
    S.squad[3] = null;
    S.career.mentor = [own.id];
    assert.ok(E.sellWhy(own), "師弟は売れない: " + E.sellWhy(own));
    S.career.mentor = [];
    // **実在選手は売れない**(集めるものなので)
    const sig = E.signatureCards()[0];
    S.player.coll.push(sig);
    assert.ok(E.sellWhy(sig), "実在選手は売れない: " + E.sellWhy(sig));
    S.player.coll = S.player.coll.filter(x => x !== sig);

    // **売るとコインが増えて手札から消える。訓練と連携も一緒に消える**
    E.trainAdd(own.id, "atk", 5);
    const mate = S.player.coll[0] || S.club.loan[0];
    E.bondAdd(own.id, mate.id, 30);
    const coin0 = S.club.coins, n0 = S.player.coll.length;
    const r = E.sellCard(own.id);
    assert.ok(r, "売れる");
    assert.strictEqual(S.club.coins, coin0 + r.coin, "コインが増える");
    assert.strictEqual(S.player.coll.length, n0 - 1, "手札から消える");
    assert.strictEqual(E.cardById(own.id), null, "もう引けない");
    assert.strictEqual(E.trainExp(own.id, "atk"), 0, "訓練の成果も消える");
    assert.strictEqual(E.bondOf(own.id, mate.id), 0, "連携も消える");
    assert.strictEqual(E.sellCard(own.id), null, "二度は売れない");
    console.log("売却OK 段とOVRで値が決まる ／ 貸与・編成・師弟・実在選手は売れない ／"
      + " 訓練と連携も一緒に消える");
  }

  // ---------- トレード(→docs/03 §3.49) ----------
  {
    await E.newGame();
    const S = E.getS(); S.coach = "検証"; S.world.seed = 20260814;
    E.startTenure("sam-8"); S.career.opened = true;
    const T = E.TUNING.trade;

    // **節目を過ぎるまで来ない**
    S.career.node = T.nodes[0] - 1;
    assert.strictEqual(E.tradePending(), null, "節目の前は来ない");

    // **出せるのは編成外の WC 以上の実名選手だけ**
    S.career.node = T.nodes[0];
    assert.strictEqual(E.tradePending(), null, "出せる選手が居なければ来ない");
    const wc = E.signatureCards().filter(c => c.rarity === "WC").slice(0, 2);
    S.player.coll.push(...wc);
    assert.strictEqual(E.tradeOuts().length, 2, "編成外の実名が候補になる");
    S.squad[3] = wc[0].id;
    assert.strictEqual(E.tradeOuts().length, 1, "編成に入っている人は出せない");
    S.squad[3] = null;

    const t = E.tradePending();
    assert.ok(t, "節目を過ぎたら話が来る");
    assert.strictEqual(t.cands.length, T.pick, T.pick + "人の候補が出る");
    assert.deepStrictEqual(E.tradePending().cands.map(c => c.id), t.cands.map(c => c.id),
      "**候補は先に決まっている**(引き直しても同じ)");
    for (const c of t.cands) assert.ok(E.tradeHint(c).length > 2, "手掛かりの文がある");
    assert.ok(!t.cands.some(c => S.player.coll.some(x => x.sig && x.sig === c.sig)),
      "持っている選手は候補にならない");

    // **断ると、その節目は二度と来ない**
    const at = t.at;
    assert.ok(E.tradeDo(null), "断れる");
    assert.strictEqual(E.tradePending(), null, "断った節目は来ない");
    assert.ok(S.career.tradeDone.includes(at), "済ませた節目に入る");

    // **次の節目では、また来る**
    S.career.node = T.nodes[1];
    const t2 = E.tradePending();
    assert.ok(t2, "次の節目では来る");
    const outId = t2.out, n0 = S.player.coll.length, mail0 = S.player.mail.length;
    E.trainAdd(outId, "atk", 5);
    const r = E.tradeDo(0);
    assert.ok(r && r.done, "成立する");
    assert.strictEqual(E.cardById(outId), null, "出した選手は手札から消える");
    assert.strictEqual(E.trainExp(outId, "atk"), 0, "訓練の成果も消える");
    assert.strictEqual(S.player.coll.length, n0 - 1, "この時点ではまだ増えない");
    assert.strictEqual(S.player.mail.length, mail0 + 1, "受信箱に連絡が届く");

    // **来る選手は受信箱で受け取る**
    const m = E.mailList()[0];
    const got = E.mailTake(m.id);
    assert.ok(got && got.card, "カードが添えられている");
    assert.strictEqual(S.player.coll.length, n0, "受け取ると1枚増える");
    assert.ok(E.cardById(got.card.id), "手札から引ける");
    assert.strictEqual(E.tradePending(), null, "同じ節目は二度と来ない");
    console.log("トレードOK " + T.nodes.join("/") + "節に1度ずつ ／ 編成外のWC以上だけ ／"
      + " 候補は先に確定 ／ 出す選手は消え、来る選手は受信箱");
  }

  // ---------- 実在選手の固定idと受信箱(→docs/03 §3.49) ----------
  // **実在選手の型紙は 8000000+通し番号 の固定id**を持つ。同じ人が2つの経路で
  // 届くと id がぶつかり、受け取ったのに手元に居ない、が起きていた。
  {
    await E.newGame();
    const S = E.getS(); S.coach = "検証"; S.world.seed = 20260819;
    E.startTenure("sam-8"); S.career.opened = true;
    const sig = E.signatureCards().find(c => c.rarity === "WC");
    const cp = () => JSON.parse(JSON.stringify(sig));

    // ① 同じ人の連絡が2通あっても、どちらも手元に入る
    E.mailPush("tdup1", { from:"sec", title:"a", text:"a", gift:{ card:cp(), label:"x" } });
    E.mailPush("tdup2", { from:"sec", title:"b", text:"b", gift:{ card:cp(), label:"x" } });
    const n1 = S.player.coll.length;
    const g1 = E.mailTake("tdup1"), g2 = E.mailTake("tdup2");
    assert.ok(g1 && g2, "どちらも受け取れる");
    assert.strictEqual(S.player.coll.length, n1 + 2, "2通ぶん手元に増える");
    assert.notStrictEqual(g1.card.id, g2.card.id, "手元に入る瞬間に別の通し番号になる");
    assert.ok(E.cardById(g1.card.id) && E.cardById(g2.card.id), "どちらも手札から引ける");

    // ② 先に同じ人が手元に居ても、受け取ったぶんは必ず増える
    S.player.coll.push(cp());
    const n2 = S.player.coll.length;
    E.mailPush("tdup3", { from:"sec", title:"c", text:"c", gift:{ card:cp(), label:"y" } });
    const g3 = E.mailTake("tdup3");
    assert.strictEqual(S.player.coll.length, n2 + 1, "固定idが被っても取りこぼさない");
    assert.ok(E.cardById(g3.card.id), "手札から引ける");

    // ③ **連絡で待っている人は、もう配られない**
    await E.newGame();
    const S3 = E.getS(); S3.world.seed = 20260819; E.startTenure("sam-8");
    const le = E.signatureCards().find(c => c.rarity === "LEG");
    E.mailPush("tpend", { from:"sec", title:"d", text:"d",
      gift:{ card:JSON.parse(JSON.stringify(le)), label:"z" } });
    let again = 0;
    for (let i = 0; i < 400; i++)
      if (E.drawSig(E.mulberry32(i + 1), "LEG").sig === le.sig) again++;
    assert.strictEqual(again, 0, "受け取り待ちの実在選手は二重に配られない");
    console.log("受信箱の実在選手OK 手元に入る瞬間に採番 ／ 固定idが被っても取りこぼさない ／"
      + " 受け取り待ちは二重に配らない");
  }

  process.exit(0);
})().catch(e => { console.error("FAIL:", e); process.exit(1); });
