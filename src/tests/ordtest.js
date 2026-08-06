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
    const a0=p.c.atk*p.fit*p.stam, d0=p.c.def*p.fit*p.stam;
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
  process.exit(0);
})().catch(e=>{ console.error("FAIL:",e); process.exit(1); });
