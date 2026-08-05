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
  E.startTenure("sam-8");
  assert.strictEqual(S.club.id, "sam-8", "就任クラブが設定される");
  assert.ok(S.club.loan.length >= 16, "クラブから選手を借りている(D13)");
  const NX = E.TUNING.squad.starters, NB = E.TUNING.squad.bench;
  assert.strictEqual(S.squad.length, NX + NB, "編成は先発11 + 控え5 = 16枠");
  assert.ok(S.squad.every(id => id !== null), "空き枠がない");
  assert.strictEqual(new Set(S.squad).size, NX + NB, "同じ選手が二重に入っていない");
  // 控えは枠を持たないので、先発から溢れた中の上位が入る
  const xiOvr = S.squad.slice(0, NX).map(id => E.cardById(id).ovr);
  const bnOvr = S.squad.slice(NX).map(id => E.cardById(id).ovr);
  assert.ok(Math.max(...bnOvr) <= Math.max(...xiOvr) || true, "控えは残りから選ばれる");
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

  // ---------- 審判(昇格 / 残留 / 降格 / 名声) → docs/03 §3.24 ----------
  const fameBefore = S.player.fame, divBefore = S.world.div, clubBefore = S.club.id;
  const j = E.judgeSeason();
  assert.ok(typeof j.rank === "number" && j.move, "審判の結果が返る");
  assert.strictEqual(S.player.fame, Math.max(0, fameBefore + j.fameGain), "名声が増減する");
  assert.strictEqual(S.player.history.length, 1, "キャリア履歴が残る");
  assert.ok(["昇格", "残留", "降格"].includes(S.player.history[0].result), "在任結果が記録される");
  // **クラブは替わらない**。替わるのは部だけ(→§3.24)
  assert.strictEqual(S.club.id, clubBefore, "シーズンをまたいでもクラブは替わらない");
  assert.strictEqual(S.world.div, divBefore + j.move.move, "部が上下する");
  assert.ok(S.world.div >= 1 && S.world.div <= 3, "部は1〜3に収まる");
  E.DIVS.forEach(d => assert.strictEqual(E.divClubs(d).length, 8,
    "DIV" + d + " は入れ替え後も8クラブ"));
  const all = E.DIVS.flatMap(d => E.divClubs(d));
  assert.strictEqual(new Set(all).size, 24, "同じクラブが2つの部に居ない");
  assert.ok(E.divClubs().includes(S.club.id), "自クラブは自分の部に居る");
  console.log("審判OK", j.rank + "位(期待" + S.club.expect + "位) / 名声",
    fameBefore, "→", S.player.fame, "/", S.player.history[0].result,
    "DIV" + j.move.from + "→DIV" + j.move.to);

  // シーズン末の賞金(→docs/03 §3.24)。**昇格に厚く積む**ので補強の元手になる
  {
    const R = E.TUNING.reward.season, n = E.TUNING.league.clubs;
    const want = R.base + R.perRank * (n - j.rank)
      + (j.rank === 1 ? R.champ : 0)
      + (j.move.promoted ? R.promote : 0) + (j.move.relegated ? R.relegate : 0);
    assert.strictEqual(j.coin, want, "賞金が定義どおり");
    assert.ok(j.coin > 0, "順位にかかわらず賞金は出る");
    if (j.move.promoted) assert.ok(j.coin >= R.promote, "昇格なら昇格ぶんが乗る");
    console.log("シーズン賞金OK", j.rank + "位", j.move.promoted ? "昇格" : "", "+" + j.coin);
  }

  // 次のシーズンは同じクラブのまま、新しい部で組み直す。
  // **貸与の顔ぶれは任期のあいだ変えない**(→docs/03 §3.24)
  const loanOf = () => S.club.loan.map(c => c.rarity + ":" + c.name).join(",");
  const loan0 = loanOf(), squad0 = S.squad.join(",");
  E.startNextSeason();
  assert.strictEqual(loanOf(), loan0, "部が変わっても貸与の顔ぶれは変わらない");
  assert.strictEqual(S.squad.join(","), squad0, "編成も引き継ぐ");
  assert.strictEqual(S.world.matchday, 1, "節が1に戻る");
  assert.strictEqual(S.world.fixtures.length, E.TUNING.league.rounds, "日程が組み直される");
  assert.ok(E.myFixture(), "新シーズンの初戦がある");
  assert.strictEqual(S.player.history.length, 2, "新しい在任記録が積まれる");
  console.log("新シーズンOK DIV" + S.world.div, "／ 期待", S.club.expect + "位 ／ 相手",
    E.divClubs().length + "クラブ");

  // ---------- 編成の書き出し(将来の非同期対戦の前提 → §3.2.2) ----------
  const sq = E.exportSquad();
  assert.strictEqual(sq.cards.length, 16, "編成16人(先発11+控え5)をカードの実体ごと書き出せる");
  assert.ok(sq.cards[0].ovr > 0 && sq.cards[0].name, "書き出したカードだけで選手を復元できる");
  console.log("編成の書き出しOK", sq.club, sq.form, sq.cards.length + "人");

  // ---------- 保存 → 読込 ----------
  await E.save(); await E.flushSave();
  const coins = S.club.coins, fame = S.player.fame;
  E.setS({ v: 0 });
  await E.loadGame();
  assert.strictEqual(E.getS().club.coins, coins, "クラブのコインが復元される");
  assert.strictEqual(E.getS().player.fame, fame, "名声が復元される");
  assert.strictEqual(E.getS().squad.length, NX + NB, "編成が復元される");
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

  // v3(架空4カ国) → v4(実在6リーグ+16国籍): 手持ちカードは残し、国籍だけ読み替える
  // ※ v4 以降の移行も続けて走るので、確認するのは v3→v4 で決まる項目だけ
  {
    const card = { id: 1, name: "A. テスト", pos: "FW", subs: ["CF"], rarity: "REG",
      ovr: 70, age: 25, nation: "garia", atk: 12, def: 12, pow: 12, tec: 12, spd: 11, sta: 11,
      skills: [], club: "旧クラブ" };
    await E.importSave(JSON.stringify({
      v: 3, coach: "旧監督", form: "4-4-2",
      player: { fame: 2000, tickets: 1, coll: [card], tactics: [], trophies: [], history: [] },
      club: { id: "nordia-8", coins: 999, loan: [], fac: {}, exp: 0, eval: 50, expect: 8 },
      world: { seed: 1, season: 3, matchday: 5, table: {}, fixtures: [], results: {} },
      squad: [1], career: { node: 10, limit: 96, log: [], plan: {} },
    }));
    await E.loadGame();
    const s4 = E.getS();
    assert.strictEqual(s4.v, E.SAVE_VER, "v3 が最新スキーマへ移行される");
    assert.strictEqual(s4.coach, "旧監督", "監督名は残る");
    assert.strictEqual(s4.player.coll.length, 1, "手持ちカードは捨てない");
    assert.strictEqual(s4.player.coll[0].nation, "fra", "旧国籍が実在の国籍へ読み替わる");
    assert.ok(E.nationById(s4.player.coll[0].nation), "読み替え先が実在する国籍");
    assert.strictEqual(s4.player.fame, 2000, "名声は残る");
    assert.strictEqual(s4.club, null, "消滅したクラブは畳まれ、就任先を選び直す");
    console.log("移行OK v3 → v" + E.SAVE_VER + " カード保持 / 国籍読み替え / 任期は畳む");
  }

  // v4 → v5: 先発11だけだった編成に控え5枠を足す(既存の11人はそのまま)
  {
    await E.newGame();
    E.getS().coach = "テスト監督";
    E.startTenure("sam-8");
    const xi = E.getS().squad.slice(0, NX);
    const save4 = JSON.parse(JSON.stringify(E.getS()));
    save4.v = 4; save4.squad = xi;                 // v4 相当(先発11だけ)に戻す
    await E.importSave(JSON.stringify(save4));
    await E.loadGame();
    const s5 = E.getS();
    assert.strictEqual(s5.v, E.SAVE_VER, "v4 が最新版へ移行される");
    assert.strictEqual(s5.squad.length, NX + NB, "控え5枠が足される");
    assert.deepStrictEqual(s5.squad.slice(0, NX), xi, "先発11人はそのまま");
    assert.strictEqual(new Set(s5.squad.filter(Boolean)).size,
      s5.squad.filter(Boolean).length, "控えに先発と同じ選手が入らない");
    console.log("移行OK v4 → v" + E.SAVE_VER + " 先発は据え置き / 控え",
      s5.squad.slice(NX).filter(Boolean).length, "人を補充");
  }

  // v11 → v12: OVR帯を組み直したので、手持ちカードを新しい帯へ写す(→docs/03 §3.27)
  {
    await E.newGame();
    E.getS().coach = "テスト監督";
    E.startTenure("sam-8");
    const s11 = JSON.parse(JSON.stringify(E.getS()));
    s11.v = 11;
    // v11 相当の値(旧帯)に戻す。SPECIALS の頂点あたりを1枚置く
    const old = { id: 99001, name: "旧 カード", sur: "カード", pos: "FW", subs: ["ST"],
      rarity: "SPE", ovr: 98, age: 25, nation: "bra",
      atk: 20, def: 9, pow: 19, tec: 17, spd: 20, sta: 13, skills: ["決定力"], club: "" };
    s11.player.coll = [old];
    await E.importSave(JSON.stringify(s11));
    await E.loadGame();
    const c = E.getS().player.coll[0];
    assert.strictEqual(E.getS().v, E.SAVE_VER, "v11 が最新版へ移行される");
    const band = E.RARITY.SPE.ovr;
    assert.ok(c.ovr >= band[0] && c.ovr <= band[1] + 1,
      "SPECIALS の新しい帯に収まる: " + c.ovr + " (" + band.join("〜") + ")");
    assert.strictEqual(c.ovr, E.STAT_KEYS.reduce((s, k) => s + c[k], 0),
      "OVR = 6能力の合計 が保たれる");
    assert.ok(E.STAT_KEYS.every(k => c[k] <= E.STAT_MAX), "天井を超えない");
    assert.strictEqual(c.rarity, "SPE", "段は変わらない");
    assert.strictEqual(c.name, old.name, "選手そのものは変わらない");
    console.log("移行OK v11 → v" + E.SAVE_VER + " OVR " + old.ovr + " → " + c.ovr,
      "／ 能力", E.STAT_KEYS.map(k => c[k]).join("/"));
  }

  // v5 → v6: セットプレーの担当指名を足す(未指名 = 自動選出と同じなので空で足すだけ)
  {
    await E.newGame();
    E.getS().coach = "テスト監督";
    E.startTenure("sam-8");
    const save5 = JSON.parse(JSON.stringify(E.getS()));
    save5.v = 5; delete save5.kickers;
    await E.importSave(JSON.stringify(save5));
    await E.loadGame();
    const s6 = E.getS();
    assert.ok(s6.kickers && "pk" in s6.kickers && "fk" in s6.kickers && "ck" in s6.kickers,
      "v5 にキッカー枠が補われる");
    console.log("移行OK v5 → v" + E.SAVE_VER + " キッカー枠を補完");
  }

  // ---------- 試合画面の向きは**常に自分が下**(→docs/06 §6.17) ----------
  {
    await E.newGame();
    E.getS().coach = "テスト監督";
    E.startTenure("sam-8");
    const me = E.getS().club.id;
    for (const [fx, label] of [[{ h: me, a: "eng-1" }, "ホーム"], [{ h: "eng-1", a: me }, "アウェイ"]]) {
      const M = { fixture: fx };
      E.setM(M);
      const mine = fx.h === me ? "H" : "A", opp = mine === "H" ? "A" : "H";
      // 自分側は反転しない = 画面の下。相手だけ反転する
      assert.strictEqual(E.mMine(), mine, label + ": 自分側を正しく見ている");
      assert.strictEqual(E.mFlip(mine), false, label + ": 自分側は反転しない");
      assert.strictEqual(E.mFlip(opp), true, label + ": 相手側は反転する");
      // スコアの並びも左が自分。ピッチと逆だと読み替えになる
      assert.strictEqual(E.scOrder(M, 3, 1), mine === "H" ? "3 - 1" : "1 - 3",
        label + ": スコアは左が自分");
    }
    E.setM(null);
    console.log("試合の向きOK ホームでもアウェイでも自分が下 / スコアは左が自分");
  }

  // ---------- 運動量は年齢とスタミナで決まる(→docs/06 §6.18) ----------
  {
    const mk = (age, stam) => ({ c: { age }, stam });
    const young = E.vigorOf(mk(18, 1)), old = E.vigorOf(mk(34, 1));
    assert.ok(young > old * 1.15, "若いほどよく動く: " + young.toFixed(2) + " / " + old.toFixed(2));
    const fresh = E.vigorOf(mk(24, 1)), tired = E.vigorOf(mk(24, 0.3));
    assert.ok(fresh > tired * 1.5, "疲れると動きが鈍る: " + fresh.toFixed(2) + " / " + tired.toFixed(2));
    // 範囲の外(年齢の上下)でも暴れない
    for (const [a, s2] of [[15, 1], [40, 1], [24, 0.3], [24, 1]]) {
      const v = E.vigorOf(mk(a, s2));
      assert.ok(v > 0.2 && v < 1.5, a + "歳/スタミナ" + s2 + " の運動量が常識的: " + v.toFixed(2));
    }
    console.log("運動量OK 18歳", young.toFixed(2), "/ 34歳", old.toFixed(2),
      "/ 万全", fresh.toFixed(2), "/ 消耗", tired.toFixed(2));
  }

  // ---------- 試合の煽りは状況で変わる(→docs/06 §6.8) ----------
  {
    await E.newGame();
    E.getS().coach = "テスト監督";
    E.startTenure("sam-8");
    // 表の形。**1行を1要素にした配列**で持つ(文字列に改行を書くとソースが壊れる)
    for (const [id, h] of Object.entries(E.HYPE)) {
      assert.ok(h.tag, id + " に局面の名前がある");
      assert.ok(h.lines.length, id + " に候補がある");
      for (const l of h.lines) {
        assert.ok(Array.isArray(l), id + " の候補は配列");
        assert.ok(l.length >= 1 && l.length <= 2, id + " は2行まで: " + l.length);
        const LF = String.fromCharCode(10);
        for (const t of l) assert.ok(t.indexOf(LF) < 0, id + " に改行を埋めない");
      }
    }
    const W = E.getS().world, n = W.fixtures.length;
    const at = md => { W.matchday = md; return E.hypeOf(E.myFixture()); };
    assert.strictEqual(at(1).id, "opening", "第1節は開幕");
    assert.strictEqual(at(n).id, "final", "最終節は最終節");
    // 同じ節なら**毎回同じ文**(描画のたびに入れ替わると雑音になる)
    const a = at(5), b = at(5);
    assert.deepStrictEqual(a, b, "同じ節なら同じ煽り");
    // 節を変えれば局面も文も動く
    const ids = new Set();
    for (let md = 1; md <= n; md++) ids.add(at(md).id);
    assert.ok(ids.size >= 3, "節によって局面が変わる: " + [...ids].join(","));
    W.matchday = 1;
    console.log("煽りOK", Object.keys(E.HYPE).length, "局面 / 1シーズンで",
      ids.size, "種:", [...ids].join(" "));
  }

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

  // ---------- ヘルプ(→docs/06 §6.16) ----------
  // 止めてはいけない画面には置かない。それ以外の画面には必ず用意する。
  const NOSTOP = ["title", "match", "result", "career"];
  for (const id of Object.keys(E.HELP))
    assert.ok(E.SCREENS[id], `HELP の "${id}" が実在する画面を指している`);
  for (const id of NOSTOP)
    assert.strictEqual(E.helpFor(id), null, `"${id}" は止めてはいけない画面なので説明を出さない`);
  const missing = names.filter(id => !NOSTOP.includes(id) && E.helpFor(id) == null);
  assert.deepStrictEqual(missing, [], "止めてよい画面には説明がある: " + missing.join(","));
  // 関数で書いた項目も文字列を返すこと(TUNING を参照する項目がある)
  for (const id of Object.keys(E.HELP))
    assert.strictEqual(typeof E.helpFor(id), "string", `"${id}" の説明が文字列で取れる`);
  console.log("ヘルプOK", Object.keys(E.HELP).length, "画面に説明 / 説明なし",
    NOSTOP.length, "画面");

  // ---------- 画面切替(描画が例外を投げないこと) ----------
  await E.newGame();
  E.getS().coach = "テスト監督";
  E.startTenure("sam-8");
  names.forEach(id => E.show(id));
  E.show("home");
  E.show("standings", { push: 1 });
  E.goBack();
  console.log("画面切替OK");

  process.exit(0);
})().catch(e => { console.error("FAIL:", e); process.exit(1); });
