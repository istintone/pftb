const assert=require("assert");
const { setup }=require("./_setup.js");
const E=setup({tmpName:"_tmp_pso.js"});
(async()=>{
  await E.newGame(); E.getS().coach="検証";
  E.getS().world.seed=20260805; E.startTenure("sam-8");
  const S=E.getS(), P=E.TUNING.pso;
  // **相手を毎回変える**。同じクラブ同士で回すと GK が1人に固定され、
  // 決定率が「その1枚が何を引いたか」で決まってしまう(実際に隠れていた → docs/08 §8.6)
  const side=()=>E.matchSide(S.club.id);
  const foe=i=>{ const r=E.clubRoster(20260805,"esp-"+(1+i%8));
    return { cards:E.bestXI(r,"4-4-2"), form:"4-4-2", name:"foe" }; };
  let drawn=0, ko=0, sudden=0, maxN=0, conv=0, kicksAll=0;
  for(let i=0;i<400;i++){
    const M=E.finishMatch(E.createMatch(side(),foe(i),i+1,{ko:true}));
    if(M.home.score!==M.away.score){ assert.ok(!M.pso,"決着した試合にPK戦は無い"); continue; }
    drawn++; ko++;
    assert.ok(M.pso,"同点ならPK戦がある");
    assert.ok(M.pso.win==="H"||M.pso.win==="A","必ず決着する");
    if(!M.pso.capped)assert.notStrictEqual(M.pso.hg,M.pso.ag,"上限までいかなければ差が付く");
    const kicks=M.events.filter(e=>e.type==="pso");
    maxN=Math.max(maxN,kicks.length);
    kicksAll+=kicks.length; conv+=kicks.filter(e=>e.ok).length;
    if(kicks.length>P.rounds*2)sudden++;
    // 交互に蹴る
    for(let k=0;k<kicks.length-1;k++)
      if(kicks[k].n===kicks[k+1].n)
        assert.notStrictEqual(kicks[k].side,kicks[k+1].side,"同じ本数は先攻後攻で1本ずつ");
    // 途中経過が合っている
    let h=0,a=0;
    for(const e of kicks){ if(e.ok)e.side==="H"?h++:a++;
      assert.strictEqual(e.hg,h,"途中経過(H)"); assert.strictEqual(e.ag,a,"途中経過(A)"); }
    assert.strictEqual(M.pso.hg,h,"最終スコア(H)");
    assert.strictEqual(M.pso.ag,a,"最終スコア(A)");
    // GKは蹴らない
    for(const e of kicks){
      const p=E.playerOf(M,e.side,e.by);
      assert.ok(p&&p.role!=="GK","GKは蹴らない");
    }
  }
  assert.ok(drawn>0,"同点の試合がある");
  // **決定率が現実的か**。判定を反転させると 0-1 のような点になる(実際になった)
  assert.ok(conv/kicksAll>0.55&&conv/kicksAll<0.92,
    "PKの決定率が現実的: "+(conv/kicksAll*100).toFixed(0)+"%");
  assert.ok(maxN<=P.suddenMax*2,"上限を超えて蹴らない");
  console.log("PK戦OK",drawn,"件 / 400試合 ／ 決定率",(conv/kicksAll*100).toFixed(0)+"%",
    "／ 最長",maxN,"本 ／ サドンデス",sudden,"件");

  // ノックアウトでなければPK戦は起きない
  {
    let any=false;
    for(let i=0;i<200;i++){
      const M=E.finishMatch(E.createMatch(side(),side(),i+1));
      if(M.pso)any=true;
    }
    assert.ok(!any,"リーグ戦ではPK戦をしない");
    console.log("リーグ戦OK 引き分けはそのまま引き分け");
  }

  // 同じたねなら同じ結果(→docs/07 §7.1)。**引き分けになるたねを探して**確かめる
  {
    let seed=null;
    for(let i=1;i<200&&seed===null;i++){
      const M=E.finishMatch(E.createMatch(side(),side(),i,{ko:true}));
      if(M.pso)seed=i;
    }
    assert.ok(seed,"引き分けになるたねが見つかる");
    const a=E.finishMatch(E.createMatch(side(),side(),seed,{ko:true}));
    const b=E.finishMatch(E.createMatch(side(),side(),seed,{ko:true}));
    assert.deepStrictEqual(a.pso,b.pso,"同じたねなら同じPK戦");
    assert.deepStrictEqual(a.events.filter(e=>e.type==="pso").map(e=>e.by+":"+e.ok),
      b.events.filter(e=>e.type==="pso").map(e=>e.by+":"+e.ok),"蹴った順も同じ");
    console.log("決定性OK PK "+a.pso.hg+"-"+a.pso.ag+"(たね"+seed+")");
  }
  process.exit(0);
})().catch(e=>{ console.error("FAIL:",e); process.exit(1); });
