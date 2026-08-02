// ================= 試合の純粋計算 =================
// DOM に一切触らない。ここが独立していることで
//   ・他クラブ同士の試合を毎節そのまま解決できる(描画しないので一瞬)
//   ・スキップ / 自動消化が同じ経路に乗る
//   ・headless Node でシーズンを何百回も回してバランス検証できる
// → docs/03-game-design.md §3.6 / docs/07-match-engine.md
//
// ★ 設計の柱: **見せかけのロジックを持たない**(→docs/07 §7.1)
//   simulateMatch() が90分を**先に最後まで解き**、起きたことを events[] に残す。
//   描画はその events を再生するだけで、勝敗にも位置にも影響しない。
//   ・演出が結果を変えられない(構造的に不可能)
//   ・倍速 / スキップ / 自動消化が「再生速度」だけの違いになる
//   ・選手の位置もエンジンが持つので、描画は既知の座標を補間するだけでよい

// ---------- 揺らぎ ----------
/** 各スコアに乗る揺らぎ。0.6〜1.4(card-eleven から踏襲)。実力差があっても番狂わせが起きる。 */
const rr=rng=>TUNING.rng.min+rng()*TUNING.rng.span;

// ---------- 有効値 ----------
/**
 * 有効値 — **すべての判定の単一集約点**(→docs/07 §7.3)。
 * 能力に掛かる修正は必ずここへ足す。そうすれば全判定に一様に効く。
 *   いま掛かるもの : 枠適性(→§3.14)
 *   これから足すもの: 疲労 / 状況(終盤・ビハインド) / スキル / 連携
 */
function eff(p,k){
  return p.c[k]*p.fit;
}

/** 出場選手1人。カードに「どの枠か・適性はいくつか・どこに立つか」を添えた形。 */
function lineup(cards,form){
  const slots=FORMATIONS[form||DEFAULT_FORM];
  const N=TUNING.squad.starters;
  const xi=[];
  slots.forEach(([sub,x,y],i)=>{
    const c=cards[i];
    if(c)xi.push({ c, sub, role:subGroup(sub), fit:slotFit(c,sub), x, y, ix:i });
  });
  // 控えは交代で入るまで盤面に出ない(→docs/03 §3.17)。参照だけ持っておく。
  const bench=cards.slice(N,N+TUNING.squad.bench).filter(Boolean)
    .map(c=>({ c, sub:null, role:c.pos, fit:1, x:50, y:50, bench:true }));
  return { xi, bench };
}

/** チームを組む。試合中に変わる値(得点・スタッツ)もここに持たせる。 */
function buildTeam(cards,form,name,side){
  const { xi, bench }=lineup(cards,form);
  xi.forEach(p=>{ p.side=side; p.stat={ shots:0, goals:0, inv:0 }; });
  return { players:xi, bench, form, name, side, score:0 };
}

// ---------- 支配率 ----------
/**
 * 中盤の押し合い。**攻撃権はこの比で抽選する**ので、試合の主導権そのもの。
 * 中盤の tec/spd/sta を、MF を厚く重み付けして合計する(card-eleven から踏襲)。
 */
function midPower(T){
  const M=TUNING.mid;
  let s=0;
  T.players.forEach(p=>{
    const w=p.role==="MF"?M.mf:M.other;
    s+=(eff(p,"tec")*M.tec+eff(p,"spd")*M.spd+eff(p,"sta")*M.sta)*w;
  });
  return s;
}

// ---------- 選手の抽選 ----------
/** 重み付き抽選。重みが0以下の候補は選ばれない。 */
function pickW(rng,list,wfn){
  if(!list.length)return null;
  let tot=0;
  const w=list.map(x=>{ const v=Math.max(0,wfn(x)); tot+=v; return v; });
  if(tot<=0)return list[Math.floor(rng()*list.length)];
  let r=rng()*tot;
  for(let i=0;i<list.length;i++){ r-=w[i]; if(r<=0)return list[i]; }
  return list[list.length-1];
}
const outfield=T=>T.players.filter(p=>p.role!=="GK");
/** 攻撃の起点。前の選手ほど選ばれやすい。 */
const pickAttacker=(rng,T)=>pickW(rng,outfield(T),
  p=>(p.role==="FW"?3:p.role==="MF"?1.5:0.3)*eff(p,"atk"));
/** シュートを打つ選手。決定力と力で選ぶ。 */
const pickShooter=(rng,T)=>pickW(rng,outfield(T),
  p=>(p.role==="FW"?3:p.role==="MF"?1:0.2)*(eff(p,"atk")*1.2+eff(p,"pow")));
const pickGK=T=>T.players.find(p=>p.role==="GK")||T.players[0];

// ---------- 判定 ----------
/**
 * シュート vs GK。**攻撃側スコア > 守備側スコア × 閾値** の形は全判定で共通(→docs/07 §7.4)。
 * 攻守それぞれに独立して rr() が乗るので、実力差があっても番狂わせが起きる。
 */
function resolveShot(rng,atk,gk){
  const sSc=(eff(atk,"atk")*0.7+eff(atk,"pow")*0.3)*rr(rng);
  const gSc=eff(gk,"def")*rr(rng);
  return sSc>gSc*TUNING.th.shot;
}

// ---------- モメンタム(勢い) ----------
// -1..+1 の**1本のゲージ**。+ がホーム優勢(→docs/07 §7.7)。
// キックオフ時は両チームのOVR差で傾き、以後は起きたことで上下し、毎ティック中立へ戻る。
// **モメンタムが決めるのは「起点の高さ」**。押されていれば自陣から、勢いがあれば前から始まる。

/** 攻撃側から見たモメンタム。ホームは M.mom そのまま、アウェイは符号を反転。 */
const momOf=(M,T)=>T.side==="H"?M.mom:-M.mom;
/** side に勢いを加える(ホーム基準のゲージに符号を合わせて足す)。 */
function addMom(M,side,v){
  const F=TUNING.mom;
  M.mom=clamp(M.mom+(side==="H"?v:-v),-F.cap,F.cap);
}
/** キックオフ時のモメンタム。**強いチームが前から始められる**。 */
function kickoffMom(H,A){
  const F=TUNING.mom;
  const ovr=T=>T.players.reduce((s,p)=>s+p.c.ovr,0)/(T.players.length||1);
  return clamp((ovr(H)-ovr(A))/F.kickK,-F.kickCap,F.kickCap);
}

// ---------- 起点 ----------
/**
 * 選手の「高さ」。0=自陣ゴール前 / 1=敵陣ゴール前。枠のy座標から出す(→docs/07 §7.7)。
 * 陣形の座標をそのまま使うので、**陣形を変えると起点の出方も変わる**。
 */
const heightOf=p=>clamp((87-p.y)/74,0,1);

/**
 * 起点の選手を選ぶ。モメンタムで**狙う高さ**が動き、そこに近い選手ほど選ばれやすい。
 *   押されている(mom<0) → 低い位置 = DF起点
 *   拮抗(mom≒0)         → 中盤     = MF起点
 *   勢いがある(mom>0)   → 高い位置 = FW起点
 * 距離に対してガウス重みを掛けるので、**遠い位置の選手も低確率で選ばれる**(決定は確率的)。
 * 左右のレーンは当面見ない(監督の指示で操作する段で足す → §7.9)。
 */
function pickOrigin(rng,T,mom){
  const F=TUNING.mom;
  const target=clamp(0.5+mom*F.spread,0,1);
  return pickW(rng,T.players,p=>{
    const d=(heightOf(p)-target)/F.sigma;
    return Math.exp(-d*d);
  });
}
/**
 * 起点のチャンネルを選ぶ。**その選手のサブポジが持つ3種**から、
 * 得意な能力のものほど選ばれやすい(→docs/07 §7.7)。
 */
function pickOriginCh(rng,p){
  const list=ORIGINS[p.sub]||ORIGINS.CMF;
  return pickW(rng,list,ch=>eff(p,ch.stat));
}
/**
 * 起点に**対応する相手の選手**を選ぶ(→docs/07 §7.8)。
 * 座標が近いほど対応しやすく、遠いほど関与しない。
 *
 * 両チームは向かい合っているので、攻撃側の高さ h に対応する守備者は
 * **自軍フレームで 1-h の高さ**に立っている。左右は 100-x のミラー。
 *   DF起点(h≒0.2) ↔ 相手FW(h'≒0.8)   … FWのdefは低いのでほぼ止まらない
 *   MF起点(h≒0.5) ↔ 相手MF(h'≒0.5)   … ここからが本当の勝負
 *   FW起点(h≒0.85)↔ 相手DF(h'≒0.15)  … 最も止められやすい
 * GKは外す(GKの仕事はシュートを止めること)。
 */
function matchupDefender(rng,p,D){
  const F=TUNING.matchup;
  const th=1-heightOf(p), tx=100-p.x;
  const cand=D.players.filter(q=>q.role!=="GK");
  return pickW(rng,cand.length?cand:D.players,q=>{
    const dh=(heightOf(q)-th)/F.sigmaH;
    const dx=((q.x-tx)/100)/F.sigmaX;
    return Math.exp(-(dh*dh+dx*dx));
  });
}
/**
 * 起点が成立するか。**攻撃側スコア > 守備側スコア × 閾値**(→docs/07 §7.4)。
 *   攻撃側 … チャンネルの能力 × risk(選択の安全さ)
 *   守備側 … 対応する選手の def を主軸に、同じ能力を副次で足す。
 *            速さで抜けようとすれば速い守備者が追いつき、
 *            技術で運ぼうとすれば読める守備者が止める
 */
function resolveOrigin(rng,atk,df,ch){
  const M=TUNING.matchup;
  const aSc=(eff(atk,"atk")*M.atkW+eff(atk,ch.stat)*(1-M.atkW))
    *ch.risk*TUNING.atk.originK*rr(rng);
  const dSc=(eff(df,"def")*M.defW+eff(df,ch.stat)*(1-M.defW))*rr(rng);
  return aSc>dSc*TUNING.th.origin;
}

// ---------- 時計 ----------
/**
 * 90分 + アディショナルタイムを3分刻みで並べたティック表(→docs/07 §7.2)。
 * ATはハーフごとに付き、**キックオフの時点で確定する**
 * (後から伸ばすと、先に解いた結果と再生が食い違うため)。
 * 返り値: [{ min, half, at, atIx }] … min=表示する分 / half=1|2 / at=アディショナルタイムか
 */
function matchClock(rng){
  const M=TUNING.match, ticks=[];
  for(const half of [1,2]){
    const base=(half-1)*M.halfTicks*M.tickMin;
    for(let i=1;i<=M.halfTicks;i++)ticks.push({ min:base+i*M.tickMin, half, at:false });
    const n=Math.floor(rng()*(M.atMax[half-1]+1));           // 0〜atMax ティック
    for(let i=1;i<=n;i++)ticks.push({ min:base+M.halfTicks*M.tickMin, half, at:true, atIx:i });
  }
  return ticks;
}

// ---------- 進行 ----------
// **解く単位は「1ティック(3分)」**(→docs/07 §7.2)。試合まるごとではない。
// こうすると監督が**任意のタイミングで**手を打てる(D25):
//   ・描画は「解き終わったティック」しか触らない  → 見せかけは結果に触れない
//   ・監督の指示は M.orders に積まれ、**次のティックの入力**として効く
//   ・CPU同士の試合は指示が無いので finishMatch() で一気に解く(今までと同じ)
//
// ティックごとに独立したたねを使う(matchSeed ^ hash("t:"+i))。
// **途中で指示を出しても以降のティックの乱数列はずれない**ので、
// 「同じ試合・同じ流れで、采配だけが違いを生む」というA/Bが成立する。

/** 試合の状態を作る。ここではまだ1ティックも解かない。 */
function createMatch(home,away,seed){
  const s=seed>>>0;
  const H=buildTeam(home.cards,home.form,home.name,"H");
  const A=buildTeam(away.cards,away.form,away.name,"A");
  const M={
    seed:s, home:H, away:A, ix:0,
    clock:matchClock(mulberry32((s^hashStr("clock"))>>>0)),  // ATを含む全ティックは開始時に確定
    events:[], orders:{ H:[], A:[] }, subs:{ H:0, A:0 }, over:false,
    mom:kickoffMom(H,A),                                     // 勢い(-1..+1、+がホーム)
  };
  M.events.push({ min:0, half:1, at:false, side:null, type:"kickoff",
    home:H.name, away:A.name, ticks:M.clock.length, mom:Math.round(M.mom*100)/100 });
  return M;
}
const matchOver=M=>M.ix>=M.clock.length;
/** いま何分か(表示用)。まだ始まっていなければ0分。 */
const matchMin=M=>M.ix?M.clock[M.ix-1].min:0;

/**
 * 監督の指示を積む。**次のティックの頭で反映される**(→docs/07 §7.6)。
 * 試合中いつ呼んでもよく、積んだ時点では何も起きない=描画から独立している。
 *   { type:"sub", out:<出す選手の枠index>, in:<入れる控えのindex> }
 */
function orderMatch(M,side,order){
  if(M.over||!order)return false;
  if(order.type==="sub"){
    // **積んだ分も数える**。適用は次のティックなので、済んだ数だけ見ると枠を超えて積めてしまう。
    const pending=M.orders[side].filter(o=>o.type==="sub").length;
    if(M.subs[side]+pending>=TUNING.squad.subMax)return false;
  }
  M.orders[side].push(order);
  return true;
}
/** 積まれた指示をティックの頭で適用する。適用できたものだけ events に残す。 */
function applyOrders(M,t){
  for(const side of ["H","A"]){
    const T=side==="H"?M.home:M.away;
    const q=M.orders[side]; M.orders[side]=[];
    for(const o of q){
      if(o.type!=="sub")continue;
      const out=T.players[o.out], inc=T.bench[o.in];
      if(!out||!inc||inc.used||M.subs[side]>=TUNING.squad.subMax)continue;
      // 交代: 出る選手の**枠をそのまま引き継ぐ**(位置と適性は枠側の属性なので付け替える)
      const nw={ c:inc.c, sub:out.sub, role:out.role, fit:slotFit(inc.c,out.sub),
        x:out.x, y:out.y, ix:out.ix, side, enter:t.min,
        stat:{ shots:0, goals:0, inv:0 } };
      T.players[o.out]=nw; inc.used=true; M.subs[side]++;
      M.events.push({ min:t.min, half:t.half, at:!!t.at, side, type:"sub",
        out:out.c.id, in:inc.c.id, pos:[out.x,out.y] });
    }
  }
}

/**
 * 1ティック(3分)だけ解いて、そのティックで起きた events を返す。
 * 描画はこの返り値を再生する。**返る前に解き終わっている**ので、
 * 描画がどう動いても結果は変わらない。
 */
function stepMatch(M){
  if(matchOver(M))return finishTick(M);
  const t=M.clock[M.ix++];
  const rng=mulberry32((M.seed^hashStr("t:"+M.ix))>>>0);    // ティックごとに独立したたね
  const from=M.events.length;
  const H=M.home, A=M.away;

  if(t.half===2&&!M._ht){                                   // ハーフの切れ目
    M._ht=true;
    M.events.push({ min:45, half:1, at:false, side:null, type:"halftime",
      hg:H.score, ag:A.score });
  }
  applyOrders(M,t);                                         // 監督の指示は**ここで**効く

  const push=e=>M.events.push(Object.assign({ min:t.min, half:t.half, at:!!t.at },e));

  M.mom*=TUNING.mom.decay;                                  // 勢いは毎ティック中立へ戻る

  // ① 支配率 → ② 攻撃権の抽選
  const mh=midPower(H)*TUNING.atk.homeAdv, ma=midPower(A);
  const share=mh/(mh+ma);
  const T=rng()<share?H:A, D=T===H?A:H;
  const mom=momOf(M,T);
  push({ side:T.side, type:"possession", share:Math.round(share*100)/100,
    mom:Math.round(M.mom*100)/100 });

  // ③ 起点 — **モメンタムが高さを決め、高さが選手を決め、サブポジがチャンネルを決める**
  const origin=pickOrigin(rng,T,mom)||pickAttacker(rng,T);
  const ch=pickOriginCh(rng,origin);
  const marker=matchupDefender(rng,origin,D);                // 対応する相手(座標が近いほど)
  origin.stat.inv++; if(marker)marker.stat.inv++;
  const ok=marker?resolveOrigin(rng,origin,marker,ch):true;
  push({ side:T.side, type:"origin", by:origin.c.id, sub:origin.sub,
    ch:ch.id, label:ch.label, ok, vs:marker?marker.c.id:null,
    h:Math.round(heightOf(origin)*100)/100, pos:[origin.x,origin.y] });
  if(!ok){
    addMom(M,D.side,TUNING.mom.originNg);                   // 起点で失う = 相手に流れ
    return M.events.slice(from);
  }
  addMom(M,T.side,TUNING.mom.originOk);

  // ④ シュートまで届くか(連鎖はこれから。起点で稼いだ前進が高いほど届く)
  const A_=TUNING.atk;
  const prog=clamp(heightOf(origin)+ch.gain,0,1);
  if(rng()>=A_.toShot*(A_.progLo+prog*A_.progK)){
    push({ side:T.side, type:"build", by:origin.c.id, pos:[origin.x,origin.y] });
    return M.events.slice(from);
  }
  // ⑤ シュート
  const shooter=pickShooter(rng,T)||origin;
  const gk=pickGK(D);
  shooter.stat.inv++; shooter.stat.shots++;
  if(resolveShot(rng,shooter,gk)){
    T.score++; shooter.stat.goals++;
    addMom(M,T.side,TUNING.mom.goal);
    push({ side:T.side, type:"goal", by:shooter.c.id, gk:gk.c.id, assist:origin.c.id,
      hg:H.score, ag:A.score, pos:[shooter.x,shooter.y] });
  }else{
    addMom(M,T.side,TUNING.mom.shot);
    addMom(M,D.side,TUNING.mom.save);                       // 止めた側にも流れが来る
    push({ side:T.side, type:"save", by:shooter.c.id, gk:gk.c.id,
      pos:[shooter.x,shooter.y] });
  }
  return M.events.slice(from);
}
/** 試合終了イベント(1回だけ積む)。 */
function finishTick(M){
  if(M.over)return [];
  M.over=true;
  const e={ min:90, half:2, at:false, side:null, type:"fulltime",
    hg:M.home.score, ag:M.away.score };
  M.events.push(e);
  return [e];
}
/** 残りのティックを一気に解く。スキップ / 自動消化 / CPU同士の試合はこれ。 */
function finishMatch(M){
  while(!matchOver(M))stepMatch(M);
  finishTick(M);
  return M;
}

/**
 * 監督の指示が無い試合を最後まで解く(→docs/07 §7.1)。
 *   home/away : { cards:[16], form, name }
 *   seed      : 決定的乱数のたね。**同じ seed なら必ず同じ試合**になる
 * 返り値: { hg, ag, events, home, away }
 */
function simulateMatch(home,away,seed){
  const M=finishMatch(createMatch(home,away,seed));
  return { hg:M.home.score, ag:M.away.score, events:M.events, home:M.home, away:M.away };
}

// ---------- 呼び出し口 ----------
/** チーム1つ分の「試合に効く強さ」。編成のOVRと枠適性から出す。期待順位の算出に使う。 */
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

/**
 * スコアだけ欲しいときの入口。中身は simulateMatch と**同じエンジン**なので、
 * 描画してもしなくても結果は変わらない(→docs/07 §7.1)。
 */
function resolveMatch(home,away,seed){
  const r=simulateMatch(home,away,seed);
  return { hg:r.hg, ag:r.ag };
}
