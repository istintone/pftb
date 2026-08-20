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

// ---------- スキル(→docs/03 §3.21) ----------
// **1スキル = 1つの掛かり先**。選手ごとに1回だけ引き当てて畳んでおく
// (判定は1試合に数百回走るので、そのたびに名前を引くのは避ける)。
//   ch … 札に掛かるもの [{at,grp,w,s}]
//   k  … 札を持たない単独の掛かり先 {gk:1.1, stam:0.8, ...}
function skillsOf(card){
  const ch=[], k={};
  for(const name of card.skills||[]){
    const fx=SKILL_FX[name]; if(!fx)continue;
    // **固有スキルは1枚で複数の効果を持てる**(→docs/03 §3.41)。
    // 普通の札は fx.fx を持たないので、自分1つだけの配列として同じ道を通す
    for(const e of (fx.fx||[fx])){
      // **名前を残す**。畳んだ時点で捨てていたので、何が効いたのかを画面に出せなかった
      if(e.grp)ch.push({ name, at:e.at2||e.at, grp:e.grp, w:e.w||1, s:e.s||1,
        move:fx.move||null, when:e.when||null });
      if(e.k!=null)k[e.at]=(k[e.at]||1)*e.k;
    }
  }
  return { ch, k };
}
/**
 * その場面で**実際に発動した札の名前**(→docs/06 §6.26)。カットインに出す。
 * 倍率が1のものは数えない(持っているだけで効いていない札を光らせないため)。
 */
function skFired(p,at,ch,min){
  const f=p&&p.sk; if(!f||!ch)return null;
  let out=null;
  for(const x of f.ch){
    if(x.at!==at&&x.at!=="both")continue;
    if(x.w===1&&x.s===1)continue;
    if(!skOn(x,p,min))continue;                 // 条件が立っていない札は光らせない
    if(!SK_GRP[x.grp](ch))continue;
    if(!out)out=[];
    if(!out.includes(x.name))out.push(x.name);
  }
  return out;
}
/** 発動した固有スキルの**技名**。あればチャンネルの呼び名を差し替える(→§3.41)。 */
function skMove(p,at,ch,min){
  const f=p&&p.sk; if(!f||!ch)return null;
  for(const x of f.ch)
    if((x.at===at||x.at==="both")&&x.move&&skOn(x,p,min)&&SK_GRP[x.grp](ch))return x.move;
  return null;
}
/** 札を引く重みの倍率。at は "origin" / "counter" / "finish"。 */
/** 条件付きの成分が**いま立っているか**(→docs/03 §3.41)。条件が無ければ常に真。 */
/** その選手が「軸」か(→docs/03 §3.44)。 */
const isKp=p=>!!(p&&p.c&&p.c.kp);
/**
 * 軸の効き(→docs/03 §3.44)。**能力そのものに倍率を掛ける**。
 *
 * 「ボールが集まりやすい」を選ばれやすさの重みだけで作ったら、
 * **得失点差がまったく動かなかった**(実測 ±0.03)。関わる回数を増やしても、
 * 1回あたりのてこは変わらないため(→docs/03 §3.38 で分かっていたこと)。
 *
 * 能力に掛けると、**集まりやすさも強さも同時に、しかも本人の持ち味のまま**出る。
 *   ・atk が上がる → 受け手に選ばれやすくなる(recvAtk)し、決めきる力も上がる
 *   ・def/spd が上がる → 守備の1:1に呼ばれやすくなる(markDef/markSpd)し、止められる
 * 攻撃的なSBは前で、守備的なSBは後ろで効く。**配分を表で決めなくていい**。
 */
const kpK=p=>isKp(p)?TUNING.kp.power:1;
/** **軸は条件つきの札を条件なしで使える**(→docs/03 §3.44)。 */
const skOn=(x,p,min)=>!x.when||isKp(p)||(SK_WHEN[x.when]?SK_WHEN[x.when](p,min):false);
function skW(p,at,ch,min){
  const f=p.sk; if(!f||!ch)return 1;
  // **軸は札が出やすい**(→docs/03 §3.44)。確定はさせない、選ばれやすくなるだけ
  let m=isKp(p)?TUNING.kp.skill:1;
  for(const x of f.ch)
    if((x.at===at||x.at==="both")&&x.w!==1&&skOn(x,p,min)&&SK_GRP[x.grp](ch))m*=x.w;
  return m;
}
/** 判定スコアの倍率。 */
function skS(p,at,ch,min){
  const f=p.sk; if(!f||!ch)return 1;
  let m=1;
  for(const x of f.ch)
    if((x.at===at||x.at==="both")&&x.s!==1&&skOn(x,p,min)&&SK_GRP[x.grp](ch))m*=x.s;
  return m;
}
/** 札を持たない掛かり先(GK・空中戦・スタミナなど)。 */
const skK=(p,key)=>(p&&p.sk&&p.sk.k[key])||1;

/**
 * その日の出来(→docs/03 §3.32)。**鉄人は振れ幅そのものを圧縮する**(好調も不調も)。
 * 倍率を掛けるのではなく「1からの隔たり」を縮めるので、絶好調でも上振れしなくなる。
 */
const ironK=p=>1+(condMul(p.c.cond)-1)*skK(p,"iron");

// ---------- 有効値 ----------
/**
 * 有効値 — **すべての判定の単一集約点**(→docs/07 §7.3)。
 * 能力に掛かる修正は必ずここへ足す。そうすれば全判定に一様に効く。
 *   いま掛かるもの : 枠適性(→§3.14) / スタミナ(→§7.10) / 采配(→§3.28)
 *   これから足すもの: 状況(終盤・ビハインド) / 連携
 *
 * **覚醒の裏パラだけは素の能力に足す**(→docs/03 §3.30)。カードの表示は変えず、
 * 試合のときだけ効く。上限20を超えることがあるが、いまは許容している。
 * **コンディション**(→§3.32)は全能力に一様に掛かる(その日の出来なので偏らせない)。
 * **スタミナは能力ごとに効き方が違う**(→§3.65)。TUNING.wear の指数で、
 * 足(spd)と技(tec)から先に落ち、力(pow)は最後まで残る。
 */
function eff(p,k){
  const up=(p.c.up&&p.c.up[k])||0;
  const w=TUNING.wear[k];
  const st=p.stam>=1?1:w===1?p.stam:w?Math.pow(p.stam,w):1;
  return (p.c[k]+up)*p.fit*st*(p.condK||1)*((p.ordM&&p.ordM[k])||1)*kpK(p);
}

// ---------- スタミナ ----------
/**
 * スタミナ(1.0=万全 .. minStam)。**攻守どちらのスコアにも eff 経由で掛かる**(→docs/07 §7.10)。
 * GKも例外ではない。
 *
 *   消耗 = 出場時間 × perMin + 関与回数 × perAct
 * よく動いて活躍した選手ほど早く落ちる。sta が高いほど落ちが緩やか。
 * **これが交代の意味になる**: 終盤に消耗した選手を、万全の控えと入れ替える。
 */
/**
 * 相互カバー(→docs/03 §3.63)。**周りに味方が居るほど消耗が緩い**。
 *
 * 陣形の密度をそのまま消耗に効かせる。厚く構えた形は終盤に強くなり、
 * 前に人を割いた形は末脚が落ちる。**枠の位置は試合中変わらない**ので、
 * 組んだ時点で1度だけ数えればよい。
 *
 * 局所の被り(`coverOf`)では陣形の差が 4〜6% しか出ず、後ろに人を置いても
 * 失点が減らなかった(→docs/05 D)。密度をこちらで数えると 0.54〜0.74 と
 * **6倍以上の開き**になる。
 */
function supportOf(players,p){
  const F=TUNING.fatigue;
  let n=0;
  for(const q of players){
    if(q===p||q.role==="GK")continue;
    const dh=(heightOf(q)-heightOf(p))/F.supH, dx=((q.x-p.x)/100)/F.supX;
    n+=Math.exp(-(dh*dh+dx*dx));
  }
  return n;
}
function staminaOf(p,min){
  const F=TUNING.fatigue;
  const played=Math.max(0,min-(p.enter||0));
  const staMul=1-(p.c.sta-1)/(STAT_MAX-1)*F.staReduce;     // sta20 で最も緩やか
  // **キャプテンは消耗が緩い**(→docs/03 §3.20)。長くピッチに居られるので、
  // 誰に腕章を巻くかが交代計画そのものになる。
  const cap=p.captain?F.capMul:1;
  // **軸は消耗が早い**(→docs/03 §3.44)。軸を外しても、張っていた時間ぶんは残る
  // (掛け算にすると、外した瞬間に体力が戻ってしまう)
  const kp=(p.kpMin||0)*F.perMin*(TUNING.kp.stam-1);
  // **助け合っているぶんだけ軽い**(→§3.63)。支えの無い枠ほど削られる
  const sup=1-clamp((p.sup||0)*F.supK,0,F.supMax);
  const drain=((played*F.perMin*(p.off||1)+(p.stat.inv||0)*F.perAct)*staMul+kp)
    *cap*sup*skK(p,"stam");
  return clamp(1-drain,F.minStam,1);
}
/**
 * **守備ラインの綻び**(card-eleven から踏襲 → docs/07 §7.10)。
 * 個々のスタミナとは別に、**DFラインの平均消耗ぶんだけ守備スコアを薄く減じる**。
 *
 * これが無いと疲労は攻撃の精度(枠に飛ぶか)だけを一方的に下げ、
 * **得点が前半に偏る**(実測で前半61%対後半39%)。現実は逆で、
 * 終盤は疲れた守備が破綻して失点しやすくなる。
 * 不感帯(lineFree)を超えた消耗だけが響く。
 */
function lineMul(D){
  const F=TUNING.fatigue;
  const dl=D.players.filter(p=>p.role==="DF");
  if(!dl.length||!F.linePenalty)return 1;
  const avg=dl.reduce((s,p)=>s+p.stam,0)/dl.length;
  const over=Math.max(0,(1-avg)-F.lineFree);
  return 1-over*F.linePenalty;
}

/** ティックの頭で全選手のスタミナを確定する(そのティックの間は動かさない)。 */
function refreshStamina(M,min){
  for(const T of [M.home,M.away])
    for(const p of T.players){
      // **軸を張った時間を数える**。あとから外しても消えない(→staminaOf)
      if(isKp(p))p.kpMin=(p.kpMin||0)+TUNING.match.tickMin;
      p.stam=staminaOf(p,min);
      // **点差を選手に持たせる**(→docs/03 §3.50)。条件付きの采配(パーク・ザ・バス)が
      // 「いまリードしているか」を見る口。スキルの when は選手しか受け取らないので、
      // 盤面の状態はここで選手に降ろしておく
      p.lead=T.score-(T===M.home?M.away:M.home).score;
    }
}

/**
 * イベントに載った選手IDから選手を引く。**盤面から消えた選手も引ける**ように、
 * 出場中・控え・交代済み・退場済みを全部見る。過去のイベントを読み直すときに要る。
 */
function playerOf(M,side,id){
  const T=side==="H"?M.home:M.away; if(!T)return null;
  return T.players.find(p=>p.c.id===id)
    ||(T.bench||[]).find(p=>p.c.id===id)
    ||(T.subOut||[]).find(p=>p.c.id===id)
    ||(T.sentOff||[]).find(p=>p.c.id===id)||null;
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

/**
 * その枠の**オフザボールの走行量**(→docs/03 §3.65)。
 * 消耗が全員一律だと、90分ずっと往復するサイドハーフと、
 * 自陣の帯から出ない CB が同じだけ削れてしまい、sta を
 * 「誰をどこに置くか」で効かせられない。位置から素直に出す。
 * 采配で動かす前の y0 で測るので、指示では変わらない(指示消耗は別途却下済み)。
 */
function offBall(p){
  const F=TUNING.fatigue;
  const mid=clamp(1-Math.abs(p.y0-52)/35,0,1);   // 中盤の帯 = 往復が長い
  const wide=clamp(Math.abs(p.x-50)/40,0,1);     // 外 = 上下動が長い
  return F.offBase+F.offMid*mid+F.offWide*wide;
}

/** チームを組む。試合中に変わる値(得点・スタッツ)もここに持たせる。 */
/**
 * キャプテン(→docs/03 §3.20)。**指名があればそれを最優先**、無ければ
 * 総合力と経験(年齢)で自動選出する。抽選ではないので毎回同じ選手になる。
 */
function pickCaptain(xi,want){
  if(!xi.length)return null;
  if(want){ const p=xi.find(q=>q.c.id===want); if(p)return p; }
  const w=c=>c.ovr+(c.age-18)*1.5;
  return xi.reduce((b,p)=>w(p.c)>w(b.c)?p:b,xi[0]);
}
function buildTeam(cards,form,name,side,kickers,captain,order,med,tactic,coach){
  const { xi, bench }=lineup(cards,form);
  xi.forEach(p=>{ p.side=side; p.enter=0; p.stam=1; p.cards=0; p.sk=skillsOf(p.c);
    p.y0=p.y; p.ordM=null;                      // y0 = 采配で動かす前の縦位置
    p.off=offBall(p);                           // オフザボールの走行量(→docs/03 §3.65)
    p.condK=ironK(p);                           // その日の出来(→docs/03 §3.32)
    p.stat={ shots:0, sog:0, goals:0, assists:0, blocks:0, saves:0, inv:0,
      pass:0, passOk:0, duelW:0, duelL:0 }; });
  bench.forEach(p=>{ p.side=side; p.stam=1; p.sk=skillsOf(p.c); p.condK=ironK(p); });
  const cap=pickCaptain(xi,captain);
  if(cap)cap.captain=true;
  // kickers … {pk,fk,ck} のカードID。自クラブは編成で指名し、CPUは自動選出に任せる
  const T={ players:xi, bench, form, name, side, score:0,
    kickers:kickers||null, captain:cap, subOut:[], sentOff:[], order:null, lane:null,
    tactic:null,
    // 相手監督(→docs/03 §3.56)。**CPU側だけが持つ**。自分の側は UI が手を入れる
    coach:coach||null,
    med:med||1 };                                    // 医療施設のケガ倍率(→docs/03 §3.5)
  // **采配が先**(→docs/03 §3.50)。指示の上げ下げを合成するので、
  // setTeamOrder は T.tactic が決まったあとに呼ぶ
  setTeamTactic(T,tactic||null);
  setTeamOrder(T,order||null);
  return T;
}
/**
 * 采配を掛け直す(→docs/03 §3.28)。**1つだけ**が効く。
 * 陣形の上下は y0 から取り直すので、指示を変えても位置がずれ続けない。
 */
/**
 * 特別采配をチームに掛ける(→docs/03 §3.50)。
 *
 * **全員の札に混ぜる**。こうすると `skW`/`skS`/`skK` がそのまま効き、
 * **発動したときカットインのバッジに采配名が出る**(演出が自動で付いてくる)。
 * 新しい判定を1つも足さずに済むのが、この形にした理由。
 */
/** 采配の効きの倍率(→docs/03 §3.50)。1からの隔たりを伸ばす(0.94 → もっと下へ)。 */
const tacAmp=v=>v==null?v:1+(v-1)*TUNING.tactic.k;
function setTeamTactic(T,id){
  const t=id?tacticById(id):null;
  T.tactic=t?t.id:null;
  for(const p of T.players.concat(T.bench||[])){
    // **掛け直せるようにする**(→docs/03 §3.50)。札は積み、k は掛け算で混ぜるので、
    // 素の状態を控えずに2度呼ぶと**前の采配が乗ったまま重なる**。
    // 試合中に敷き替えるには、毎回ここまで戻してから掛け直す
    if(!p.sk)p.sk={ ch:[], k:{} };
    if(!p.sk0)p.sk0={ ch:p.sk.ch.slice(), k:Object.assign({},p.sk.k) };
    if(p.fit0==null)p.fit0=p.fit;
    p.sk={ ch:p.sk0.ch.slice(), k:Object.assign({},p.sk0.k) };
    p.fit=p.fit0;
    p.manMark=false; p.bondX=0; p.foulX=0;
    if(!t)continue;
    // **所属で絞る采配**(→docs/03 §3.55)。メモラビリアから持ち帰った手は、
    // その所属の選手にしか効かない(強い手を無条件に配らないための鍵)
    if(t.club&&(!p.c||p.c.club!==t.club))continue;
    if(t.role&&p.role!==t.role)continue;
    for(const e of (t.fx||[])){
      // **効果ごとに役割を絞れる**(→docs/03 §3.50)。フォルス9のように
      // 「前は下がり、2列目が出る」という采配は、1つの倍率では書けない
      if(e.role&&p.role!==e.role)continue;
      // **強さだけ倍率で持ち上げる**(→docs/03 §3.50)。w(札の選ばれやすさ)は
      // 采配の「性格」そのものなので触らない。ここを一括で動かせるようにしてあるのは、
      // シュート側の勾配(→docs/07 §7.22)を変えると采配の効きも一緒に潰れるため
      if(e.grp)p.sk.ch.push({ name:t.label, at:e.at2||e.at, grp:e.grp,
        w:e.w||1, s:tacAmp(e.s||1), move:null, when:e.when||null, tactic:true });
      if(e.k!=null)p.sk.k[e.at]=(p.sk.k[e.at]||1)*tacAmp(e.k);
    }
    // **枠適性のロスを埋める**(トータルフットボール)。1に近づける
    if(t.fitK&&p.fit!=null&&p.fit<1)
      p.fit=p.fit+(1-p.fit)*Math.min(0.95,t.fitK*TUNING.tactic.k);
    // **相手の軸に人を付ける**(マンマーク)。resolveChannel が見る
    if(t.manMark)p.manMark=true;
    // **連携の効きを増幅する**(オートマティズム)。bondK が見る
    if(t.bondX)p.bondX=tacAmp(t.bondX);
    // **止めるためなら反則も辞さない**(戦術的ファウル)。連鎖のファウル判定が見る
    if(t.foulX)p.foulX=tacAmp(t.foulX);
  }
  return T.tactic;
}
function setTeamOrder(T,id){
  const O=TUNING.order, o=id?orderById(id):null;
  T.order=o?o.id:null;
  T.lane=o&&o.lane!=null?o.lane:null;
  T.laneK=(o&&o.laneK)||1;
  // **采配は指示に足し算で乗る**(→docs/03 §3.50)。上げ下げも能力の倍率も合成する
  const tc=T.tactic?tacticById(T.tactic):null;
  const push=((o&&o.push)||0)+((tc&&tc.push)||0);
  // 攻撃重視は前に出るぶん ATK、守備重視は下がるぶん DEF が上がる。
  // **下がるだけでは損にしかならない**ので、必ず見返りを付ける
  const om=push>0?{ atk:O.buf }:push<0?{ def:O.buf }:null;
  const mm=(function(){
    if(!om&&!(tc&&tc.ordM))return null;
    const out={};
    for(const k of STAT_KEYS){
      // 采配ぶんだけ効きの倍率を掛ける(指示ぶんは素のまま →docs/03 §3.50)
      const a=(om&&om[k])||1, b=tacAmp((tc&&tc.ordM&&tc.ordM[k])||1);
      if(a*b!==1)out[k]=a*b;
    }
    return Object.keys(out).length?out:null;
  })();
  // 所属で絞る采配は、**指示ぶんだけ**を他所の選手に渡す
  const mmOrd=(function(){
    if(!om)return null;
    const out={};
    for(const k of STAT_KEYS)if(om[k]&&om[k]!==1)out[k]=om[k];
    return Object.keys(out).length?out:null;
  })();
  const club=tc&&tc.club||null;
  T.players.forEach(p=>{
    p.ordM=(club&&(!p.c||p.c.club!==club))?mmOrd:mm;
    if(p.role==="GK")return;                     // GKは前に出ない
    // 陣形の縦は 13〜87 なので、押し出しぶんの余白(±shiftY)まで許す。
    // 13 で切ると最前線だけ動かず、押し上げているのに絵が変わらない
    p.y=clamp((p.y0!=null?p.y0:p.y)-push*O.shiftY,13-O.shiftY,87+O.shiftY);
  });
  return T.order;
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
    // スキルの掛かり先(→docs/08 §8.2)。中盤の押し合いに関与する強さ
    s+=(eff(p,"tec")*M.tec+eff(p,"spd")*M.spd+eff(p,"sta")*M.sta)*w*skK(p,"mid");
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
function resolveBlock(rng,atk,df,D,fin,h,x){
  // ブロックを外すのも**その撃ち方の能力**。枠内率と同じ理由で tec 固定にしない
  const aSc=(eff(atk,(fin&&fin.stat)||"tec")*0.5+eff(atk,"atk")*0.5)*rr(rng);
  // 人数を割いていればコースも消える(→§7.14)
  const MU=TUNING.matchup;
  const dSc=(eff(df,"def")*MU.blkDef+eff(df,"pow")*MU.blkPow+eff(df,"spd")*MU.blkSpd)
    *lineMul(D)*coverOf(D,h,x)
    *skK(df,"block")*rr(rng);
  // blk が大きい手ほど当たらない(コースを狙う / GKと一対一 など)
  return dSc>aSc*TUNING.th.block*(fin&&fin.blk||1);
}
// ---------- 終点チャンネル(→docs/07 §7.13) ----------
// **どう撃つか**を1枚のチャンネルにまとめる。起点・守備とまったく同じ構造で、
// 選ばれた札が「威力・枠に飛ぶ率・ブロックのされにくさ」を全部決める。
// これが無かった頃はシュートが1種類しかなく、ヘディングもミドルも同じ計算だった。

/**
 * 終点チャンネルを選ぶ。**その選手が得意な手ほど選ばれやすい**。
 * minH を持つ手(ヘディング・流し込み)は、近くまで入っていないと選べない。
 */
function pickFinish(rng,p,h,min){
  const all=FINISHES[p.sub]||FINISHES[p.role==="GK"?"GK":"CMF"]||FINISHES.CMF;
  const list=all.filter(f=>f.minH==null||h>=f.minH);
  return pickW(rng,list.length?list:all,f=>eff(p,f.stat)*skW(p,"finish",f,min));
}
/**
 * 決定機の質(→docs/07 §7.21)。**シュートの成否を撃った本人だけで決めない**。
 *
 * ボールを渡した選手が、その渡し方(クロスならPOW、スルーパスならTEC)で
 * どれだけ良い形を作れたか。良い球なら決めやすく、雑な球なら決めにくい。
 * これが無いと、点は**撃った本人の能力だけ**で決まり、作った側の価値が乗らない
 * (→docs/03 §3.38 の枠ごとの偏り)。
 *
 * 基準(mid)で倍率1。**平均的なアシストなら何も起きない**ように置いてある。
 */
function chanceOf(assist,ach,shooter){
  const C=TUNING.chance;
  if(!assist||!ach)return 1;
  const q=clamp(1+(eff(assist,ach.stat)/STAT_MAX-C.mid)*C.k,C.lo,C.hi);
  // **渡した側と撃つ側の呼吸**(→docs/03 §3.60)。連携の3つ目の掛かり先。
  // 好機の質そのものを上げるので、**同じシュートでも入り方が変わる**
  return q*(1+(bondBuilt(assist,shooter)-1)*TUNING.bond.cqK);
}
/** 攻撃側のシュートスコア。**atk が幹、チャンネルの能力が枝**(起点と同じ形)。 */
function finishScore(atk,fin){
  const w=fin.w!=null?fin.w:TUNING.shot.finStat;
  return eff(atk,"atk")*(1-w)+eff(atk,fin.stat)*w;
}
/** 枠に飛ぶか。**技術と距離**で決まる。GKは角度を消すぶんだけ関与する。 */
function onTarget(rng,atk,gk,h,fin){
  const S=TUNING.shot;
  if(fin&&fin.fixAcc!=null)return rng()<fin.fixAcc;          // PK/ヘディングは位置が決まっている
  if(fin&&fin.tecAcc)                                        // 直接FKは距離より技術
    return rng()<S.fkAccBase*(0.6+eff(atk,"tec")/STAT_MAX*0.6);
  // **飛び出して角度を消す**(→docs/03 §3.62)。GKの死に能力に仕事を与える。
  // 二段に分ける — **間に合うか(spd)** と **詰め切れるか(atk)** は別の話で、
  // 掛け算1本にすると「速いだけのGK」と「立ちはだかるGK」が同じ絵になる。
  //   ① 出られたか … spd と距離で判定。**近いほど間に合う**
  //   ② 消せた角度 … atk。出られたときだけ効く
  // GKの atk / spd はどちらも枠の重みが軽い(→cards.js STAT_W)ので、
  // ここが無いと**使い道の無い能力**として2つ残ってしまう
  const q=k=>clamp(eff(gk,k)/S.rushRef,0,1);
  const out=rng()<S.rushRate*q("spd")*nearOf(h);
  const rush=out?1-S.rushK*q("atk"):1;
  const acc=(fin?fin.acc||1:1)*skK(atk,"onTarget")/skK(gk,"offTarget")*rush;
  // **枠に飛ぶかは「その撃ち方の能力」**(→docs/07 §7.13)。tec 固定にすると、
  // どの札を撃っても技術だけが効いてしまい、tec に尖った選手が無条件で有利になる
  const st=(fin&&fin.stat)||"tec";
  return rng()<acc*(S.accBase+eff(atk,st)/STAT_MAX*S.accTec)*Math.pow(nearOf(h),S.accRange);
}
/**
 * 枠内のシュート vs GK。
 * **GKは def だけで守らない**。def は上限20に張り付きやすく(96人中52人)、
 * それだけだと守備側がほぼ定数になってGKの質が結果に出ない(→docs/07 §7.10)。
 * 反応(pow)とポジショニング(tec)を混ぜて、GKごとの差を出す。
 */
function resolveShot(rng,atk,gk,h,fin,pso,min,cq){
  const S=TUNING.shot;
  const pk=fin.id==="pk";
  // cq = 決定機の質(→chanceOf)。**渡した側の仕事がここに乗る**
  const sSc=finishScore(atk,fin)*Math.pow(nearOf(h),S.rangePow)*(fin.k||1)
    *(cq||1)*skS(atk,"finish",fin,min)*(pk?skK(atk,"pkKick"):1);
  const gSc=(eff(gk,"def")*S.gkDef+eff(gk,"pow")*S.gkPow+eff(gk,"tec")*S.gkTec)
    *skK(gk,"gk")*skS(gk,"gkFin",fin)*(pk?skK(gk,"pkGk"):1)
    // **PK戦のときだけ**効く札(→docs/03 §3.41)。試合中のPKには掛からない
    *(pso?skK(gk,"psoGk"):1);
  // **能力差をそのまま決定率にしない**(→docs/07 §7.22)。
  // 撃つ側とGKの比を1に向けて圧縮してから、ぶれを掛けて競らせる。
  // 圧縮しないと、力の差がそのまま決定率の差になり、
  // 差が20を超えた対戦の**7割が4点差以上**という壊れ方をする。
  // ぶれ(rr)は圧縮の外に置く。中に入れると偶然まで潰れて、試合が作業になる。
  // **PKだけは圧縮しない**。流れの中のシュートは「チームが作った好機」なので
  // 力の差が二重に効くが、PKは蹴る人とGKだけの固定の一騎打ちで、
  // そこに同じ圧縮を掛けると決定率が 52% まで落ちて別の競技になる
  if(pk)return sSc*rr(rng)>gSc*TUNING.th.pk*rr(rng);
  const r=Math.pow(sSc/(gSc||1),S.gapPow);
  return r*rr(rng)>TUNING.th.shot*rr(rng);
}
// ---------- セットプレー(→docs/07 §7.11) ----------
// **ファウルは守備側が競り合いに勝った瞬間にしか起きない。** 独立した抽選にすると
// 「何も起きていないのにPK」が出てしまい、見せかけのロジックになる(→§7.1)。
//
//   連鎖のマッチアップで守備側が勝つ ─┬─ ファウル ─┬─ h≧boxH → PK
//                                     │            └─ それ以外 → FK
//   シュートをブロックした ───────────┴─ ファウル / コーナー
//   GKがセーブした ──────────────────── コーナー

/**
 * ファウルを引く。**位置の高さがそのまま重さを分ける**。
 *   pk   … エリア内
 *   fk   … 敵陣の蹴れる位置
 *   free … それ以外(自陣寄り)。攻撃が止まるだけで、蹴りはしない。
 *          ただし**カードは引く**ので、積み重なれば退場につながる。
 */
function rollFoul(rng,h,rate,allowPk){
  const SP=TUNING.sp;
  if(rng()>=rate*SP.foulK)return null;
  // **PKになるのはシュートを止めに行った反則だけ**(allowPk)。
  // 陣形の最前列は h≒1.0 に立つので、連鎖のファウルまでPKにすると
  // 「FW起点で潰された = 必ずPK」になってしまう。
  if(allowPk&&h>=SP.boxH)return "pk";
  return h>=SP.fkH?"fk":"free";
}
/**
 * キッカーを決める。**指名があればそれを最優先**(→docs/06 §6.15)。
 * 指名が居ない(未設定・交代済み・退場)なら能力で自動選出する。
 * 抽選ではないので、同じ場面なら必ず同じ選手が蹴る。
 */
function spKicker(T,kind){
  const out=T.players.filter(p=>p.role!=="GK");
  if(!out.length)return T.players[0];
  const want=T.kickers&&T.kickers[kind];
  if(want){ const p=out.find(q=>q.c.id===want); if(p)return p; }
  const w=kind==="pk"?(c=>c.atk*1.2+c.tec)
         :kind==="ck"?(c=>c.pow+c.atk*0.6)
                     :(c=>c.tec*1.2+c.atk*0.8);
  return out.reduce((b,p)=>w(p.c)>w(b.c)?p:b,out[0]);
}
/**
 * カードを抽選する。エリア内のファウルほど重い。
 * 2枚目の警告 or 一発レッドで**退場**し、そのまま人数が減ったまま試合が続く。
 */
function bookCard(M,rng,push,df,D,pk,min){
  const SP=TUNING.sp;
  const red=rng()<(pk?SP.pkRed:SP.red);
  const yellow=!red&&rng()<(pk?SP.pkYellow:SP.yellow);
  if(!red&&!yellow)return null;
  df.cards=(df.cards||0)+1;
  const off=red||df.cards>=2;
  push({ side:D.side, type:"card", by:df.c.id, card:red?"r":"y", off,
    pos:[Math.round(df.x),Math.round(df.y)] });
  // **GKは退場させない**(代役を立てる仕組みが無く、盤面が壊れる)。人数の下限も守る。
  if(off&&df.role!=="GK"&&D.players.length>SP.minPlayers){
    df.exit=min; df.sentOff=true;
    D.players=D.players.filter(p=>p!==df);
    (D.sentOff=D.sentOff||[]).push(df);
  }
  return red?"r":"y";
}
/**
 * 空中戦。クロス(CK / 深くないFK)がボックスに入ったときの競り合い。
 * **pow が主役**なので、足元の巧い選手ではなく高さのある選手が主役になる。
 */
function aerialDuel(rng,T,D,kickK){
  const SP=TUNING.sp;
  const pick=(list,k)=>pickW(rng,list,p=>eff(p,"pow")*0.7+eff(p,k)*0.3);
  const atk=pick(T.players.filter(p=>p.role!=="GK"),"atk");
  const df =pick(D.players.filter(p=>p.role!=="GK"),"def");
  if(!atk)return null;
  if(!df)return { atk, df:null, ok:true };
  const aSc=(eff(atk,"pow")*SP.aerialPow+eff(atk,"atk")*(1-SP.aerialPow))*SP.aerialK
    *skK(atk,"aerial")*(kickK||1)*rr(rng);
  const dSc=(eff(df,"pow")*SP.aerialPow+eff(df,"def")*(1-SP.aerialPow))*lineMul(D)
    *skK(df,"aerial")*rr(rng);
  return { atk, df, ok:aSc>dSc*TUNING.th.aerial };
}
/**
 * セットプレーを蹴る(→docs/07 §7.15)。**直接で終わる手と、繋いで続く手がある**。
 *
 *   PK          … 直接。壁もブロックも無い。キッカー vs GK
 *   FK(近い・直接) … 直接。壁がブロックに入る
 *   FK(近い・クロス) / CK … ボックスへ蹴る → 空中戦
 *                            ・競り勝って構えが良ければヘディングシュート
 *                            ・そうでなければ**そこから連鎖が続く**(セカンドボール)
 *   FK(遠い)    … そもそも蹴り込む位置ではない。**ただのリスタート**として繋ぎ、
 *                  そこから連鎖に戻る
 *
 * 直接シュートに合流する手は、通常のシュートとまったく同じ経路
 * (ブロック→枠外→GK→こぼれ球)を通るので、扱いが本編と食い違わない。
 */
function takeSet(M,rng,push,T,D,kind,x,from,att,min){
  const SP=TUNING.sp, F=TUNING.mom;
  att.sp++;
  if(kind==="pk"){
    const kicker=spKicker(T,"pk");
    push({ side:T.side, type:"setpiece", kind:"pk", mode:"direct",
      by:kicker.c.id, h:SP.pkH, pos:[50,yOfH(SP.pkH)] });
    return shoot(M,rng,push,T,D,kicker,null,{ h:SP.pkH, x:50 },from,0,att,"pk",min);
  }
  const kicker=spKicker(T,kind==="ck"?"ck":"fk");
  const h=kind==="ck"?SP.crossH:clamp(att.foulH||0.5,0,1);
  // 蹴り方は位置で決まる。直接狙える / ボックスへ入れる / まだ繋ぐだけ
  const direct=kind==="fk"&&h>=SP.fkDirectH&&rng()<SP.fkDirect;
  const intoBox=kind==="ck"||h>=SP.fkCrossH;
  const mode=direct?"direct":intoBox?"cross":"restart";
  push({ side:T.side, type:"setpiece", kind, mode,
    by:kicker.c.id, h:Math.round(h*100)/100,
    pos:kind==="ck"?[x<50?2:98,yOfH(0.99)]:[Math.round(x),yOfH(h)] });
  kicker.stat.pass++;
  if(direct)return shoot(M,rng,push,T,D,kicker,null,{ h, x },from,0,att,"fk",min);

  if(!intoBox){
    // **遠いFKは繋ぐだけ**。蹴った先で収めた選手から、ふつうの連鎖が始まる
    const tg={ h:clamp(h+SP.restartGain,0,1), x:clamp(x+(rng()-0.5)*30,2,98) };
    const recv=receiverAt(rng,T,tg,kicker,min)||kicker;
    kicker.stat.passOk++;
    return runChain(M,rng,push,T,D,recv,tg.h,tg.x,0,kicker,att,from,min);
  }

  // ボックスへ入れる → 空中戦
  const a=aerialDuel(rng,T,D,skK(kicker,"spDeliver"));
  if(!a)return M.events.slice(from);
  a.atk.stat.inv++; if(a.df)a.df.stat.inv++;
  push({ side:T.side, type:"aerial", by:a.atk.c.id, vs:a.df?a.df.c.id:null, ok:a.ok,
    h:SP.crossH, pos:[50,yOfH(SP.crossH)] });
  if(!a.ok){
    a.atk.stat.duelL++; if(a.df)a.df.stat.duelW++;
    addMom(M,D.side,F.duelLost); return M.events.slice(from);
  }
  a.atk.stat.duelW++; if(a.df)a.df.stat.duelL++; kicker.stat.passOk++;
  addMom(M,T.side,F.duelWon);
  // **競り勝ってもそのまま撃てるとは限らない**。触っただけならボールはこぼれ、
  // そこから連鎖が続く(セカンドボール)。撃てる選手ほど直接ヘディングへ行く。
  if(shotUrge(rng,SP.crossH,0,a.atk))
    return shoot(M,rng,push,T,D,a.atk,kicker,{ h:SP.crossH, x:50 },from,0,att,"hdr",min);
  return runChain(M,rng,push,T,D,a.atk,SP.crossH,50,1,kicker,att,from,min);
}
/** ファウルを積んで、カードを引いて、蹴る位置ならセットプレーへ渡す。 */
function giveFoul(M,rng,push,T,D,kind,df,victim,h,x,from,att,min){
  const F=TUNING.mom;
  push({ side:T.side, type:"foul", kind, by:df.c.id, on:victim?victim.c.id:null,
    h:Math.round(h*100)/100, pos:[Math.round(x),yOfH(h)] });
  bookCard(M,rng,push,df,D,kind==="pk",min);
  if(kind==="free"){                                        // 蹴らない位置。攻撃はここで終わる
    addMom(M,D.side,F.duelLost);
    return M.events.slice(from);
  }
  addMom(M,T.side,kind==="pk"?F.shot:F.duelWon);
  att.foulH=h;
  return takeSet(M,rng,push,T,D,kind,x,from,att,min);
}

/** こぼれ球を拾えるか。詰める側は spd と atk、防ぐ側は def と spd。 */
function resolveRebound(rng,atk,df){
  const aSc=(eff(atk,"spd")*0.5+eff(atk,"atk")*0.5)*skK(atk,"rebound")*rr(rng);
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
/**
 * 勢いの乗りやすさ(→docs/08 §8.4)。**上がるときだけ**掛かる。
 * キャプテンシーは**腕章を巻いているときだけ**効く(指名が効く数少ない場面)。
 */
function momGain(T){
  let m=1;
  for(const p of T.players)m*=skK(p,"mood");
  if(T.captain)m*=skK(T.captain,"captaincy");
  return m;
}
function addMom(M,side,v){
  const F=TUNING.mom;
  if(v>0){
    const T=side==="H"?M.home:M.away, D=side==="H"?M.away:M.home;
    v*=momGain(T);
    // **負けているときだけ**効く札(→docs/03 §3.41)。追いかける展開が作れる
    if(T.score<D.score)for(const p of T.players)v*=skK(p,"comeback");
  }
  M.mom=clamp(M.mom+(side==="H"?v:-v),-F.cap,F.cap);
}
/** キックオフ時のモメンタム。**強いチームが前から始められる**。 */
function kickoffMom(H,A){
  const F=TUNING.mom;
  // **★を含めて比べる**(→docs/03 §3.53)。素の ovr で比べると、
  // 段の域内に収めたぶんだけ相手を弱く見積もり、勢いの初期値がつかなくなる
  const ovr=T=>T.players.reduce((s,p)=>s+ovrOf(p.c),0)/(T.players.length||1);
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
 * 左右のレーンは**監督の采配**で寄せる(→docs/03 §3.28)。指示が無ければ効かない。
 */
function pickOrigin(rng,T,mom,min){
  const F=TUNING.mom;
  const target=clamp(0.5+mom*F.spread,0,1);
  return pickW(rng,T.players,p=>{
    const d=(heightOf(p)-target)/F.sigma;
    return Math.exp(-d*d)*skK(p,"start")*freshK(p,min)*laneW(T,p);
  });
}
/**
 * **交代で入った直後だけ**効く倍率(→docs/08 §8.4 スーパーサブ)。
 * 分が渡ってこない場面(セットプレーの起点など)では掛からない。
 */
function freshK(p,min){
  if(!p||!p.enter||min==null)return 1;
  return min-p.enter<=TUNING.squad.subWindow?skK(p,"joker"):1;
}
/** 采配で指したレーンの選手に乗る重み(→docs/03 §3.28)。指示が無ければ1。 */
function laneW(T,p){
  if(!T||T.lane==null)return 1;
  const O=TUNING.order, dx=(p.x-T.lane)/O.laneSigma;
  return 1+O.laneW*(T.laneK||1)*Math.exp(-dx*dx);
}
/**
 * 起点のチャンネルを選ぶ。**その選手のサブポジが持つ3種**から、
 * 得意な能力のものほど選ばれやすい(→docs/07 §7.7)。
 */
function pickOriginCh(rng,p,lastCh,stray,min){
  const C=TUNING.chain;
  const list=ORIGINS[p.sub]||ORIGINS.CMF;
  const away=stray||0;                                       // 自分の枠からの離れ具合(0..1)
  return pickW(rng,list,ch=>{
    let w=eff(p,ch.stat);
    // **持ち上がるほど手放したくなる**(→docs/07 §7.9)。
    // 枠から離れた選手が延々と運び続けると、陣形が崩れたまま独走する絵になる。
    // 離れるほど carry の重みを落とし、そのぶん pass に寄せる。
    if(ch.kind==="carry")w*=Math.max(C.strayFloor,1-away/C.strayFull);
    else if(ch.kind==="pass")w*=1+away*C.strayPass;
    if(lastCh&&ch.id===lastCh)w*=C.repeatW;                  // 同じ札の連発を避ける
    return w*skW(p,"origin",ch,min);
  });
}
/**
 * 連携がパスに掛ける倍率(→docs/03 §3.31)。**2人の合計**で段が上がる。
 * 連携の値はカードの写しに載せて渡す(エンジンはセーブを見ない)。
 */
/**
 * **積み上げた連携だけ**が見る倍率(→docs/03 §3.60)。黄金線の印は見ない。
 *
 * 黄金線は「印」なので、**強豪クラブには丸ごと無償で配られている**(→§3.53)。
 * 新しく増やした掛かり先(受け手の選び方・決定機の質)をそこにも効かせると、
 * 監督の打ち手ではなく**CPUの強豪だけが強くなり**、リーグの得点が膨らむ
 * (実測: 強豪同士の1試合が 4.05 → 5.07 点、格差戦の大差が 38.6% → 51.0%)。
 *
 * 積み上げは監督が交流を選んで積んだものなので、ここを見れば**打ち手だけに返る**。
 * 自分で黄金線まで育てた組は積み上げも t3 を越えているので、最上段がちゃんと乗る。
 */
function bondBuilt(a,b){
  if(!a||!b||!a.c.bond)return 1;
  const B=TUNING.bond, sum=(a.c.bond[b.c.id]||0)*2;
  return sum>B.t3?B.k3:sum>B.t2?B.k2:sum>B.t1?B.k1:1;
}
function bondK(a,b){
  if(!a||!b)return 1;
  const B=TUNING.bond;
  // **黄金線は値ではなく印**(→docs/03 §3.31)。覚醒した組は積み上げに関わらず最上段
  if(a.c.gold&&a.c.gold[b.c.id])return B.k4;
  if(!a.c.bond)return 1;
  const sum=(a.c.bond[b.c.id]||0)*2;
  const m=sum>B.t3?B.k3:sum>B.t2?B.k2:sum>B.t1?B.k1:1;
  // **積み上げの効きを増幅する采配**(オートマティズム →docs/03 §3.50)。
  // 1からの隔たりを伸ばすので、**組んだことのない11人には何も起きない**
  return a.bondX?1+(m-1)*a.bondX:m;
}
/** 選手の枠(元の立ち位置)から、いまボールがある場所までの離れ具合(0..1)。 */
function strayOf(p,h,x){
  const dh=Math.abs(h-heightOf(p)), dx=Math.abs(x-p.x)/100;
  return Math.sqrt(dh*dh+dx*dx);
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
function matchupDefender(rng,h,x,D,except){
  const F=TUNING.matchup;
  const th=1-h, tx=100-x;
  // except … その1人を外して選ぶ(カバーに入る2人目を引くときに使う)
  const cand=D.players.filter(q=>q.role!=="GK"&&q!==except);
  return pickW(rng,cand.length?cand:D.players,q=>{
    const dh=(heightOf(q)-th)/F.sigmaH;
    const dx=((q.x-tx)/100)/F.sigmaX;
    // **寄せるのは足の速い選手**(→docs/03 §3.37)。攻撃側で atk が「誰に渡すか」を
    // 決める(recvAtk)のと対になる守備側の幹。これが無いと spd は3枚に1枚の
    // チャンネルでしか出番が無く、守備の選手にとってほぼ死に能力になる
    // **守備も「質」で選ぶ**(→docs/03 §3.38)。攻撃側は recvAtk で良い受け手ほど
    // ボールが集まるのに、守備側は座標の近さだけで選ばれていた。
    // 守備の上手い選手ほど前に出て広く受け持つ = 関与そのものが増える(フォアチェック)
    const q2=1+eff(q,"spd")/STAT_MAX*F.markSpd+eff(q,"def")/STAT_MAX*F.markDef;
    return Math.exp(-(dh*dh+dx*dx))*q2;
  });
}
/**
 * **守備の厚み**(→docs/07 §7.14)。ボールの周りに守備側が何人いるかで守備が底上げされる。
 *
 * これが無いと「一番近い1人」しか守備に関与せず、**後ろに何人置いても失点が変わらない**。
 * 実測で 5-3-2 の失点(1.95)が 4-4-2(1.75)より多いという逆転まで起きていた。
 * マーカー本人ぶん(covBase)を引いた**支援の人数**だけが効く。
 */
function coverOf(D,h,x){
  const C=TUNING.matchup;
  const th=1-h, tx=100-x;
  let n=0;
  for(const q of D.players){
    if(q.role==="GK")continue;
    const dh=(heightOf(q)-th)/C.covH, dx=((q.x-tx)/100)/C.covX;
    // **人数だけでなく質も数える**(→docs/03 §3.38)。頭数だけだと、守備の選手は
    // 自分が当たった競り合いでしか効かず、**同じOVRでも FW の1/10 の価値**しか出なかった。
    // eff にはスタミナとコンディションが入っているので、ここで別に掛けない
    const qw=C.covQ0+eff(q,"def")/STAT_MAX*C.covQ;          // 並の守備者で約1.0
    n+=Math.exp(-(dh*dh+dx*dx))*qw*skK(q,"cover");
  }
  // **支援のぶんだけ**に掛ける。素の1に掛けると「誰も居なくても厚い」になってしまう
  return 1+Math.max(0,n-C.covBase)*C.covK*skK(pickGK(D),"marshal");
}
/**
 * 守備のチャンネルを選ぶ(→docs/07 §7.12)。攻撃側とまったく同じ形で、
 * **その選手が得意な手ほど選ばれやすい**。
 * これが無いと守備側は「相手が選んだ能力に付き合うだけの数字」になり、
 * 何をして止めたのかが残らない(実況にも采配にも使えない)。
 */
function pickCounterCh(rng,p,min){
  const list=COUNTERS[p.sub]||COUNTERS[p.role==="GK"?"GK":"CMF"]||COUNTERS.CMF;
  // **警告を受けた選手は慎重になる**。反則になりやすい手ほど選ばなくなるので、
  // 2枚目の退場が減り、そのぶん守備も緩む。カードが戦力に効く経路がここ。
  // 累乗にするのは、線形だと「少し避ける」程度にしかならないため。
  // 一度警告を受けた選手は、荒い手をはっきり選ばなくなる。
  const shy=p.cards?TUNING.sp.bookedShy:0;
  return pickW(rng,list,ch=>eff(p,ch.stat)*(shy?Math.pow(1-ch.foul,shy):1)*skW(p,"counter",ch,min));
}
/**
 * チャンネルが成立するか。**攻撃側スコア > 守備側スコア × 閾値**(→docs/07 §7.4)。
 * 起点でも連鎖の各ステップでも同じ式を使う。
 *   攻撃側 … チャンネルの能力 × risk(選択の安全さ)
 *   守備側 … def を主軸に、**自分が選んだ守備チャンネルの能力**を副次で足す。
 *            思い切った手ほど強い(k)が、そのぶん反則になりやすい(foul)。
 */
function resolveChannel(rng,atk,df,ch,dch,D,atkH,atkX,bk,min){
  const M=TUNING.matchup;
  // **連携はパス系にだけ効く**(→docs/03 §3.31)。渡す相手が決まっている手だから
  const aSc=(eff(atk,"atk")*M.atkW+eff(atk,ch.stat)*(1-M.atkW))
    *ch.risk*TUNING.atk.originK*skS(atk,"origin",ch,min)*(bk||1)*rr(rng);
  // **一発(long)はGKの飛び出しで摘まれる**。マーカーではなくGKが持つスキル
  const gkStop=ch.to!=null?skK(pickGK(D),"longStop"):1;
  // **軸には相手のマークが厳しい**(→docs/03 §3.44)。目立てば消される、の表現
  // **軸には相手のマークが厳しい**(→docs/03 §3.44)。目立てば消される、の表現。
  // マンマーク(→§3.50)を敷いていると、軸への当たりがさらに厳しくなる
  const km=isKp(atk)?TUNING.kp.mark*(df.manMark?TUNING.kp.manMark:1):1;
  const dSc=(eff(df,"def")*M.defW+eff(df,dch.stat)*(1-M.defW))
    *dch.k*lineMul(D)*coverOf(D,atkH,atkX)*skS(df,"counter",dch,min)
    *km/gkStop*rr(rng);
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
/**
 * 抽選した位置に**近い味方**を選ぶ。自分は外す(パス系なので必ず他の選手へ渡る)。
 *
 * **前へ行くほど「誰に預けるか」が効く**(→docs/07 §7.14)。近さだけで決めると、
 * 1トップの陣形ではボックス内で中盤の選手にボールが渡り、そのまま撃ってしまう。
 * 実測で枠内率が 33%→17%、決定率が 15%→2% まで落ちていた。
 * 深い位置ほど決定力の重みを乗せて、**点を取れる選手を探す**ようにする。
 */
function receiverAt(rng,T,tg,self,min){
  const C=TUNING.chain;
  const cand=T.players.filter(q=>q!==self&&q.role!=="GK");
  if(!cand.length)return null;
  return pickW(rng,cand,q=>{
    const dh=(heightOf(q)-tg.h)/C.sigmaH;
    const dx=((q.x-tg.x)/100)/C.sigmaX;
    const seek=1+eff(q,"atk")/STAT_MAX*C.recvAtk*skK(self,"vision")*clamp(tg.h,0,1);
    // **分かり合った相手を探しに行く**(→docs/03 §3.60)。
    // 競り合いの倍率だけだと頭打ちになるので、**そもそも誰に預けるか**にも効かせる。
    // ここは「行き先」ではなく「誰が受けるか」なので、位置の重みは崩れない
    const bw=1+(bondBuilt(self,q)-1)*TUNING.bond.seekK;
    return Math.exp(-(dh*dh+dx*dx))*seek*bw*skK(q,"recv")*freshK(q,min)*laneW(T,q);
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
function createMatch(home,away,seed,opts){
  const s=seed>>>0;
  const H=buildTeam(home.cards,home.form,home.name,"H",home.kickers,home.captain,home.order,home.med,home.tactic,home.coach);
  const A=buildTeam(away.cards,away.form,away.name,"A",away.kickers,away.captain,away.order,away.med,away.tactic,away.coach);
  const M={
    seed:s, home:H, away:A, ix:0,
    clock:matchClock(mulberry32((s^hashStr("clock"))>>>0)),  // ATを含む全ティックは開始時に確定
    events:[], orders:{ H:[], A:[] }, subs:{ H:0, A:0 }, over:false,
    mom:kickoffMom(H,A),                                     // 勢い(-1..+1、+がホーム)
    ko:!!(opts&&opts.ko),                                    // ノックアウト(→§3.33)
  };
  // **相互カバーは組んだ時点で1度だけ数える**(→§3.63)。枠は試合中動かない
  for(const T of [H,A])for(const p of T.players)p.sup=supportOf(T.players,p);
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
 *   { type:"sub",   out:<出す選手の枠index>, in:<入れる控えのindex> }
 *   { type:"order", id:<ORDERS の id / null で解除> }
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
/**
 * 相手監督(→docs/03 §3.56)。**できるのは指示と交代の2つだけ**。
 * 采配は動かさない(掛け直すと編成の意味が薄れるので、そこは監督の領分にしない)。
 *
 * **自分のチームには一切触らない**。`T.coach` を持っているのはCPU側だけで、
 * プレイヤーの側は UI からしか手が入らない。
 */
function coachTick(M,t,rng){
  for(const side of ["H","A"]){
    const T=side==="H"?M.home:M.away, D=side==="H"?M.away:M.home;
    if(!T.coach)continue;
    const c=coachById(T.coach);
    T._cx=T._cx||{ done:{}, subs:0, last:-99 };
    // --- 指示 ---
    // **節目を過ぎた最初のティックで1度だけ**考える(毎ティック迷わない)
    const due=(c.at||[]).find(mn=>t.min>=mn&&!T._cx.done[mn]);
    if(due!=null){
      T._cx.done[due]=1;
      const want=coachPick(c,T,D,rng);
      if(want!==T.order)orderMatch(M,side,{ type:"order", id:want });
    }
    // --- 交代 ---
    // 疲れた選手から替える。**枠の上限と、監督の性分の上限**の両方を見る
    if(c.subAt!=null&&t.min>=c.subAt&&t.min-T._cx.last>=c.subGap
       &&T._cx.subs<c.subMax&&M.subs[side]<TUNING.squad.subMax){
      const out=coachSubOut(T);
      const inn=coachSubIn(T,out);
      if(out>=0&&inn>=0){
        T._cx.last=t.min; T._cx.subs++;
        orderMatch(M,side,{ type:"sub", out, in:inn });
      }
    }
  }
}
/**
 * その監督が出したい指示。
 * **`cpuOrder` という名前は使えない** — world.js が順位の並べ替えで先に使っており、
 * 結合順(world → match-core)のせいで**あとから上書きしてしまう**。実際に踏んだ。
 */
function coachPick(c,T,D,rng){
  const lead=T.score-D.score;
  switch(c.order){
    case "fixed":  return T.order;                      // 変えない
    case "half":   return T.order==="attack"?"center":"attack";
    // 負けていれば前へ、勝っていれば後ろへ(ふつうの追い方)
    case "chase":  return lead<0?"attack":lead>0?"defend":"center";
    // **勝っていれば押し切り、負けていれば畳む**(→docs/03 §3.56)
    case "press":  return lead>0?"attack":lead<0?"defend":"center";
    case "keyman":{
      // 軸の居る側へ振る。軸が居なければ中央
      const kp=T.players.find(p=>p.c&&p.c.kp);
      if(!kp)return "center";
      return kp.x<40?"left":kp.x>60?"right":"center";
    }
    default:{                                            // whim
      const list=ORDERS.filter(o=>o.id!==T.order);
      return list[Math.floor(rng()*list.length)].id;
    }
  }
}
/** 替える枠。**GKは替えない**。いちばん疲れている選手から。 */
function coachSubOut(T){
  let ix=-1, worst=2;
  T.players.forEach((p,i)=>{
    if(p.role==="GK")return;
    const v=p.stam==null?1:p.stam;
    if(v<worst){ worst=v; ix=i; }
  });
  return worst<=TUNING.coach.tired?ix:-1;
}
/** 入れる控え。**同じ枠をこなせる中でいちばん強い人**。 */
function coachSubIn(T,outIx){
  const out=T.players[outIx]; if(!out)return -1;
  let ix=-1, best=-1;
  (T.bench||[]).forEach((b,i)=>{
    if(!b||b.used||b.role==="GK")return;
    const v=slotFit(b.c,out.sub)*ovrOf(b.c);
    if(v>best){ best=v; ix=i; }
  });
  return ix;
}
/** 積まれた指示をティックの頭で適用する。適用できたものだけ events に残す。 */
function applyOrders(M,t){
  for(const side of ["H","A"]){
    const T=side==="H"?M.home:M.away;
    const q=M.orders[side]; M.orders[side]=[];
    for(const o of q){
      if(o.type==="order"){
        // **指示はいつでも上書きできる**。1つだけが効く(→docs/03 §3.28)
        setTeamOrder(T,o.id||null);
        M.events.push({ min:t.min, half:t.half, at:t.at, side, type:"order",
          order:T.order, label:T.order?orderById(T.order).label:"指示なし" });
        continue;
      }
      if(o.type==="tactic"){
        // **特別采配も試合中に敷き替えられる**(→docs/03 §3.50)。
        // 掛け直しは素の状態まで戻してから乗せるので、重ならない。
        // **指示を掛け直すのを忘れない**。上げ下げと能力の倍率は采配と合成しているので、
        // 采配だけ差し替えると前の合成が残る
        setTeamTactic(T,o.id||null);
        setTeamOrder(T,T.order||null);
        M.events.push({ min:t.min, half:t.half, at:t.at, side, type:"tactic",
          tactic:T.tactic, label:T.tactic?tacticById(T.tactic).label:"采配なし" });
        continue;
      }
      if(o.type!=="sub")continue;
      const out=T.players[o.out], inc=T.bench[o.in];
      if(!out||!inc||inc.used||M.subs[side]>=TUNING.squad.subMax)continue;
      // 交代: 出る選手の**枠をそのまま引き継ぐ**(位置と適性は枠側の属性なので付け替える)
      // 入る選手は**万全**で入る(出場時間も関与回数も0から)。これが交代の価値。
      const nw={ c:inc.c, sub:out.sub, role:out.role, fit:slotFit(inc.c,out.sub),
        x:out.x, y:out.y, y0:out.y0, ordM:out.ordM,      // 采配は枠側の属性なので引き継ぐ
        condK:ironK({ c:inc.c, sk:inc.sk }),               // 出来は入る選手のもの
        ix:out.ix, side, enter:t.min, stam:1, sk:inc.sk,
        stat:{ shots:0, sog:0, goals:0, assists:0, blocks:0, saves:0, inv:0,
          pass:0, passOk:0, duelW:0, duelL:0 } };
      out.exit=t.min;                                      // 出場時間の算出に使う
      (T.subOut||(T.subOut=[])).push(out);                 // 採点に残す
      T.players[o.out]=nw; inc.used=true; M.subs[side]++;
      // **キャプテンが退いたら腕章を渡す**。誰も付けていない状態を作らない
      if(out.captain){
        out.captain=false;
        const next=pickCaptain(T.players,null);
        if(next){ next.captain=true; T.captain=next; }
      }
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
    M.restart=null;                                         // 後半はキックオフから(→§7.18)
    M.events.push({ min:45, half:1, at:false, side:null, type:"halftime",
      hg:H.score, ag:A.score });
  }
  coachTick(M,t,rng);                                        // 相手監督が手を打つ(→§3.56)
  applyOrders(M,t);                                         // 監督の指示は**ここで**効く
  refreshStamina(M,t.min);                                  // スタミナはティックの頭で確定する

  const push=e=>M.events.push(Object.assign({ min:t.min, half:t.half, at:!!t.at },e));

  M.mom*=TUNING.mom.decay;                                  // 勢いは毎ティック中立へ戻る

  // ① 支配率 → ② 攻撃権の抽選
  // **前のティックが枠外/セーブで終わっていれば、支配率は引かない**(→docs/07 §7.18)。
  // ゴールキックは相手ボールで再開するので、そこは抽選する場面ではない
  const mh=midPower(H)*TUNING.atk.homeAdv, ma=midPower(A);
  const share=mh/(mh+ma);
  const restart=M.restart; M.restart=null;
  const T=restart?(restart==="H"?H:A):(rng()<share?H:A), D=T===H?A:H;
  const mom=momOf(M,T);
  push({ side:T.side, type:"possession", share:Math.round(share*100)/100,
    mom:Math.round(M.mom*100)/100, ...(restart?{ restart:1 }:{}) });

  // ③ 起点 — **モメンタムが高さを決め、高さが選手を決め、サブポジがチャンネルを決める**
  //    以降は連鎖(→docs/07 §7.9)。ゴールキックのときだけ起点はGKで固定
  const origin=restart?pickGK(T):(pickOrigin(rng,T,mom,t.min)||pickAttacker(rng,T));
  // 1回の攻撃で持ち回す状態。セットプレーを重ねすぎないための回数もここに持つ。
  const att={ sp:0, foulH:0 };
  // **ボールの位置は選手の枠とは別に持つ**。持ち運びで動くのはボールであって、
  // 枠(FORMATIONS の座標)は動かない。マッチアップも受け手選びもこの位置で引く。
  return runChain(M,rng,push,T,D,origin,heightOf(origin),origin.x,0,null,att,from,t.min);
}

/**
 * 連鎖(→docs/07 §7.9)。**起点もセットプレーの後もここに入る**。
 * 各ステップは起点とまったく同じ仕組み: ボールを持った選手がサブポジの3枚から
 * チャンネルを選び、座標の近い相手と競る。勝てば次へ、負ければそこで失う。
 *
 * セットプレーから戻ってくる(→§7.15)ときは、蹴った先で収めた選手が carrier になる。
 */
function runChain(M,rng,push,T,D,carrier,h,x,step,assist,att,from,min){
  const C=TUNING.chain, F=TUNING.mom;
  let lastCh=null, carryRun=0;                              // 同じ選手が連続で運んだ回数
  let aCh=null;                                             // アシストを作ったチャンネル
  while(true){
    const stray=strayOf(carrier,h,x);
    const ch=pickOriginCh(rng,carrier,lastCh,stray,min);
    const marker=matchupDefender(rng,h,x,D);                // 対応する相手(位置が近いほど)
    // **守備側も自分の手を選ぶ**(→docs/07 §7.12)。選んだ手が強さと反則率の両方を決める
    const dch=marker?pickCounterCh(rng,marker,min):null;
    carrier.stat.inv++; if(marker)marker.stat.inv++;
    // **パスは渡す相手を先に決める**(→docs/03 §3.31)。誰に出すかが決まらないと
    // 連携が判定に乗らない。撃つかどうかの判断だけは、収めたあとに回す(→§7.9)
    const tg=ballTarget(rng,h,x,ch);
    const recv=ch.kind==="pass"?receiverAt(rng,T,tg,carrier,min):null;
    const ok=marker?resolveChannel(rng,carrier,marker,ch,dch,D,h,x,bondK(carrier,recv),min):true;
    carryRun=ch.kind==="carry"?carryRun+1:0;
    push({ side:T.side, type:step?"link":"origin", step,
      by:carrier.c.id, sub:carrier.sub, ch:ch.id, kind:ch.kind,
      // **技名があれば呼び名を差し替える**(→docs/03 §3.41)
      label:skMove(carrier,"origin",ch,min)||ch.label,
      sk:skFired(carrier,"origin",ch,min),
      dsk:marker?skFired(marker,"counter",dch,min):null,
      ok, vs:marker?marker.c.id:null, run:carryRun,
      dch:dch?dch.id:null, dlabel:dch?dch.label:null, dsub:marker?marker.sub:null,
      stray:Math.round(stray*100)/100,
      h:Math.round(h*100)/100, pos:[Math.round(x),yOfH(h)] });

    // **マッチアップの勝敗がそのまま勢いを動かす**(→docs/07 §7.7)
    if(ch.kind==="pass")carrier.stat.pass++;              // パスの試行(採点に使う)
    if(!ok){
      carrier.stat.duelL++; if(marker)marker.stat.duelW++;
      // **止めた瞬間だけがファウルの入口**(→docs/07 §7.11)。
      // **ケガはここで起きる**(→docs/03 §3.32)。マッチアップに負けた瞬間だけで、
      // 荒い手ほど確率が高い(守備チャンネルの反則率にそのまま比例させる)。
      // **綺麗に止める選手はファウルもケガも起こしにくい**(→docs/08 §8.6②)
      const clean=marker?skK(marker,"clean"):1;
      // **医療施設**(→docs/03 §3.5)は痛める側=競り負けた選手のチームに掛かる
      if(marker&&rng()<dch.foul*clean*skK(carrier,"tough")*(T.med||1)*TUNING.cond.hurtK)
        push({ side:T.side, type:"injury", by:carrier.c.id, vs:marker.c.id,
          dch:dch.id, dlabel:dch.label,
          h:Math.round(h*100)/100, pos:[Math.round(x),yOfH(h)] });
      // 反則率は**守備側が選んだ手**が持つ(削りにいけば高く、間合いを取れば低い)。
      // **止めるためなら反則も辞さない采配**(戦術的ファウル)はここだけを膨らませる。
      // ケガの側(上)には掛けない。狙って削るのではなく、掴んで止めているから
      const foul=marker?rollFoul(rng,h,dch.foul*clean*(marker.foulX||1)):null;
      if(foul)return giveFoul(M,rng,push,T,D,foul,marker,carrier,h,x,from,att,min);
      addMom(M,D.side,F.duelLost); return M.events.slice(from);
    }
    carrier.stat.duelW++; if(marker)marker.stat.duelL++;
    if(ch.kind==="pass")carrier.stat.passOk++;
    addMom(M,T.side,F.duelWon);

    if(ch.kind==="shot")return shoot(M,rng,push,T,D,carrier,assist,tg,from,0,att,null,min,aCh);

    // **ボールを収めたのは上で決めた受け手**。撃つかどうかの判断はこのあと。
    // 順番を逆にすると、スルーパスを出した本人がその球を自分で撃つことになる。
    let next=carrier, nextAssist=assist, nextLast=null, nextACh=aCh;
    if(ch.kind==="carry"){
      nextLast=ch.id;                                       // 自分が次の起点になる
    }else{                                                  // パス系 → 行き先に近い味方へ
      if(!recv)return shoot(M,rng,push,T,D,carrier,assist,tg,from,0,att,null,min,aCh);
      next=recv; nextAssist=carrier; nextACh=ch;            // **どう渡したか**も覚える
    }
    // 撃つ: 深く入った / つなぎ上限。判断するのは**ボールを収めた選手**
    if(step>=C.maxLinks||shotUrge(rng,tg.h,step,next))
      return shoot(M,rng,push,T,D,next,nextAssist,tg,from,0,att,null,min,nextACh);

    carrier=next; assist=nextAssist; lastCh=nextLast; aCh=nextACh;
    h=tg.h; x=tg.x; step++;
  }
}
/**
 * GKのフィード(→docs/07 §7.18)。**枠外(ゴールキック)とセーブ(キャッチ)のあと、
 * 次の攻撃が守っていた側のGKから始まる**ように予約するだけ。
 *
 * **その場で連鎖を回さない。** 回すと1ティックに攻撃が2回入り、
 * シュートも得点もそのぶん増える(実測 feed=1.0 で +44%)。
 * ゴールキックは「攻撃が1つ増える」ことではなく「次の攻撃を誰がどこから始めるか」。
 */
function gkFeed(M,rng,D,from){
  // **GKの能力は掛けない。** 掛けようとして測ったが、効かないと分かっている
  // (→docs/03 §3.61)。ゴールキックが起点になるのは1試合 33 回中 4.6 回で、
  // その中の数%を動かしても結果に出ない(札の効きで +0.003 = 誤差)
  if(rng()<TUNING.shot.feed)M.restart=D.side;
  return M.events.slice(from);
}

/**
 * 決定機阻止(→docs/07 §7.19)。**カバーの1人が身体を投げ出す**。
 *
 * ブロック(→resolveBlock)と違って**面(coverOf)を掛けない**。
 * 攻撃側はシュートという「1人で決める場面」を持っているのに、守備側は
 * どの判定にも面が掛かって4人で割られていた。ここだけは1対1で決める。
 *
 * 守り手は**マーカーではなくカバー**。撃ち手は直前のデュエルでマーカーを
 * 抜いているので、間に合うかどうかは後ろから寄せた選手の脚と守備で決まる。
 */
function resolveLastMan(rng,atk,df,fin){
  const L=TUNING.lastMan;
  const a=(eff(atk,"atk")*L.atkW+eff(atk,fin.stat)*(1-L.atkW))*(fin.k||1)*rr(rng);
  const d=(eff(df,"def")*L.defW+eff(df,"spd")*(1-L.defW))*rr(rng);
  return d>a*L.th;
}
/**
 * シュートまで行ったときの決着(→docs/07 §7.9)。連鎖のどこからでも呼べる。
 *
 *   ブロック → 枠外 → GK → こぼれ球 → 詰め
 *
 * **GKに全部が来るわけではない。** 守備者が身体を入れ、技術が足りなければ枠を外れ、
 * 止められてもこぼれれば詰められる。GK以外の守備も結果に効く。
 */
function shoot(M,rng,push,T,D,shooter,assist,tg,from,depth,att,sp,min,ach){
  const F=TUNING.mom, SP=TUNING.sp, gk=pickGK(D);
  const pos=[Math.round(tg.x),yOfH(tg.h)];
  const d=depth||0, A=att||{ sp:0 };
  // **どう撃つか**をここで1回だけ引く。以降の3段はすべてこの札を見る(→docs/07 §7.13)
  const fin=sp?SET_FINISH[sp]:pickFinish(rng,shooter,tg.h,min);
  const base={ side:T.side, by:shooter.c.id, pos, h:Math.round(tg.h*100)/100, depth:d,
    sp:sp||null, fin:fin.id,
    flabel:skMove(shooter,"finish",fin,min)||fin.label,
    sk:skFired(shooter,"finish",fin,min) };
  const more=A.sp<SP.maxSp;                                  // まだセットプレーを重ねてよいか

  // ⓪ 決定機阻止 — **カバーの1人が身体を投げ出す**(→docs/07 §7.19)。
  //    シュートの前なので、間に合えば**シュートにもならない**(本数にも数えない)
  const L=TUNING.lastMan;
  if(!fin.noBlk&&!sp&&tg.h>=L.h){
    const near=matchupDefender(rng,tg.h,tg.x,D);
    const last=matchupDefender(rng,tg.h,tg.x,D,near)||near;
    if(last&&resolveLastMan(rng,shooter,last,fin)){
      last.stat.clears=(last.stat.clears||0)+1; last.stat.inv++;
      addMom(M,D.side,F.block);
      push(Object.assign({ type:"clear", vs:last.c.id },base));
      return M.events.slice(from);
    }
  }
  shooter.stat.shots++;

  // ① ブロック — 打点に近い守備者が身体を入れる(PKは壁もブロックも無い)
  const blocker=fin.noBlk?null:matchupDefender(rng,tg.h,tg.x,D);
  if(blocker&&resolveBlock(rng,shooter,blocker,D,fin,tg.h,tg.x)){
    blocker.stat.blocks=(blocker.stat.blocks||0)+1; blocker.stat.inv++;
    addMom(M,D.side,F.block);
    push(Object.assign({ type:"block", vs:blocker.c.id },base));
    // 身体を投げ出した結果、ファウルにもコーナーにもなりうる
    if(more){
      const foul=rollFoul(rng,tg.h,SP.foulBlock,true);
      if(foul)return giveFoul(M,rng,push,T,D,foul,blocker,shooter,tg.h,tg.x,from,A,min);
      if(rng()<SP.ckOnBlock)return takeSet(M,rng,push,T,D,"ck",tg.x,from,A,min);
    }
    return M.events.slice(from);
  }
  // ② 枠外 — 技術と距離。GKは関与しない。セットプレーは種類ごとに精度が決まっている
  if(!onTarget(rng,shooter,gk,tg.h,fin)){
    addMom(M,D.side,F.miss);
    push(Object.assign({ type:"miss" },base));
    return gkFeed(M,rng,D,from);                            // ゴールキック(→§7.18)
  }
  shooter.stat.sog=(shooter.stat.sog||0)+1;                // 枠内シュート
  gk.stat.inv++;

  // ③ GK
  if(resolveShot(rng,shooter,gk,tg.h,fin,false,min,chanceOf(assist,ach,shooter))){
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
  if(more&&rng()<SP.ckOnSave)return takeSet(M,rng,push,T,D,"ck",tg.x,from,A,min);

  // ④ こぼれ球 — **回数は決め打ちしない**。
  //    「こぼれる(30%) × 詰め合いに勝つ(約40%)」で1回あたり約12%なので、
  //    幾何級数的に収束する(期待値 +0.14本)。reboundMax は暴走を防ぐ安全網。
  if(d>=TUNING.shot.reboundMax||rng()>=TUNING.shot.rebound*skK(gk,"noRebound"))
    return gkFeed(M,rng,D,from);                            // GKが収めた(→§7.18)
  const chaser=pickShooter(rng,T)||shooter;
  const guard=matchupDefender(rng,1,tg.x,D);
  chaser.stat.inv++; if(guard)guard.stat.inv++;
  const got=guard?resolveRebound(rng,chaser,guard):true;
  push({ side:T.side, type:"rebound", by:chaser.c.id,
    vs:guard?guard.c.id:null, ok:got, depth:d, pos });
  // 詰めに負けた = 守備側が拾った。GKが持っているとは限らないのでフィードは無し
  if(!got){ addMom(M,D.side,F.duelLost); return M.events.slice(from); }
  addMom(M,T.side,F.duelWon);
  return shoot(M,rng,push,T,D,chaser,null,{ h:TUNING.shot.reboundH, x:tg.x },from,d+1,A,null,min);
}

/** 試合終了イベント(1回だけ積む)。 */
function finishTick(M){
  if(M.over)return [];
  M.over=true;
  const e={ min:90, half:2, at:false, side:null, type:"fulltime",
    hg:M.home.score, ag:M.away.score };
  M.events.push(e);
  const out=[e];
  // **ノックアウトで並んだら、その場でPK戦**(→docs/03 §3.33)
  if(M.ko&&M.home.score===M.away.score)out.push(...shootout(M));
  return out;
}
/**
 * PK戦(→docs/03 §3.33)。**5本ずつ蹴って、決まらなければサドンデス**。
 * 決着が付いた時点で打ち切る(残りは蹴らない)ので、4-1 で5本目は無い。
 * 判定は試合中のPKと同じ(枠に飛ぶか → GKと勝負)。
 */
function shootout(M){
  const P=TUNING.pso, SP=TUNING.sp, fin=SET_FINISH.pk;
  const rng=mulberry32((M.seed^hashStr("pso"))>>>0);
  const order={ H:psoOrder(M.home), A:psoOrder(M.away) };
  const gk={ H:pickGK(M.home), A:pickGK(M.away) };
  const sc={ H:0, A:0 };
  const evs=[];
  const kick=(side,n)=>{
    const T=side==="H"?M.home:M.away, D=side==="H"?M.away:M.home;
    const list=order[side];
    const p=list[(n-1)%list.length];
    // resolveShot は**true が得点**(→shoot と同じ向き)。ここを反転させると
    // 「GKが止めたときだけ入る」になり、PK戦が 0-1 のような点になる
    const ok=onTarget(rng,p,gk[D.side],SP.pkH,fin)
      &&resolveShot(rng,p,gk[D.side],SP.pkH,fin,true);   // true = PK戦(→§3.41)
    if(ok)sc[side]++;
    const e={ min:90, half:2, at:false, side, type:"pso", n,
      by:p.c.id, gk:gk[D.side].c.id, ok, hg:sc.H, ag:sc.A };
    M.events.push(e); evs.push(e);
    return ok;
  };
  // **決着が付いたら打ち切る**。残り本数で逆転できないなら、そこで終わり
  // n本目を蹴り終えた時点で、残り本数を数えて逆転できるかを見る
  //   Hのn本目のあと … H は n本、A は n-1本 蹴っている
  //   Aのn本目のあと … どちらも n本
  const decided=(n,turn)=>{
    const leftH=Math.max(0,P.rounds-n);
    const leftA=Math.max(0,P.rounds-(turn==="H"?n-1:n));
    return sc.H>sc.A+leftA||sc.A>sc.H+leftH;
  };
  let done=false;
  for(let n=1;n<=P.rounds&&!done;n++){
    kick("H",n); if(decided(n,"H")){ done=true; break; }
    kick("A",n); if(decided(n,"A")){ done=true; break; }
  }
  // サドンデス: 1本ずつ蹴って、差がついた組で終わり
  for(let n=P.rounds+1;!done&&n<=P.suddenMax;n++){
    kick("H",n); kick("A",n);
    if(sc.H!==sc.A)done=true;
  }
  // 上限まで並んだまま(実測で1%未満)は、たねで決める。**必ず決着させる**
  const win=sc.H!==sc.A?(sc.H>sc.A?"H":"A"):(rng()<0.5?"H":"A");
  M.pso={ hg:sc.H, ag:sc.A, win, capped:sc.H===sc.A };
  const end={ min:90, half:2, at:false, side:null, type:"psoEnd",
    hg:sc.H, ag:sc.A, win:M.pso.win, capped:M.pso.capped };
  M.events.push(end); evs.push(end);
  return evs;
}
/** PK戦の蹴る順。**指名したPKキッカーが1番手**、あとは決定力と技術の順。 */
function psoOrder(T){
  const out=T.players.filter(p=>p.role!=="GK");
  const w=p=>p.c.atk*1.2+p.c.tec;
  const list=out.slice().sort((a,b)=>w(b)-w(a));
  const named=T.kickers&&T.kickers.pk;
  if(named){
    const i=list.findIndex(p=>p.c.id===named);
    if(i>0)list.unshift(list.splice(i,1)[0]);
  }
  return list.length?list:T.players;
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

// ---------- 試合後の集計(→docs/06 §6.20) ----------
// **勝敗には一切影響しない採点レイヤー**。関与度を主軸に、決定的な出来事で加減する。
// card-eleven の考え方を踏襲(→docs/07 §7.12)。

/** 出場時間(分)。交代で退いていればそこまで。 */
function minutesOf(p,full){
  return clamp((p.exit!=null?p.exit:full)-(p.enter||0),0,full);
}
/**
 * 選手の採点(3.0〜10.0)。
 *   ・関与回数(inv)を土台にして、出番の少ない選手が高くならないようにする
 *   ・ゴール/アシスト/デュエル/ブロック/セーブで加減する
 *   ・GKは関与が構造的に少ないので専用の尺度にする
 *   ・守備陣は無失点/失点のチーム文脈を反映する
 */
function matchRating(p,conceded){
  const s=p.stat||{};
  if(p.role==="GK"){
    let g=5.5+(s.saves||0)*0.35;
    g+=conceded===0?0.7:-Math.min(1.2,conceded*0.30);
    return clamp(Math.round(g*10)/10,3.0,10);
  }
  let r=4.0+2.05*Math.log10(1+(s.inv||0));
  r+=(s.goals||0)*0.9+(s.assists||0)*0.55
    +(s.duelW||0)*0.12-(s.duelL||0)*0.12
    +(s.blocks||0)*0.22+(s.clears||0)*0.30
    -((s.shots||0)-(s.goals||0))*0.06;
  // **守った仕事にも点を付ける**(→docs/03 §3.38)。関与の数と得点だけで見ると
  // 前線が構造的に1点高くなり、DFはどれだけ止めても上に行けない
  if(p.role==="DF"||p.sub==="DMF")r+=conceded===0?0.6:-Math.min(0.5,conceded*0.12);
  return clamp(Math.round(r*10)/10,3.0,10);
}
/** チーム単位の集計。イベントを数えるだけなので、描画してもしなくても同じ。 */
function matchStats(M){
  const z=()=>({ poss:0, shots:0, sog:0, goals:0, blocks:0, miss:0, pass:0, passOk:0 });
  const out={ H:z(), A:z() };
  for(const e of M.events){
    const t=out[e.side]; if(!t)continue;
    switch(e.type){
      case "possession": t.poss++; break;
      case "goal":  t.shots++; t.sog++; t.goals++; break;
      case "save":  t.shots++; t.sog++; break;
      case "miss":  t.shots++; t.miss++; break;
      case "block": t.shots++; out[e.side==="H"?"A":"H"].blocks++; break;
    }
  }
  for(const side of ["H","A"]){
    const T=side==="H"?M.home:M.away;
    // 交代で退いた選手のパスも足す(集計から消えると成功率が実態とずれる)
    for(const p of T.players.concat(T.subOut||[],T.sentOff||[])){
      out[side].pass+=p.stat.pass||0; out[side].passOk+=p.stat.passOk||0;
    }
  }
  const tp=out.H.poss+out.A.poss||1;
  out.H.possPct=Math.round(out.H.poss/tp*100);
  out.A.possPct=100-out.H.possPct;
  return out;
}
/**
 * 出場した全選手を採点つきで返す(交代で退いた選手も含む)。
 * 返り値は評価の高い順。MOM はこの先頭。
 */
function matchRatings(M,side){
  const T=side==="H"?M.home:M.away;
  const conceded=side==="H"?M.away.score:M.home.score;
  const full=TUNING.match.halfTicks*TUNING.match.tickMin*2;
  const seen=new Set(), out=[];
  const add=p=>{
    if(!p||seen.has(p.c.id))return;
    seen.add(p.c.id);
    out.push({ p, side, min:minutesOf(p,full), rating:matchRating(p,conceded) });
  };
  T.players.forEach(add);
  (T.sentOff||[]).forEach(add);                              // 退場した選手も採点に残す
  T.bench.forEach(p=>{ if(p.used)add(p); });              // 途中出場も
  T.subOut&&T.subOut.forEach(add);                        // 途中で退いた選手
  return out.sort((a,b)=>b.rating-a.rating);
}
/** MOM。両チームから最も評価の高い1人。 */
function manOfTheMatch(M){
  const all=matchRatings(M,"H").concat(matchRatings(M,"A"));
  return all.sort((a,b)=>b.rating-a.rating)[0]||null;
}

// ---------- 呼び出し口 ----------
/** チーム1つ分の「試合に効く強さ」。編成のOVRと枠適性から出す。期待順位の算出に使う。 */
function teamStrength(cards,form){
  const slots=FORMATIONS[form||DEFAULT_FORM];
  let total=0,n=0;
  cards.forEach((c,i)=>{
    if(!c)return;
    const sub=slots[i]?slots[i][0]:null;
    total+=ovrOf(c)*(sub?slotFit(c,sub):1);        // ★を含む(→docs/03 §3.53)
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
