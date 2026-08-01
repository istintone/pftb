// ================= 選手カード =================
// 選手は「プレイヤーの資産(コレクション)」と「クラブからの貸与」の2種類があるが、
// カードそのものの形は同じ。所有の区別は持ち主側(S.player.coll / S.club.loan)で表す。
// → docs/03-game-design.md §3.2.2(二層) / §3.4(D13 貸与)

// 名前の素材。国ごとに雰囲気を変えるため、姓のプールを国に紐づける。
const GIVEN=["A.","B.","C.","D.","E.","F.","G.","H.","J.","K.","L.","M.","N.","O.","P.","R.","S.","T.","V.","Y."];
// 1クラブ16人を同じ国から取るので、姓は各国20個以上ないと同姓が並んでしまう。
const FAMILY={
  nordia:["ハルヴォルセン","ベリストローム","リンドクヴィスト","バッカー","エリクソン","ソルベリ","ノルドヴァル","ハーゲン",
          "オルセン","ダールベリ","フォシュベリ","ニルソン","ヴィークランド","サンドバリ","ユーハンソン","レンベリ",
          "アスプルンド","ヘルガソン","ブロム","シェーグレン"],
  iberia:["シルヴェイラ","ドゥアルテ","コスタ","アルメイダ","ロブレド","ミランダ","ベルナル","キンタナ",
          "アギレラ","カルヴァーリョ","フェレイラ","エスコバル","バリオス","ソラーノ","メンドーサ","パチェコ",
          "ヴィエイラ","サンチェス","ナヴァロ","レイス"],
  estra: ["コワルスキ","リッチ","オセイ","ノヴァク","ヴァレンタ","マルティネク","ブラホ","シュミット",
          "ホルヴァート","ヴォイタ","ザヤツ","ペトロフ","ドヴォルザーク","クラウス","バルトシュ","マズル",
          "ヤンコフ","ステファノフ","ルカーチ","ネメシュ"],
  garia: ["ヴァントロワ","ヴァンドーレン","ルフェーヴル","モロー","デュラン","ボネ","ラミレス","カロン",
          "ドラクロワ","ベルナール","フォンテーヌ","ジラール","マルソー","ロシェ","テヴナン","ヴィアル",
          "オービュッソン","クレマン","ダルモン","ペリエ"],
};
const NATIONS=Object.keys(FAMILY);

// 6桁のカードID。生成元(クラブ/パック)に依らず一意になるよう uid を回す。
let uid=1;
function nextCardId(){ return uid++; }

// ポジション別の能力の重み。各行の合計は 6.0 にそろえてあるので、
// 「OVR を6等分したもの × 重み」で配ると合計が OVR に一致する。
// 順は STAT_KEYS(atk, def, pow, tec, spd, sta)。GKの def はセービングにあたる。
const STAT_W={
  GK:[0.45,1.75,1.05,1.15,0.75,0.85],
  DF:[0.70,1.55,1.20,0.85,0.85,0.85],
  MF:[0.95,0.95,0.85,1.35,0.95,0.95],
  FW:[1.55,0.55,1.15,1.05,1.25,0.45],
};

/**
 * 目標OVRを6能力へ配分する。各能力は 1..STAT_MAX(20)、合計はぴったり目標OVRになる。
 * 端数と上限クランプで合計がずれるため、最後に余りを配り直して必ず一致させる
 * (OVR = 6能力の合計、という定義を崩さないため)。
 */
function statsFor(rng,pos,ovr){
  const W=STAT_W[pos], per=ovr/STAT_KEYS.length;
  const v=W.map(w=>clamp(Math.round(per*w+rri(rng,-2,2)),1,STAT_MAX));
  let diff=ovr-sum(v);
  for(let guard=0;diff!==0&&guard<400;guard++){
    const i=Math.floor(rng()*v.length);
    if(diff>0&&v[i]<STAT_MAX){ v[i]++; diff--; }
    else if(diff<0&&v[i]>1){ v[i]--; diff++; }
  }
  const st={};
  STAT_KEYS.forEach((k,i)=>st[k]=v[i]);
  return st;
}

/** OVR は6能力の**合計**(最大120)。能力を触ったら必ずこれで揃える。 */
function calcOvr(pos,st){
  return sum(STAT_KEYS.map(k=>st[k]||0));
}

/**
 * サブポジションを決める。subs[0] がプライマリで、必ずメイン(大分類)の側から選ぶ。
 * 例外として隣接するサブ(FWのSTがOMFもこなす等)を1つ持つことがあるが、
 * プライマリはメイン側のままなので所属する大分類は揺らがない。
 */
function rollSubs(rng,pos,rarity){
  const own=SUBPOS[pos];
  const subs=[rpick(rng,own)];
  // 上位の段ほど「複数ポジションをこなす」ことが多い
  const i=RAR_KEYS.indexOf(rarity);
  const extra=i>=3?rri(rng,1,2):i===2?rri(rng,0,2):rri(rng,0,1);
  for(let i=0;i<extra;i++){
    const pool=(rng()<0.22&&NEIGHBOR_SUBS[pos].length)?NEIGHBOR_SUBS[pos]:own;
    const s=rpick(rng,pool);
    if(!subs.includes(s))subs.push(s);
  }
  return subs;
}

/**
 * レアリティを抽選する(重みは RARITY.w)。
 * 実在選手の段(WORLD CLASS / LEGENDS)は w=0 なので**ここからは出ない**。
 * 手で定義したデータを別経路で配る(→docs/03 §3.13)。
 */
function rollRarity(rng,minKey){
  const from=minKey?Math.max(0,RAR_DROPS.indexOf(minKey)):0;
  const pool=RAR_DROPS.slice(from);
  const total=sum(pool.map(k=>RARITY[k].w));
  let x=rng()*total;
  for(const k of pool){ x-=RARITY[k].w; if(x<=0)return k; }
  return pool[pool.length-1];
}

/**
 * カードを1枚作る。
 *   rng    決定的乱数(同じシードなら同じ選手が出る)
 *   pos    大分類ポジション
 *   opts   { rarity, club, nation, ovrBias }
 */
function makeCard(rng,pos,opts={}){
  const rarity=opts.rarity||rollRarity(rng);
  const [lo,hi]=RARITY[rarity].ovr;
  const ovr=clamp(rri(rng,lo,hi)+(opts.ovrBias||0),STAT_KEYS.length,OVR_MAX);
  // 自国籍が中心だが、3割ほどは外国籍にして顔ぶれに幅を出す
  const nation=(opts.nation&&rng()<0.7)?opts.nation:rpick(rng,NATIONS);
  const st=statsFor(rng,pos,ovr);
  const pool=SKILLS[pos];
  const n=RARITY[rarity].skills;
  const skills=[];
  while(skills.length<n){ const s=rpick(rng,pool); if(!skills.includes(s))skills.push(s); }
  const subs=rollSubs(rng,pos,rarity);
  return {
    id:nextCardId(),
    name:rpick(rng,GIVEN)+" "+rpick(rng,FAMILY[nation]),
    pos,                          // メイン(大分類)
    subs,                         // サブ(複数)。subs[0] がプライマリ
    rarity, ovr:calcOvr(pos,st),
    age:rri(rng,18,34), nation,
    ...st,                        // atk/def/pow/tec/spd/sta
    skills,
    club:opts.club||"",           // 所属クラブ(コンビネーション combo の判定に使う)
  };
}
/** プライマリのサブポジション(表示の既定)。 */
const primarySub=c=>c.subs[0];

/** 1チーム分(先発11+控え)を作る。強さの水準は ovrBias で調整する。 */
function makeRoster(rng,opts={}){
  const plan=["GK","GK","DF","DF","DF","DF","DF","MF","MF","MF","MF","MF","FW","FW","FW","FW"];
  return plan.map(pos=>makeCard(rng,pos,opts));
}

/** カードの表示用レア度ラベル。 */
const rarLabel=c=>RARITY[c.rarity].label;

/** 編成の強さ(平均OVR)。期待順位やCPUの戦力比較に使う。 */
function squadPower(cards){
  const a=cards.filter(Boolean);
  return a.length?Math.round(sum(a.map(c=>c.ovr))/a.length):0;
}

/**
 * 枠(サブポジション)に対する適性。
 *   プライマリが一致    = 1.00
 *   他のサブが一致      = 0.95(複数ポジションをこなす選手の価値)
 *   大分類だけ同じ      = 0.85
 *   それ以外            = 0.60
 */
function slotFit(card,subPos){
  if(!card)return 0;
  if(card.subs[0]===subPos)return 1;
  if(card.subs.includes(subPos))return 0.95;
  return card.pos===subGroup(subPos)?0.85:0.6;
}
