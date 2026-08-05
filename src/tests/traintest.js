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

  // --- 裏パラはまだ無い(第2段で足す) ---
  assert.strictEqual(E.trainStar(id),0,"★はまだ0");
  assert.strictEqual(E.trainUps(id),null,"裏パラはまだ無い");
  console.log("訓練の定義OK",E.TRAININGS.map(t=>t.label+"("+t.stat.toUpperCase()+")").join(" / "));
  process.exit(0);
})().catch(e=>{ console.error("FAIL:",e); process.exit(1); });
