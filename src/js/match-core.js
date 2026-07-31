// ================= 試合の純粋計算 =================
// DOM に一切触らない。ここが独立していることで
//   ・他クラブ同士の試合を毎節そのまま解決できる(描画しないので一瞬)
//   ・スキップ / 自動消化が同じ経路に乗る
//   ・headless Node でシーズンを何百回も回してバランス検証できる
// → docs/03-game-design.md §3.6
//
// ⚠ 現状は**暫定の強さ比較リゾルバ**。第3段でフル試合エンジン(起点→連鎖→シュート)に
//   置き換えるが、resolveMatch の入出力は変えない。呼び出し側はそのまま動く。

/** チーム1つ分の「試合に効く強さ」。編成のOVRと枠適性から出す。 */
function teamStrength(cards,form){
  const slots=FORMATIONS[form||DEFAULT_FORM];
  let total=0,n=0;
  cards.forEach((c,i)=>{
    if(!c)return;
    const sub=slots[i]?slots[i][0]:null;
    total+=c.ovr*(sub?slotFit(c,sub):1);
    n++;
  });
  return n?total/n:0;
}

/** ポアソン分布から得点を引く(rng は 0..1 を返す関数)。 */
function poisson(rng,lambda){
  const L=Math.exp(-lambda);
  let k=0,p=1;
  do{ k++; p*=rng(); }while(p>L);
  return clamp(k-1,0,TUNING.sim.maxGoals);
}

/**
 * 1試合を解決する。
 *   home/away : { strength:number }
 *   rng       : 決定的乱数(省略時は Math.random)
 * 返り値: { hg, ag }  ホーム/アウェイの得点
 */
function resolveMatch(home,away,rng){
  const R=rng||Math.random;
  const S_=TUNING.sim;
  const d=(home.strength-away.strength)/S_.spread;      // 強さ差 → 期待得点の傾き
  const hl=clamp(S_.base+d*0.55+S_.homeAdv,0.15,4.5);
  const al=clamp(S_.base-d*0.55,0.15,4.5);
  return { hg:poisson(R,hl), ag:poisson(R,al) };
}
