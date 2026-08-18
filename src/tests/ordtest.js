const assert=require("assert");
const { setup }=require("./_setup.js");
const E=setup({tmpName:"_tmp_ord.js"});
(async()=>{
  // **たねを固定する**。編成が毎回変わると、レーンの偏りの基準値が揺れて
  // 判定が運任せになる(実際に中央だけ落ちたり通ったりした)
  await E.newGame(); E.getS().coach="検証";
  E.getS().world.seed=20260804; E.startTenure("sam-8");
  const S=E.getS();
  const side=()=>({ cards:E.squadCards(), form:S.form, name:"me" });

  // --- 采配は5つ。**同時に効くのは1つだけ** ---
  assert.strictEqual(E.ORDERS.length,5,"指示は5つ");
  assert.deepStrictEqual(E.ORDERS.map(o=>o.id),["attack","left","center","right","defend"],"並びは十字");
  assert.strictEqual(E.ORDERS.filter(o=>o.lane!=null).length,3,"レーンは3つ");
  assert.strictEqual(E.ORDERS.filter(o=>o.push).length,2,"上下は2つ");

  // --- 陣形の上下。GKは動かない / y0 から取り直すのでずれ続けない ---
  {
    const M=E.createMatch(side(),side(),1);
    const T=M.home, base=T.players.map(p=>p.y);
    E.setTeamOrder(T,"attack");
    const up=T.players.map(p=>p.y);
    T.players.forEach((p,i)=>{
      if(p.role==="GK")assert.strictEqual(up[i],base[i],"GKは前に出ない");
      else assert.ok(up[i]<base[i],"攻撃重視で前に出る");
    });
    E.setTeamOrder(T,"defend");
    const dn=T.players.map(p=>p.y);
    T.players.forEach((p,i)=>{ if(p.role!=="GK")assert.ok(dn[i]>base[i],"守備重視で下がる"); });
    E.setTeamOrder(T,null);
    assert.deepStrictEqual(T.players.map(p=>p.y),base,"解除すると元の位置に戻る");
    console.log("陣形OK 攻撃 -"+E.TUNING.order.shiftY+" / 守備 +"+E.TUNING.order.shiftY,
      "／ GKは不動 / 解除で復帰");
  }

  // --- ATK / DEF の見返り ---
  {
    const M=E.createMatch(side(),side(),2);
    const T=M.home, p=T.players.find(q=>q.role!=="GK");
    // **★のぶんを含める**(→docs/03 §3.53)。eff() は p.c.up を足すので、
    // 素の p.c.atk で基準を作ると相手の選手ぶんだけずれる
    const up=k=>(p.c.up&&p.c.up[k])||0;
    const a0=(p.c.atk+up("atk"))*p.fit*p.stam, d0=(p.c.def+up("def"))*p.fit*p.stam;
    E.setTeamOrder(T,"attack");
    assert.ok(Math.abs(E.eff(p,"atk")/a0-E.TUNING.order.buf)<1e-9,"攻撃重視でATKが上がる");
    assert.ok(Math.abs(E.eff(p,"def")/d0-1)<1e-9,"DEFは動かない");
    E.setTeamOrder(T,"defend");
    assert.ok(Math.abs(E.eff(p,"def")/d0-E.TUNING.order.buf)<1e-9,"守備重視でDEFが上がる");
    assert.ok(Math.abs(E.eff(p,"atk")/a0-1)<1e-9,"ATKは動かない");
    console.log("能力の見返りOK ×"+E.TUNING.order.buf,"(攻撃→ATK / 守備→DEF)");
  }

  // --- レーン指示で、そのレーンの起点と受け手が増える ---
  {
    // **N=80 では足りない**。中央の効きは 6pp 前後だが、80試合(1300件)だと 3〜6pp に振れて
    // しきい値を割ることがある(実際に落ちた)。400試合で 左9.4 / 中6.3 / 右9.8pp に安定する。
    const lane=id=>{
      let l=0,c=0,r=0,n=0;
      for(let i=0;i<400;i++){
        const M=E.finishMatch(E.createMatch({...side(),order:id},side(),i+1));
        for(const e of M.events){
          if(e.side!=="H"||!(e.type==="origin"||e.type==="pass"))continue;
          const p=E.playerOf(M,"H",e.by); if(!p)continue;
          // **ゴールキックは采配で動かせない**(→docs/07 §7.18)。起点がGKに固定されるので、
          // 数えると指示の効きが薄まって見える(実測 中央 5.1pp → 4.3pp)
          if(p.role==="GK")continue;
          n++; if(p.x<38)l++; else if(p.x>62)r++; else c++;
        }
      }
      return { l:l/n, c:c/n, r:r/n, n };
    };
    const base=lane(null), L=lane("left"), C=lane("center"), R=lane("right");
    // **割合ではなく差で見る**。中央は既定でも半分近くあるので、倍率では判定できない
    const pp=(a,b2)=>((a-b2)*100).toFixed(0)+"pp";
    assert.ok(L.l>base.l+0.06,"左指示で左の関与が増える: "+(base.l*100).toFixed(0)+"% → "
      +(L.l*100).toFixed(0)+"% ("+pp(L.l,base.l)+")");
    assert.ok(R.r>base.r+0.06,"右指示で右の関与が増える: "+(base.r*100).toFixed(0)+"% → "
      +(R.r*100).toFixed(0)+"% ("+pp(R.r,base.r)+")");
    // 中央は効きを浅くしてある(laneK)ので、上がり幅も小さくてよい
    assert.ok(C.c>base.c+0.03,"中央指示で中央の関与が増える: "+(base.c*100).toFixed(0)+"% → "
      +(C.c*100).toFixed(0)+"% ("+pp(C.c,base.c)+")");
    const pct=o=>[o.l,o.c,o.r].map(v=>(v*100).toFixed(0)+"%").join("/");
    console.log("レーンOK 左中右の関与 指示なし",pct(base),"／ 左",pct(L),"／ 中央",pct(C),"／ 右",pct(R));
  }

  // --- 攻撃/守備は**表と裏を持つ**。強いだけの指示にしない ---
  {

    // **n=1000 では足りない**。同じ編成同士だと1試合1.0点前後で、采配の差は
    // 0.03〜0.09点。標準誤差(±0.03)に埋もれて向きが反転することがある(実際に起きた)。
    // n=6000 で 攻撃 1.26得/1.11失・指示なし 1.08/1.02・守備 1.04/0.93 と安定して分かれる。
    const run=id=>{
      let gf=0,ga=0,w=0,n=6000;
      for(let i=0;i<n;i++){
        const r=E.resolveMatch({ ...side(), order:id },side(),i+1);
        gf+=r.hg; ga+=r.ag; if(r.hg>r.ag)w++;
      }
      return { gf:gf/n, ga:ga/n, win:w/n };
    };
    const base=run(null), atk=run("attack"), def=run("defend");
    assert.ok(atk.gf>base.gf,"攻撃重視は点が増える: "+base.gf.toFixed(2)+" → "+atk.gf.toFixed(2));
    assert.ok(atk.ga>base.ga,"攻撃重視は失点も増える: "+base.ga.toFixed(2)+" → "+atk.ga.toFixed(2));
    assert.ok(def.ga<base.ga,"守備重視は失点が減る: "+base.ga.toFixed(2)+" → "+def.ga.toFixed(2));
    assert.ok(def.gf<base.gf,"守備重視は点も減る: "+base.gf.toFixed(2)+" → "+def.gf.toFixed(2));
    // **どれも「押せば勝てる」にしない**。勝率は指示なしから大きく離れない
    for(const [lab,r] of [["攻撃",atk],["守備",def]])
      assert.ok(Math.abs(r.win-base.win)<0.08,
        lab+"重視が一方的に強くない: "+(base.win*100).toFixed(1)+"% → "+(r.win*100).toFixed(1)+"%");
    console.log("表と裏OK 指示なし",base.gf.toFixed(2)+"-"+base.ga.toFixed(2),
      "／ 攻撃",atk.gf.toFixed(2)+"-"+atk.ga.toFixed(2),
      "／ 守備",def.gf.toFixed(2)+"-"+def.ga.toFixed(2),
      "／ 勝率",[base,atk,def].map(r=>(r.win*100).toFixed(1)+"%").join(" / "));
  }

  // --- 試合中に積める。次のティックの頭で効く ---
  {
    const M=E.createMatch(side(),side(),9);
    E.stepMatch(M); E.stepMatch(M);
    assert.ok(E.orderMatch(M,"H",{ type:"order", id:"defend" }),"試合中に指示を積める");
    E.stepMatch(M);
    assert.strictEqual(M.home.order,"defend","次のティックで効く");
    assert.ok(M.events.some(e=>e.type==="order"&&e.side==="H"),"記録に残る");
    E.orderMatch(M,"H",{ type:"order", id:null }); E.stepMatch(M);
    assert.strictEqual(M.home.order,null,"いつでも解除できる");
    console.log("試合中の指示OK 積む→次のティックで反映→解除まで");
  }
  // ---------- 軸(キープレイヤー → docs/03 §3.44) ----------
  {
    const K = E.TUNING.kp;
    // **能力に倍率が掛かる**。集まりやすさも強さも、これ1つから出る
    const mk = kp => ({ c: { atk: 10, def: 10, pow: 10, tec: 10, spd: 10, sta: 10, kp: kp },
      fit: 1, stam: 1, condK: 1, stat: {} });
    assert.ok(Math.abs(E.eff(mk(true), "atk") / E.eff(mk(false), "atk") - K.power) < 1e-9,
      "軸は能力に " + K.power + " 倍が掛かる");

    // **条件つきの札が条件なしで使える**
    const late = { when: "late" };
    assert.strictEqual(E.skOn(late, mk(false), 10), false, "軸でなければ条件を見る");
    assert.strictEqual(E.skOn(late, mk(true), 10), true, "軸なら条件を飛ばす");

    // **軸を張った時間ぶんだけ消耗が残る**(外しても戻らない)
    const p0 = { c: { sta: 10 }, stat: { inv: 0 }, enter: 0 };
    const p1 = { c: { sta: 10 }, stat: { inv: 0 }, enter: 0, kpMin: 30 };
    assert.ok(E.staminaOf(p1, 45) < E.staminaOf(p0, 45), "軸を張った選手のほうが減る");
    const p2 = { c: { sta: 10, kp: false }, stat: { inv: 0 }, enter: 0, kpMin: 30 };
    assert.strictEqual(E.staminaOf(p2, 45), E.staminaOf(p1, 45),
      "軸を外しても、張っていた時間ぶんは戻らない");

    // **相手の軸はクラブと節から決まる**(下見でも試合でも同じ選手)
    await E.newGame();
    E.getS().coach = "検証"; E.startTenure("sam-8");
    const a = E.cpuSquad("sam-1"), b = E.cpuSquad("sam-1");
    assert.strictEqual(a.kp, b.kp, "何度引いても同じ選手が軸");
    assert.ok(a.cards.some(c => c.id === a.kp), "軸は先発の中にいる");
    const side = E.matchSide("sam-1");
    assert.strictEqual(side.cards.filter(c => c.kp).length, 1, "相手の軸はちょうど1人");
    assert.strictEqual(side.kp, a.kp, "試合に出てくる軸と下見の軸が一致する");
    console.log("軸OK 能力 ×" + K.power + " ／ 条件つきの札が常時 ／ 消耗は張った時間ぶん残る"
      + " ／ 相手の軸も決定的");
  }

  // ---------- 特別采配(→docs/03 §3.50) ----------
  {
    await E.newGame();
    const S = E.getS(); S.coach = "検証"; E.startTenure("sam-8");

    // **最初から持っているのはダイレクトプレーだけ**
    assert.deepStrictEqual(E.tacticsKnown(), ["direct"], "最初の1つ");
    assert.strictEqual(E.tacticWhy("direct"), null, "熟練度0でも使える");

    // **覚えていないと使えない**
    const hp = E.tacticById("highpress");
    assert.ok(E.tacticWhy(hp.id).indexOf("身につけ") >= 0, "覚えていない: " + E.tacticWhy(hp.id));
    assert.ok(E.learnTactic(hp.id), "覚えられる");
    assert.strictEqual(E.learnTactic(hp.id), false, "二度は覚えない");

    // **クラブの熟練度が足りないと使えない**(→§3.50 の肝)
    S.club.exp = 0;
    assert.ok(E.tacticWhy(hp.id).indexOf("熟練度") >= 0, "熟練度が足りない");
    S.club.exp = hp.exp;
    assert.strictEqual(E.tacticWhy(hp.id), null, "足りれば使える");

    // **熟練度はクラブのもの**。移籍すると0から積み直し
    S.player.fame = 3000;
    E.startTenure("sam-7");
    assert.strictEqual(S.club.exp, 0, "移籍したらクラブの熟練度は0から");
    assert.ok(E.tacticsKnown().includes(hp.id), "覚えた采配は監督に残る");
    assert.ok(E.tacticWhy(hp.id), "覚えていても、そのクラブでは使えない");
    S.club.exp = 99999;

    // **陣形の縛り**
    const sc = E.tacticById("shortcounter");
    E.learnTactic(sc.id);
    S.form = "5-3-2";
    assert.ok(E.tacticWhy(sc.id).indexOf("しか使えません") >= 0,
      "陣形が違う: " + E.tacticWhy(sc.id));
    S.form = sc.form[0];
    assert.strictEqual(E.tacticWhy(sc.id), null, "合う陣形なら使える");

    // **札として全員に混ざる**(→§3.50)。発動すればカットインにも出る
    const side = { cards: E.bestXI(E.clubRoster(4242, "sam-8"), "4-4-2"),
      form: "4-4-2", name: "H", tactic: "highpress" };
    const M = E.createMatch(side, { ...side, tactic: null }, 7);
    const has = M.home.players.every(p => p.sk.ch.some(x => x.name === hp.label)
      || p.sk.k.cover != null);
    assert.ok(has, "全員に采配の札が混ざる");
    assert.ok(!M.away.players[0].sk.ch.some(x => x.name === hp.label),
      "采配を敷いていない側には混ざらない");

    // **指示と足し算になる**(上げ下げが合成される)
    const y0 = M.home.players[5].y;
    E.setTeamOrder(M.home, "attack");
    assert.ok(M.home.players[5].y < y0, "采配と指示で前に出る");
    console.log("特別采配OK 覚える(監督) × 熟練度(クラブ) × 陣形 ／"
      + " 札として全員に混ざる ／ 指示と足し算");
  }

  // ---------- 采配を盗む(→docs/03 §3.51) ----------
  {
    await E.newGame();
    const S = E.getS(); S.coach = "検証"; S.world.seed = 20260814;
    E.startTenure("sam-8");

    // **1部と2部だけが采配を敷く**(3部は素朴に戦う)
    const byDiv = { 1: 0, 2: 0, 3: 0 }, has = { 1: 0, 2: 0, 3: 0 };
    for (const c of E.CLUBS) { byDiv[c.div]++; if (E.clubTactic(c.id)) has[c.div]++; }
    assert.strictEqual(has[3], 0, "3部は采配を敷かない");
    assert.ok(has[1] > byDiv[1] * 0.5, "1部の多くが敷いている: " + has[1] + "/" + byDiv[1]);
    assert.ok(has[2] > 0, "2部も敷いている");
    // **同じクラブなら何度引いても同じ**(下見と試合で食い違わない)
    const id = E.CLUBS.find(c => c.div === 1).id;
    assert.strictEqual(E.clubTactic(id), E.clubTactic(id), "クラブから決まる");
    assert.strictEqual(E.cpuSquad(id).tactic, E.clubTactic(id), "下見と一致する");

    // **上のリーグほど高い采配が並ぶ**
    const top = E.CLUBS.filter(c => c.div <= 2 && E.leagueById(c.league).tier >= 5)
      .map(c => E.clubTactic(c.id)).filter(Boolean);
    const low = E.CLUBS.filter(c => c.div <= 2 && E.leagueById(c.league).tier <= 2)
      .map(c => E.clubTactic(c.id)).filter(Boolean);
    const expOf = a => a.reduce((s, t) => s + E.tacticById(t).exp, 0) / Math.max(1, a.length);
    assert.ok(expOf(top) > expOf(low),
      "上のリーグほど賢い: " + expOf(top).toFixed(0) + " > " + expOf(low).toFixed(0));

    // **覚えていないものだけ、確率で覚える**
    S.player.tactics = ["direct"];
    assert.strictEqual(E.learnRoll("direct", "win", 1, false), null, "知っている采配は引かない");
    let got = 0, n = 0;
    for (let i = 1; i <= 400; i++) {
      S.player.tactics = ["direct"]; S.player.mail = []; S.career.node = i;
      n++; if (E.learnRoll("highpress", "win", i, false)) got++;
    }
    const rate = got / n;
    assert.ok(Math.abs(rate - E.TUNING.learn.win) < 0.06,
      "勝ったときの当たりが " + (E.TUNING.learn.win * 100) + "% 前後: "
      + (rate * 100).toFixed(1) + "%");
    // **負けても少しは覚える**(勝ったときより低い)
    let lo = 0;
    for (let i = 1; i <= 400; i++) {
      S.player.tactics = ["direct"]; S.player.mail = []; S.career.node = i;
      if (E.learnRoll("highpress", "lose", i, false)) lo++;
    }
    assert.ok(lo < got, "負けたときのほうが覚えにくい: " + lo + " < " + got);

    // **連絡が届き、受け取って初めて覚える**(→docs/03 §3.50)。
    // 選手も采配も、届くものは秘書の受信箱を通す
    S.player.tactics = ["direct"]; S.player.mail = []; S.career.node = 1;
    for (let i = 1; i <= 200; i++) { S.career.node = i;
      if (E.learnRoll("highpress", "win", i, false)) break; }
    assert.ok(!E.tacticsKnown().includes("highpress"), "受け取る前は覚えていない");
    const lm = E.mailList().find(m => String(m.id).indexOf("learn:") === 0);
    assert.ok(lm, "采配の連絡が届く");
    const ld = E.mailDef(lm);
    assert.ok(ld.title.indexOf("を習得しました") >= 0, "「習得しました」と書く: " + ld.title);
    assert.ok(ld.text.indexOf("熟練度") >= 0, "熟練度の但し書きがある");
    E.mailTake(lm.id);
    assert.ok(E.tacticsKnown().includes("highpress"), "受け取ると覚えている");
    assert.strictEqual(S.player.mail.length, 1, "受信箱に連絡が届く");
    console.log("采配を盗むOK 1部2部だけが敷く ／ 上のリーグほど賢い ／"
      + " 勝ち " + (rate * 100).toFixed(0) + "% > 負け ／ 覚えたら連絡");
  }

  process.exit(0);
})().catch(e=>{ console.error("FAIL:",e); process.exit(1); });
