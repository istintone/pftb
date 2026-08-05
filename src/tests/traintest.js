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

  // --- 覚醒も任期が明ければ消える ---
  E.newTenure();
  assert.strictEqual(E.trainStar(pid),0,"★も任期で消える");
  assert.strictEqual(E.trainUps(pid),null,"裏パラも消える");
  console.log("任期リセットOK ★も裏パラも次の任期には持ち越さない");
  process.exit(0);
})().catch(e=>{ console.error("FAIL:",e); process.exit(1); });
