// ================= 選手カード =================
// 選手は「プレイヤーの資産(コレクション)」と「クラブからの貸与」の2種類があるが、
// カードそのものの形は同じ。所有の区別は持ち主側(S.player.coll / S.club.loan)で表す。
// → docs/03-game-design.md §3.2.2(二層) / §3.4(D13 貸与)

// 名前の素材。国ごとに雰囲気を変えるため、姓のプールを国に紐づける。
const GIVEN=["A.","B.","C.","D.","E.","F.","G.","H.","J.","K.","L.","M.","N.","O.","P.","R.","S.","T.","V.","Y."];
// 姓は国ごとに48個。1クラブ16人は**この中から重複なしで配る**(makeRoster)ので、
// 同じクラブに同姓は並ばない。世界全体では 32クラブ×16人=512人がこの4×48を共有するため、
// 別クラブ同士で同姓が出ることはある(それは自然なのでよしとする)。
const FAMILY={
  nordia:["ハルヴォルセン","ベリストローム","リンドクヴィスト","バッカー","エリクソン","ソルベリ","ノルドヴァル","ハーゲン",
          "オルセン","ダールベリ","フォシュベリ","ニルソン","ヴィークランド","サンドバリ","ユーハンソン","レンベリ",
          "アスプルンド","ヘルガソン","ブロム","シェーグレン","オーケルルンド","ヴェスターグレン","ホルムベリ","ラーション",
          "グスタフソン","スヴェンソン","ダニエルソン","ノルドストレム","リンドホルム","エングストロム","ボリエソン","ハンマル",
          "シェルベリ","ストランドベリ","オーデガード","ソールハイム","ビョルンスタ","ヴィークネス","ヨハンセン","クリステンセン",
          "モーテンセン","スコウ","ヴィンター","オルスタ","ランネル","フリーベリ","ヘグルンド","トールヴァルセン"],
  iberia:["シルヴェイラ","ドゥアルテ","コスタ","アルメイダ","ロブレド","ミランダ","ベルナル","キンタナ",
          "アギレラ","カルヴァーリョ","フェレイラ","エスコバル","バリオス","ソラーノ","メンドーサ","パチェコ",
          "ヴィエイラ","サンチェス","ナヴァロ","レイス","オルテガ","カブレラ","サラサール","モンテイロ",
          "レゼンデ","バティスタ","セルヴァンテス","アランダ","ペレイラ","ヒメネス","カステリャーノス","オソリオ",
          "ヴァルガス","ロサーノ","デルガード","フエンテス","アルバラード","ノゲイラ","テイシェイラ","マガリャンイス",
          "ソウザ","ピニェイロ","ブラガンサ","アセベド","サモラ","ベナビデス","エチェバリア","アリアス"],
  estra: ["コワルスキ","リッチ","オセイ","ノヴァク","ヴァレンタ","マルティネク","ブラホ","シュミット",
          "ホルヴァート","ヴォイタ","ザヤツ","ペトロフ","ドヴォルザーク","クラウス","バルトシュ","マズル",
          "ヤンコフ","ステファノフ","ルカーチ","ネメシュ","プロハースカ","チェルニー","セドラーチェク","フサーク",
          "マレク","ヴラチル","ズィーマ","コナル","ヴィシニェフスキ","ヴォイチェホフスキ","ヤブウォンスキ","ドンブロフスキ",
          "ザレフスキ","ミハイロフ","ディミトロフ","ゲオルギエフ","イリエフ","サボー","トート","ヴァルガ",
          "キシュ","ファルカシュ","バログ","オラー","ラドヴァノヴィチ","ミルコヴィチ","ヨヴァノヴィチ","パヴロヴィチ"],
  garia: ["ヴァントロワ","ヴァンドーレン","ルフェーヴル","モロー","デュラン","ボネ","カロン","ドラクロワ",
          "ベルナール","フォンテーヌ","ジラール","マルソー","ロシェ","テヴナン","ヴィアル","オービュッソン",
          "クレマン","ダルモン","ペリエ","ラフォン","メルシエ","ギヨーム","シャルパンティエ","ブリアン",
          "ヴェルニエ","コランタン","レニエ","ボードワン","フルニエ","ラガルド","ミショー","ドリュオン",
          "セナール","プリュヴォ","ヴァリエ","ノエル","デュフール","ブランシャール","カリエール","ロンサール",
          "エスクデ","ジョベール","ティボー","ヴェルディエ","オリオール","ラルシェ","ボーモン","シャステル"],
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
    // 姓は opts.family があればそれを使う(makeRoster が重複なしで配る)
    name:rpick(rng,GIVEN)+" "+(opts.family||rpick(rng,FAMILY[nation])),
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
  // 姓は**重複なしで配る**。同じクラブに同姓が並ぶと編成画面で見分けが付かない
  // (16人 < 姓48個 なので必ず足りる)。
  const fam=rshuffle(rng,FAMILY[opts.nation||NATIONS[0]]);
  return plan.map((pos,i)=>makeCard(rng,pos,{ ...opts, family:fam[i] }));
}

/** カードの表示用レア度ラベル。 */
const rarLabel=c=>RARITY[c.rarity].label;

/** 編成の強さ(平均OVR)。期待順位やCPUの戦力比較に使う。 */
function squadPower(cards){
  const a=cards.filter(Boolean);
  return a.length?Math.round(sum(a.map(c=>c.ovr))/a.length):0;
}

/**
 * 枠(サブポジション)に対する適性(→docs/03 §3.14)。card-eleven を踏襲した3段。
 *   サブポジションが一致        本来の力を出せる
 *   サブは不一致・メインが一致  とりあえず使えるが本来の力は出ない
 *   サブもメインも不一致        ほぼ機能しない
 * 係数そのものは TUNING.fit にある(ここに書くと実装とずれる)。
 * **プライマリと他のサブは区別しない**。複数のサブを持つこと自体が価値になる。
 * 係数は TUNING.fit に置く(調整点を1か所に保つ)。
 */
function slotFit(card,subPos){
  if(!card)return 0;
  const F=TUNING.fit;
  if(card.subs.includes(subPos))return F.sub;
  return card.pos===subGroup(subPos)?F.main:F.none;
}
/** 適性の段(表示用)。a=サブ一致 / b=メインのみ / c=不一致 → docs/06 §6.15 */
function fitTier(card,subPos){
  const f=slotFit(card,subPos), F=TUNING.fit;
  return f>=F.sub?"a":f>=F.main?"b":"c";
}
/**
 * **配置込みの**編成力。squadPower が OVR の平均なのに対し、
 * こちらは各枠の適性を掛ける。試合で実際に効くのはこちら(→match-core)。
 */
function squadPowerAt(cards,form){
  const slots=FORMATIONS[form]||[];
  const a=[];
  slots.forEach(([sub],i)=>{ const c=cards[i]; if(c)a.push(c.ovr*slotFit(c,sub)); });
  return a.length?Math.round(sum(a)/a.length):0;
}
