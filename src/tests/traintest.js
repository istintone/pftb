const assert=require("assert");
const { setup }=require("./_setup.js");
const E=setup({tmpName:"_tmp_train.js"});
(async()=>{
  await E.newGame(); E.getS().coach="検証";
  E.getS().world.seed=20260805; E.startTenure("sam-8");
  const S=E.getS(), id=S.squad.find(Boolean);

  // --- 経験点は能力ごとに貯まる ---
  assert.strictEqual(E.trainExp(id,"atk"),0,"最初は0");
  assert.strictEqual(E.trainAdd(id,"atk",3),3,"足せる");
  assert.strictEqual(E.trainAdd(id,"atk",2),5,"積み上がる");
  assert.strictEqual(E.trainExp(id,"def"),0,"別の能力には入らない");
  assert.strictEqual(E.trainAdd(id,"nope",5),0,"知らない能力は無視する");
  assert.strictEqual(E.trainAdd(id,"atk",0),0,"失敗(0)は増えない");
  console.log("経験点OK atk",E.trainExp(id,"atk"),"/ def",E.trainExp(id,"def"));

  // --- 手応えごとの幅が定義どおり ---
  const G=E.TUNING.train;
  assert.ok(G.okLo>=1&&G.okHi<=3,"成功は1〜3");
  assert.ok(G.greatLo>=3&&G.greatHi<=5,"大成功は3〜5");
  assert.strictEqual(G.need,10,"覚醒は経験点10から");
  assert.strictEqual(G.maxStar,5,"★は5つまで");

  // --- 記録は career にあるので、任期が明ければ消える ---
  assert.ok(S.career.train[id],"任期の記録として持つ");
  const coll=S.player.coll.length, fame=S.player.fame;
  E.newTenure();
  assert.deepStrictEqual(E.getS().career.train,{},"任期が明けると経験点は消える");
  assert.strictEqual(E.getS().player.coll.length,coll,"カードは残る");
  assert.strictEqual(E.getS().player.fame,fame,"名声も残る");
  console.log("任期リセットOK 経験点だけ消えて、カードと名声は残る");

  console.log("訓練の定義OK",E.TRAININGS.map(t=>t.label+"("+t.stat.toUpperCase()+")").join(" / "));

  // ---------- 覚醒(→docs/03 §3.30) ----------
  E.startTenure("sam-8");
  const S2=E.getS(), pid=S2.squad.find(Boolean);
  assert.strictEqual(E.trainReady(pid),null,"経験点が無ければ覚醒しない");
  E.trainAdd(pid,"atk",G.need-1);
  assert.strictEqual(E.trainReady(pid),null,"あと1点では起きない: "+E.trainExp(pid,"atk"));
  E.trainAdd(pid,"atk",1);
  assert.strictEqual(E.trainReady(pid),"atk","経験点"+G.need+"で覚醒できる");
  // **いちばん多い能力**が対象になる
  E.trainAdd(pid,"tec",G.need+4);
  assert.strictEqual(E.trainReady(pid),"tec","経験点が多いほうが対象");

  // --- 成功: ★が増え、その能力だけ経験点が0に戻る ---
  const before={ atk:E.trainExp(pid,"atk"), tec:E.trainExp(pid,"tec") };
  E.trainAwake(pid,"tec");
  assert.strictEqual(E.trainStar(pid),1,"★が1つ増える");
  assert.strictEqual(E.trainUp(pid,"tec"),1,"裏パラが+1");
  assert.strictEqual(E.trainExp(pid,"tec"),0,"消費した能力の経験点は0に戻る");
  assert.strictEqual(E.trainExp(pid,"atk"),before.atk,"**他の能力の経験点は残る**");
  assert.deepStrictEqual(E.trainUps(pid),{ tec:1 },"裏パラを引ける");
  console.log("覚醒OK ★1 / TEC 裏+1 / TEC経験点",before.tec,"→0 / ATKは",before.atk,"のまま");

  // --- ★は上限まで。到達したら覚醒は起きない ---
  for(let i=1;i<G.maxStar;i++){
    E.trainAdd(pid,"pow",G.need*3);          // atk に残っている経験点より多く積む
    assert.strictEqual(E.trainReady(pid),"pow","★"+i+"でもまだ覚醒できる");
    E.trainAwake(pid,"pow");
  }
  assert.strictEqual(E.trainStar(pid),G.maxStar,"★は"+G.maxStar+"まで");
  E.trainAdd(pid,"spd",G.need+5);
  assert.strictEqual(E.trainReady(pid),null,"★が上限なら覚醒は起きない");
  console.log("★上限OK ★"+G.maxStar+" に達すると覚醒イベントは発生しない");

  // --- 裏パラは試合の素の能力に足される(カードの表示は変えない) ---
  {
    const card=E.cardById(pid);
    const base=card.tec;
    const side=E.matchSide(S2.club.id);
    const c2=side.cards.find(c=>c.id===pid);
    assert.strictEqual(card.tec,base,"カードそのものは書き換えない");
    assert.strictEqual(c2.tec,base,"表示用の数値も変わらない");
    assert.strictEqual(c2.up.tec,1,"裏パラを添えて渡す");
    // eff は素の能力に裏パラを足す
    const M=E.createMatch(side,side,7);
    const p2=M.home.players.find(x=>x.c.id===pid);
    if(p2){
      const want=(base+1)*p2.fit*p2.stam;
      assert.ok(Math.abs(E.eff(p2,"tec")-want)<1e-9,
        "試合では裏パラぶん上がる: "+E.eff(p2,"tec").toFixed(2)+" / "+want.toFixed(2));
      console.log("試合への反映OK TEC 表示",base,"／ 試合",base+1,"(上限20を超えることは許容)");
    }
  }

  // --- 覚醒の2択は2つ。どちらが当たりかは50/50 ---
  assert.strictEqual(E.AWAKES.length,2,"選択肢は2つ");
  assert.deepStrictEqual(E.AWAKES.map(a=>a.id),["believe","hint"],"IDが仕様どおり");
  {
    let win=0,n=4000;
    for(let i=0;i<n;i++)
      if(E.mulberry32((12345^E.hashStr("awake:"+i+":"+pid))>>>0)()<0.5)win++;
    const r=win/n;
    assert.ok(r>0.45&&r<0.55,"当たりは五分: "+(r*100).toFixed(1)+"%");
    console.log("2択OK",E.AWAKES.map(a=>a.label).join(" / "),"／ 当たり",(r*100).toFixed(1)+"%");
  }

  // --- 昇降格しても選手は替わらないので、★は任期のあいだ残る ---
  // **貸与の顔ぶれを任期中に入れ替えない**(→docs/03 §3.24)ので、
  // カードIDが使い回されて別人に★が付く問題も起きない
  {
    await E.newGame(); E.getS().coach="検証";
    E.getS().world.seed=20260805; E.startTenure("sam-8");
    const S3=E.getS();
    const pick=S3.club.loan[10], loanId=pick.id, who=pick.name;
    E.trainAdd(loanId,"atk",8); E.trainAwake(loanId,"tec");
    assert.strictEqual(E.trainStar(loanId),1,"貸与の選手に★が付いている");

    S3.world.matchday=E.TUNING.league.rounds+1;      // 全日程を消化した扱い
    const j=E.judgeSeason();
    // 必ず部が変わるようにする。**所属の配列も動かす**
    if(j.move.move===0){
      const from=S3.world.div, to=from===1?2:from-1;
      S3.world.divs[from-1]=S3.world.divs[from-1].filter(id=>id!==S3.club.id);
      S3.world.divs[to-1]=S3.world.divs[to-1].concat(S3.club.id);
      S3.world.div=to;
    }
    E.startNextSeason();
    const now=E.getS().club.loan.find(c=>c.id===loanId);
    assert.ok(now,"同じ選手が残っている");
    assert.strictEqual(now.name,who,"部が変わっても顔ぶれは同じ: "+now.name);
    assert.strictEqual(E.trainStar(loanId),1,"★は任期のあいだ残る");
    assert.strictEqual(E.trainExp(loanId,"atk"),8,"経験点も残る");
    console.log("昇降格OK",who,"はそのまま ／ ★も経験点も引き継ぐ");
  }

  // ---------- 連携(→docs/03 §3.31) ----------
  {
    await E.newGame(); E.getS().coach="検証";
    E.getS().world.seed=20260805; E.startTenure("sam-8");
    const S4=E.getS(), B=E.TUNING.bond;
    const sq=S4.squad.filter(Boolean);
    const [a1,b1]=sq;

    // 組は順序を持たない / 合計は組の値の2倍
    assert.strictEqual(E.bondKey(a1,b1),E.bondKey(b1,a1),"キーは順序を持たない");
    assert.strictEqual(E.bondOf(a1,b1),0,"任期の頭は0");
    E.bondAdd(a1,b1,4); E.bondAdd(b1,a1,3);
    assert.strictEqual(E.bondOf(a1,b1),7,"どちらから足しても同じ組に入る");
    assert.strictEqual(E.bondSum(a1,b1),14,"合計はお互いのぶん(=組の値×2)");
    assert.strictEqual(E.bondAdd(a1,a1,5),0,"自分自身とは組まない");

    // --- 試合: 全員と +1、国籍が同じなら +1、コンビが同じなら +1(最大3) ---
    S4.career.bond={};
    E.bondMatch();
    const card=id=>E.cardById(id);
    let seen={ 1:0, 2:0, 3:0 };
    for(let i=0;i<sq.length;i++)for(let j=i+1;j<sq.length;j++){
      const x=card(sq[i]), y=card(sq[j]);
      const want=B.match.base
        +(x.nation===y.nation?B.match.nation:0)
        +(x.club&&x.club===y.club?B.match.club:0);
      assert.strictEqual(E.bondOf(sq[i],sq[j]),want,
        "1試合ぶんが定義どおり: "+x.name+" × "+y.name);
      seen[want]=(seen[want]||0)+1;
    }
    assert.ok(seen[1]||seen[2]||seen[3],"組が数えられている");
    assert.ok(!Object.keys(seen).some(k=>+k>3),"上限は3");
    console.log("試合の連携OK +1のみ",seen[1]||0,"組 / +2",seen[2]||0,"組 / +3",seen[3]||0,"組");

    // --- 交流: 手応えぶんが**両者の組**に入る ---
    S4.career.bond={};
    E.bondAdd(a1,b1,B.great);
    assert.strictEqual(E.bondOf(a1,b1),B.great,"大成功 +"+B.great);
    E.bondAdd(a1,b1,B.ok);
    assert.strictEqual(E.bondOf(a1,b1),B.great+B.ok,"成功 +"+B.ok);
    E.bondAdd(a1,b1,B.fail);
    assert.strictEqual(E.bondOf(a1,b1),B.great+B.ok,"失敗は増えない");

    // --- 編成から外れたら、その選手の連携だけ消える ---
    const other=[sq[2],sq[3]];
    E.bondAdd(other[0],other[1],20);
    const ties=E.bondTies(a1);
    assert.ok(ties>0,"外す選手は連携を持っている: "+ties+"人");
    E.bondDrop(a1);
    assert.strictEqual(E.bondOf(a1,b1),0,"外れた選手の連携は消える");
    assert.strictEqual(E.bondOf(other[0],other[1]),20,"関係のない組は残る");
    console.log("リセットOK",ties,"人ぶんを捨て、他の組は残る");

    // --- しきい値の段 ---
    assert.strictEqual(E.bondTier(B.t1),0,"しきい値ちょうどではまだ上がらない");
    assert.strictEqual(E.bondTier(B.t1+1),1,"t1 を超えて1段");
    assert.strictEqual(E.bondTier(B.t2+1),2,"t2 を超えて2段");
    assert.strictEqual(E.bondTier(B.t3+1),3,"t3 を超えて3段");

    // --- パスの成功率が上がる(段が上がるほど) ---
    {
      const mk=v=>{
        const side=E.matchSide(S4.club.id);
        side.cards=side.cards.map(c=>({ ...c, bond:null }));
        if(v){ const ids=side.cards.map(c=>c.id);
          side.cards=side.cards.map(c=>{
            const bond={}; ids.forEach(o=>{ if(o!==c.id)bond[o]=v; });
            return { ...c, bond };
          }); }
        return side;
      };
      const rate=v=>{
        let ok=0,n=0;
        for(let i=0;i<60;i++){
          const M=E.finishMatch(E.createMatch(mk(v),mk(0),i+1));
          for(const e of M.events)
            if(e.side==="H"&&e.kind==="pass"){ n++; if(e.ok)ok++; }
        }
        return ok/n;
      };
      const r0=rate(0), r3=rate(Math.ceil((B.t3+2)/2));
      assert.ok(r3>r0,"連携が高いほどパスが通る: "
        +(r0*100).toFixed(1)+"% → "+(r3*100).toFixed(1)+"%");
      const up=(r3/r0-1)*100;
      assert.ok(up<25,"上がりすぎない: +"+up.toFixed(1)+"%");
      console.log("パスへの効きOK",(r0*100).toFixed(1)+"% → "+(r3*100).toFixed(1)+"%",
        "(+"+up.toFixed(1)+"%) ／ 倍率 ×"+B.k3);
    }

    // --- 任期が明ければ消える ---
    E.bondAdd(sq[4],sq[5],30);
    E.newTenure();
    assert.deepStrictEqual(E.getS().career.bond,{},"任期が明けると連携も消える");
    console.log("連携の任期リセットOK");
  }

  // ---------- コンディション(→docs/03 §3.32) ----------
  {
    await E.newGame(); E.getS().coach="検証";
    E.getS().world.seed=20260805; E.startTenure("sam-8");
    const S5=E.getS(), C=E.TUNING.cond;

    // 任期の頭は全員が普通
    assert.strictEqual(E.COND_MAX,4,"段は0〜4");
    for(const id of S5.squad.filter(Boolean))
      assert.strictEqual(E.condOf(id),2,"新任の1節目は全員が普通");
    assert.deepStrictEqual(S5.career.cond,{},"記録は空のまま(=普通)");

    // 段ごとの倍率。2が等倍で、下は落ち、上は伸びる
    assert.strictEqual(C.mul.length,5,"倍率は5段");
    assert.strictEqual(E.condMul(2),1,"普通は等倍");
    assert.ok(E.condMul(0)<E.condMul(1)&&E.condMul(1)<1,"ケガ<不調<普通");
    assert.ok(1<E.condMul(3)&&E.condMul(3)<E.condMul(4),"普通<好調<絶好調");
    // 倍率そのものは小さくても、判定が連鎖するので効きは大きい(下の勝率で見る)
    assert.ok(E.condMul(0)<=E.condMul(1)-0.05,"ケガは不調よりはっきり落ちる: ×"+E.condMul(0));
    // **普段の上下は1〜4**。0(ケガ)はイベントでしか起きない
    const id0=S5.squad.find(Boolean);
    E.condSet(id0,1); E.condMove(id0,-1);
    assert.strictEqual(E.condOf(id0),E.COND_MIN,"普段の上下では1より下がらない");
    assert.ok(!E.condHurt(id0),"普段の上下ではケガにならない");
    E.condSet(id0,4); E.condMove(id0,1);
    assert.strictEqual(E.condOf(id0),4,"4より上がらない");
    // ケガはイベントの入口からだけ。**普段の上下では治らない**
    E.condInjure(id0);
    assert.strictEqual(E.condOf(id0),E.COND_HURT,"ケガにできる");
    assert.ok(E.condHurt(id0),"ケガと判定される");
    E.condMove(id0,1);
    assert.strictEqual(E.condOf(id0),E.COND_HURT,"普段の上下では治らない(休息で治す)");
    E.condSet(id0,2);
    console.log("コンディションOK 倍率",C.mul.join(" / "),
      "／ 普段は"+E.COND_MIN+"〜"+E.COND_MAX+" ／ 0はケガのイベントのみ");

    // --- 試合のあとに動く。**採点で動く人 + 揺さぶり** ---
    {
      S5.career.cond={};
      const side=()=>E.matchSide(S5.club.id);
      const M=E.finishMatch(E.createMatch(side(),side(),4242));
      const moved=E.condAfterMatch(M,"H",4242);
      assert.ok(moved.length,"誰かは動く");
      assert.ok(moved.some(m=>m.by==="stat"),"採点でも動く(clamp で全部止まっていない)");
      const shake=moved.filter(m=>m.by==="shake");
      assert.ok(shake.length>=C.shakeLo&&shake.length<=C.shakeHi,
        "揺さぶりは"+C.shakeLo+"〜"+C.shakeHi+"人: "+shake.length);
      // 採点で動いた選手は、良ければ上・悪ければ下
      const rows=E.matchRatings(M,"H");
      for(const m of moved.filter(x=>x.by==="stat")){
        const r=rows.find(x=>x.p.c.id===m.id);
        assert.ok(r&&r.min,"出た選手だけが採点で動く");
        assert.strictEqual(m.d,r.rating>=C.up?1:-1,"採点の向きと一致");
      }
      for(const id of Object.keys(S5.career.cond))
        assert.ok(S5.career.cond[id]>=E.COND_MIN&&S5.career.cond[id]<=E.COND_MAX,
          "試合のあとの段は"+E.COND_MIN+"〜"+E.COND_MAX+"に収まる(ケガにはならない)");
      console.log("試合後の変化OK 採点で",moved.filter(m=>m.by==="stat").length,
        "人 / 揺さぶりで",shake.length,"人");
    }

    // --- 相手クラブにも配られる。**強いクラブほど上に寄る** ---
    {
      const avg=id=>{
        let s=0,n=400;
        for(let i=0;i<n;i++)s+=E.condCpu(id,E.mulberry32(i+1));
        return s/n;
      };
      const top=avg("eng-1"), low=avg("sam-24");
      assert.ok(top>low,"格上のほうが調子がいい: "+top.toFixed(2)+" > "+low.toFixed(2));
      assert.ok(top<=E.COND_MAX&&low>=E.COND_MIN,"相手にもケガは配らない(1〜4)");
      console.log("相手の調子OK プレミア首位",top.toFixed(2),"> カンピDIV3最下位",low.toFixed(2));
    }

    // --- 試合では素の能力に一様に掛かる ---
    {
      const mk=v=>{
        const side=E.matchSide(S5.club.id);
        side.cards=side.cards.map(c=>({ ...c, cond:v }));
        return side;
      };
      const M=E.createMatch(mk(4),mk(2),9);
      const a=M.home.players[0], b=M.away.players[0];
      assert.ok(Math.abs(a.condK-C.mul[4])<1e-9,"絶好調の倍率が乗る");
      assert.ok(Math.abs(b.condK-C.mul[2])<1e-9,"普通は等倍");
      assert.ok(Math.abs(E.eff(a,"atk")/(a.c.atk*a.fit*a.stam)-C.mul[4])<1e-9,
        "eff に一様に掛かる");
      // 絶好調のチームのほうが勝ちやすい
      let w=0,n=400;
      for(let i=0;i<n;i++){ const r=E.resolveMatch(mk(4),mk(2),i+1); if(r.hg>r.ag)w++; }
      const r2=w/n;
      assert.ok(r2>0.40,"絶好調のほうが勝ち越す: "+(r2*100).toFixed(1)+"%");
      // **効きすぎない**。1段の差で勝負が決まってしまうと、編成より運の話になる
      // (0=ケガはイベントでしか起きないが、起きたときの重さはここで見る)
      let w0=0;
      for(let i=0;i<400;i++){ const r=E.resolveMatch(mk(0),mk(2),i+1); if(r.hg>r.ag)w0++; }
      assert.ok(w0/400<r2*0.5,"ケガだらけなら明確に不利: "+(w0/400*100).toFixed(1)+"%");
      assert.ok(r2<0.70,"絶好調でも勝ちが決まるほどではない: "+(r2*100).toFixed(1)+"%");
      console.log("試合への反映OK 絶好調 vs 普通",(r2*100).toFixed(1)+"%",
        "／ ケガだらけ vs 普通",(w0/400*100).toFixed(1)+"%");
    }

    // --- 任期が明ければ消える ---
    E.condSet(S5.squad.find(Boolean),4);
    E.newTenure();
    assert.deepStrictEqual(E.getS().career.cond,{},"任期が明けると全員が普通に戻る");
    console.log("コンディションの任期リセットOK");
  }

  // --- 覚醒も任期が明ければ消える ---
  E.newTenure();
  assert.strictEqual(E.trainStar(pid),0,"★も任期で消える");
  assert.strictEqual(E.trainUps(pid),null,"裏パラも消える");
  console.log("任期リセットOK ★も裏パラも次の任期には持ち越さない");
  process.exit(0);
})().catch(e=>{ console.error("FAIL:",e); process.exit(1); });
