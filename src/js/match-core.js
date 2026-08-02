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
  xi.forEach(p=>{ p.side=side; p.stat={ shots:0, sog:0, goals:0, assists:0, blocks:0, saves:0, inv:0 }; });
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
/** シュート位置の近さ(0..1)。h=1 がゴール前。遠いほどすべてが難しくなる。 */
function nearOf(h){
  const S=TUNING.shot;
  return clamp((h-S.deadZone)/(1-S.deadZone),S.minRange,1);
}
/**
 * ブロック — **GKの前に守備者が身体を入れる**。シュートの最初の関門。
 * 撃ち抜く側は tec(コースを作る)と atk、止める側は def と pow。
 */
function resolveBlock(rng,atk,df){
  const aSc=(eff(atk,"tec")*0.5+eff(atk,"atk")*0.5)*rr(rng);
  const dSc=(eff(df,"def")*0.6+eff(df,"pow")*0.4)*rr(rng);
  return dSc>aSc*TUNING.th.block;                          // 守備側が勝てばブロック
}
/** 枠に飛ぶか。**技術と距離**で決まる。GKは関与しない。 */
function onTarget(rng,atk,h){
  const S=TUNING.shot;
  return rng()<(S.accBase+eff(atk,"tec")/STAT_MAX*S.accTec)*Math.pow(nearOf(h),S.accRange);
}
/**
 * 枠内のシュート vs GK。
 * **GKは def だけで守らない**。def は上限20に張り付きやすく(96人中52人)、
 * それだけだと守備側がほぼ定数になってGKの質が結果に出ない(→docs/07 §7.10)。
 * 反応(pow)とポジショニング(tec)を混ぜて、GKごとの差を出す。
 */
function resolveShot(rng,atk,gk,h){
  const S=TUNING.shot;
  const sSc=(eff(atk,"atk")*0.7+eff(atk,"pow")*0.3)*Math.pow(nearOf(h),S.rangePow)*rr(rng);
  const gSc=(eff(gk,"def")*S.gkDef+eff(gk,"pow")*S.gkPow+eff(gk,"tec")*S.gkTec)*rr(rng);
  return sSc>gSc*TUNING.th.shot;
}
/** こぼれ球を拾えるか。詰める側は spd と atk、防ぐ側は def と spd。 */
function resolveRebound(rng,atk,df){
  const aSc=(eff(atk,"spd")*0.5+eff(atk,"atk")*0.5)*rr(rng);
  const dSc=(eff(df,"def")*0.5+eff(df,"spd")*0.5)*rr(rng);
  return aSc>dSc*TUNING.th.rebound;
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
function matchupDefender(rng,h,x,D){
  const F=TUNING.matchup;
  const th=1-h, tx=100-x;
  const cand=D.players.filter(q=>q.role!=="GK");
  return pickW(rng,cand.length?cand:D.players,q=>{
    const dh=(heightOf(q)-th)/F.sigmaH;
    const dx=((q.x-tx)/100)/F.sigmaX;
    return Math.exp(-(dh*dh+dx*dx));
  });
}
/**
 * チャンネルが成立するか。**攻撃側スコア > 守備側スコア × 閾値**(→docs/07 §7.4)。
 * 起点でも連鎖の各ステップでも同じ式を使う。
 *   攻撃側 … チャンネルの能力 × risk(選択の安全さ)
 *   守備側 … 対応する選手の def を主軸に、同じ能力を副次で足す。
 *            速さで抜けようとすれば速い守備者が追いつき、
 *            技術で運ぼうとすれば読める守備者が止める
 */
function resolveChannel(rng,atk,df,ch){
  const M=TUNING.matchup;
  const aSc=(eff(atk,"atk")*M.atkW+eff(atk,ch.stat)*(1-M.atkW))
    *ch.risk*TUNING.atk.originK*rr(rng);
  const dSc=(eff(df,"def")*M.defW+eff(df,ch.stat)*(1-M.defW))*rr(rng);
  return aSc>dSc*TUNING.th.origin;
}

// ---------- 連鎖 ----------
// 起点が成立したら、そこからボールが繋がっていく(→docs/07 §7.9)。
// **各ステップは起点とまったく同じ仕組み**: ボールを持った選手がサブポジの3枚から
// チャンネルを選び、座標の近い相手と競る。勝てば次へ、負ければそこで失う。
//   kind:"carry" … 自分がそのまま持ち上がる(自分が次の起点)
//   kind:"pass"  … 行き先(高さ×レーン)を抽選し、そこに近い**味方**へ渡る
//   kind:"shot"  … その場で撃つ(連鎖はここで終わる)

/** ボールの位置(高さ0..1)を、ピッチのy座標に戻す(イベントに載せる用)。 */
const yOfH=h=>Math.round(87-h*74);

/** チャンネルの lane 規則から、ボールが向かう左右(0..100)を出す。 */
function laneTarget(ch,x){
  switch(ch.lane){
    case "in":     return 50+(x-50)*0.25;         // 中央へ寄る
    case "out":    return x<50?14:86;             // 近い方のタッチライン際へ
    case "switch": return 100-x;                  // 逆サイドへ
    case "box":    return 50;                     // ペナルティエリア中央
    case "any":    return 50;                     // 散らす(ばらつきで表現)
    default:       return x;                      // same
  }
}
/** lane 規則ごとの左右のばらつき。any は大きく、box は小さい。 */
function laneSpread(ch){
  const C=TUNING.chain;
  return ch.lane==="any"?C.laneWide:ch.lane==="box"?C.laneTight:C.laneNormal;
}
/**
 * 次にボールが収まる位置を抽選する。高さは gain ぶん前へ、左右は lane 規則へ。
 * 返り値: { h, x }(h=高さ0..1 / x=左右0..100)
 */
function ballTarget(rng,h0,x0,ch){
  const C=TUNING.chain;
  // 前進は**残りの距離に対する割合**。自陣では大きく進み、敵陣深くでは進みにくい。
  // 足し算にすると2手でゴール前に着いてしまい、連鎖が成立しない(実際にそうなった)。
  const g=ch.gain*(1-h0)*C.gainK*(1+(rng()-0.5)*C.gainJitter);
  let h=clamp(h0+g,0,1);
  // **to を持つチャンネルは「最低ここまで届く」**(ロングフィード/クロス)。
  // 一発で前線へ送る手が、自陣から出しても割合計算で頭打ちになるのを防ぐ。
  if(ch.to!=null)h=Math.max(h,clamp(ch.to*(1+(rng()-0.5)*C.toJitter),h0,1));
  const lx=laneTarget(ch,x0);
  const x=clamp(lx+(rng()-0.5)*2*laneSpread(ch),2,98);
  return { h, x };
}
/** 抽選した位置に**近い味方**を選ぶ。自分は外す(パス系なので必ず他の選手へ渡る)。 */
function receiverAt(rng,T,tg,self){
  const C=TUNING.chain;
  const cand=T.players.filter(q=>q!==self&&q.role!=="GK");
  if(!cand.length)return null;
  return pickW(rng,cand,q=>{
    const dh=(heightOf(q)-tg.h)/C.sigmaH;
    const dx=((q.x-tg.x)/100)/C.sigmaX;
    return Math.exp(-(dh*dh+dx*dx));
  });
}
/**
 * 連鎖の途中でシュートに移行するか。
 * **深く入るほど**(高さの累乗)・**繋ぐほど**・**撃てる選手ほど**撃ちに行く。
 * 高さを線形にすると自陣寄りからの苦し紛れが半分を占め、
 * DFの30m弾ばかりになる(実際にそうなった → docs/07 §7.9)。
 */
function shotUrge(rng,h,step,p){
  const C=TUNING.chain;
  const want=C.shotBase+Math.pow(h,C.shotCurve)*C.shotDepth+step*C.shotStep;
  return rng()<want*(C.shotAtkLo+eff(p,"atk")/STAT_MAX*(1-C.shotAtkLo));
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
        stat:{ shots:0, sog:0, goals:0, assists:0, blocks:0, saves:0, inv:0 } };
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
  //    以降は連鎖。**各ステップは起点とまったく同じ仕組み**で回す(→docs/07 §7.9)。
  const C=TUNING.chain, F=TUNING.mom;
  let carrier=pickOrigin(rng,T,mom)||pickAttacker(rng,T);
  // **ボールの位置は選手の枠とは別に持つ**。持ち運びで動くのはボールであって、
  // 枠(FORMATIONS の座標)は動かない。マッチアップも受け手選びもこの位置で引く。
  let h=heightOf(carrier), x=carrier.x;
  let assist=null, step=0, lastCh=null;

  while(true){
    const ch=pickOriginCh(rng,carrier,lastCh);
    const marker=matchupDefender(rng,h,x,D);                // 対応する相手(位置が近いほど)
    carrier.stat.inv++; if(marker)marker.stat.inv++;
    const ok=marker?resolveChannel(rng,carrier,marker,ch):true;
    push({ side:T.side, type:step?"link":"origin", step,
      by:carrier.c.id, sub:carrier.sub, ch:ch.id, label:ch.label, kind:ch.kind,
      ok, vs:marker?marker.c.id:null,
      h:Math.round(h*100)/100, pos:[Math.round(x),yOfH(h)] });

    // **マッチアップの勝敗がそのまま勢いを動かす**(→docs/07 §7.7)
    if(!ok){ addMom(M,D.side,F.duelLost); return M.events.slice(from); }
    addMom(M,T.side,F.duelWon);

    const tg=ballTarget(rng,h,x,ch);
    // 撃つ: その場で撃つチャンネル / 深く入った / つなぎ上限
    if(ch.kind==="shot"||step>=C.maxLinks||shotUrge(rng,tg.h,step,carrier)){
      return shoot(M,rng,push,T,D,carrier,assist,tg,from);
    }
    if(ch.kind==="carry"){                                  // 自分が次の起点になる
      lastCh=ch.id;
    }else{                                                  // パス系 → 行き先に近い味方へ
      const recv=receiverAt(rng,T,tg,carrier);
      if(!recv)return shoot(M,rng,push,T,D,carrier,assist,tg,from);
      assist=carrier; carrier=recv; lastCh=null;
    }
    h=tg.h; x=tg.x; step++;
  }
}
/**
 * シュートまで行ったときの決着(→docs/07 §7.9)。連鎖のどこからでも呼べる。
 *
 *   ブロック → 枠外 → GK → こぼれ球 → 詰め
 *
 * **GKに全部が来るわけではない。** 守備者が身体を入れ、技術が足りなければ枠を外れ、
 * 止められてもこぼれれば詰められる。GK以外の守備も結果に効く。
 */
function shoot(M,rng,push,T,D,shooter,assist,tg,from,depth){
  const F=TUNING.mom, gk=pickGK(D);
  const pos=[Math.round(tg.x),yOfH(tg.h)];
  const d=depth||0;
  const base={ side:T.side, by:shooter.c.id, pos, h:Math.round(tg.h*100)/100, depth:d };
  shooter.stat.shots++;

  // ① ブロック — 打点に近い守備者が身体を入れる
  const blocker=matchupDefender(rng,tg.h,tg.x,D);
  if(blocker&&resolveBlock(rng,shooter,blocker)){
    blocker.stat.blocks=(blocker.stat.blocks||0)+1; blocker.stat.inv++;
    addMom(M,D.side,F.block);
    push(Object.assign({ type:"block", vs:blocker.c.id },base));
    return M.events.slice(from);
  }
  // ② 枠外 — 技術と距離。GKは関与しない
  if(!onTarget(rng,shooter,tg.h)){
    addMom(M,D.side,F.miss);
    push(Object.assign({ type:"miss" },base));
    return M.events.slice(from);
  }
  shooter.stat.sog=(shooter.stat.sog||0)+1;                // 枠内シュート
  gk.stat.inv++;

  // ③ GK
  if(resolveShot(rng,shooter,gk,tg.h)){
    T.score++; shooter.stat.goals++;
    if(assist)assist.stat.assists++;
    addMom(M,T.side,F.goal);
    push(Object.assign({ type:"goal", gk:gk.c.id, assist:assist?assist.c.id:null,
      hg:M.home.score, ag:M.away.score },base));
    return M.events.slice(from);
  }
  gk.stat.saves=(gk.stat.saves||0)+1;
  addMom(M,T.side,F.shot); addMom(M,D.side,F.save);         // 止めた側にも流れが来る
  push(Object.assign({ type:"save", gk:gk.c.id },base));

  // ④ こぼれ球 — **回数は決め打ちしない**。
  //    「こぼれる(30%) × 詰め合いに勝つ(約40%)」で1回あたり約12%なので、
  //    幾何級数的に収束する(期待値 +0.14本)。reboundMax は暴走を防ぐ安全網。
  if(d>=TUNING.shot.reboundMax||rng()>=TUNING.shot.rebound)return M.events.slice(from);
  const chaser=pickShooter(rng,T)||shooter;
  const guard=matchupDefender(rng,1,tg.x,D);
  chaser.stat.inv++; if(guard)guard.stat.inv++;
  const got=guard?resolveRebound(rng,chaser,guard):true;
  push({ side:T.side, type:"rebound", by:chaser.c.id,
    vs:guard?guard.c.id:null, ok:got, depth:d, pos });
  if(!got){ addMom(M,D.side,F.duelLost); return M.events.slice(from); }
  addMom(M,T.side,F.duelWon);
  return shoot(M,rng,push,T,D,chaser,null,{ h:TUNING.shot.reboundH, x:tg.x },from,d+1);
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
