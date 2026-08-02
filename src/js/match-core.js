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
/**
 * 1試合を最後まで解いて、起きたことを events[] に残す(→docs/07 §7.1)。
 *   home/away : { cards:[16], form, name }
 *   seed      : 決定的乱数のたね。**同じ seed なら必ず同じ試合**になる
 * 返り値: { hg, ag, events, home, away }
 *
 * events の各要素は必ず { min, half, at, side, type } を持つ。
 * 描画はこれを順に再生するだけでよく、**events に無いことは画面でも起きない**。
 */
function simulateMatch(home,away,seed){
  const rng=mulberry32(seed>>>0);
  const H=buildTeam(home.cards,home.form,home.name,"H");
  const A=buildTeam(away.cards,away.form,away.name,"A");
  const events=[];
  const push=(t,e)=>events.push(Object.assign({ min:t.min, half:t.half, at:!!t.at },e));

  push({ min:0, half:1 },{ side:null, type:"kickoff", home:H.name, away:A.name });

  const clock=matchClock(rng);
  let half=1;
  for(const t of clock){
    if(t.half!==half){
      push({ min:45, half:1 },{ side:null, type:"halftime", hg:H.score, ag:A.score });
      half=t.half;
    }
    // ① 支配率 → ② 攻撃権の抽選
    const mh=midPower(H)*TUNING.atk.homeAdv, ma=midPower(A);
    const share=mh/(mh+ma);
    const T=rng()<share?H:A, D=T===H?A:H;
    push(t,{ side:T.side, type:"possession", share:Math.round(share*100)/100 });

    // ③ 攻撃が形になるか(連鎖はこれから足す。いまは到達率で判定する)
    const origin=pickAttacker(rng,T);
    origin.stat.inv++;
    if(rng()>=TUNING.atk.toShot){
      push(t,{ side:T.side, type:"build", by:origin.c.id, pos:[origin.x,origin.y] });
      continue;
    }
    // ④ シュート
    const shooter=pickShooter(rng,T)||origin;
    const gk=pickGK(D);
    shooter.stat.inv++; shooter.stat.shots++;
    if(resolveShot(rng,shooter,gk)){
      T.score++; shooter.stat.goals++;
      push(t,{ side:T.side, type:"goal", by:shooter.c.id, gk:gk.c.id,
        hg:H.score, ag:A.score, pos:[shooter.x,shooter.y] });
    }else{
      push(t,{ side:T.side, type:"save", by:shooter.c.id, gk:gk.c.id,
        pos:[shooter.x,shooter.y] });
    }
  }
  push({ min:90, half:2 },{ side:null, type:"fulltime", hg:H.score, ag:A.score });
  return { hg:H.score, ag:A.score, events, home:H, away:A };
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
