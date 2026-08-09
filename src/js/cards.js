// ================= 選手カード =================
// 選手は「プレイヤーの資産(コレクション)」と「クラブからの貸与」の2種類があるが、
// カードそのものの形は同じ。所有の区別は持ち主側(S.player.coll / S.club.loan)で表す。
// → docs/03-game-design.md §3.2.2(二層) / §3.4(D13 貸与)

// 名前の素材。国ごとに雰囲気を変えるため、姓のプールを国に紐づける。
// 名は既定でイニシャル1文字。日本のように形式が違う国籍は GIVEN_BY_NATION に持つ。
const GIVEN=["A.","B.","C.","D.","E.","F.","G.","H.","J.","K.","L.","M.","N.","O.","P.","R.","S.","T.","V.","Y."];
const GIVEN_BY_NATION={
  jpn:["拓海","翔太","健太","亮介","直樹","大輔","悠斗","涼太","隼人","圭",
       "諒","匠","陸斗","響","遥斗","蓮","湊","颯太","奏多","律"],
};
/**
 * 表示名を組み立てる。並び順は国籍が持つ(→data.js の NATIONS.order)。
 *   west(既定) … "A. スミス"   名 → 姓
 *   east       … "秋山 拓海"   姓 → 名
 * 姓は別途 card.sur に持たせる。**並び順が変わると末尾が姓とは限らない**ので、
 * 表示名を分割して姓を取り出すやり方は使えない(→ui.js の shortName)。
 */
function makeName(rng,nation,family){
  const given=rpick(rng,GIVEN_BY_NATION[nation]||GIVEN);
  const nat=nationById(nation);
  return (nat&&nat.order==="east")?(family+" "+given):(given+" "+family);
}
// 監督の名前(→docs/03 §3.34)。**監督には機能が無く、名前しか要らない。**
// 選手とは別のプールにしてあるので、相手の監督名が選手名とぶつからない。
// 国籍は持たせない — 監督は国を跨いで渡り歩くもので、クラブの国と揃える必要がない。
const COACH_SUR=[
  "アルベリーニ","ボスカート","チェッリーニ","ドナーティ","エステルハージ","ファブレガット",
  "グラッシ","ホルンバッハ","イサクソン","ジャンヴィエ","カウフマン","ラガルディア",
  "マルシャル","ネルヴィ","オルブライト","パスカリ","キンテーロ","リーゼンフーバー",
  "サルヴァトーレ","タリアフェロ","ウルバーノ","ヴァレンティ","ヴュルツ","ザネッラ",
  "ベルガンサ","コルティナ","ドゥブロフスキ","エングストローム","フェルミン","ガロファロ",
  "ハーヴィック","インブローダ","ジュリアーニ","クレインフェルト","ロンバルド","モンテフスコ",
  "ノルドクヴィスト","オッターソン","プロヴェンツァーノ","ロヴィラ",
];
/** 監督の名前を決定的に引く。key が同じなら、いつ開いても同じ人物になる。 */
function coachName(key){
  const rng=mulberry32((hashStr("coach:"+key)^0x9e3779b9)>>>0);
  return rpick(rng,GIVEN)+" "+rpick(rng,COACH_SUR);
}
// 姓は**国籍ごと**に20個(計320個)。1クラブ16人は複数の国籍から集まるので、
// makeRoster が姓が重ならないように配る(同じクラブに同姓が並ぶと見分けが付かない)。
const FAMILY={
  eng:  ["スミス","ジョーンズ","テイラー","ブラウン","ウィルソン","デイヴィス","エヴァンス","トンプソン","ライト","ウォーカー","ホワイト","グリーン","ハリス","クラーク",
         "ベイカー","モーガン","フォスター","ケリー","ヒューズ","ベネット"],
  esp:  ["ガルシア","フェルナンデス","ロペス","モラレス","ヒメネス","ナヴァロ","セラーノ","カステーヨ","オルテガ","アギレラ","ロブレド","キンタナ","ベルナル","エスコバル",
         "バリオス","サモラ","アセベド","ベナビデス","アランダ","サラサール"],
  ita:  ["ロッシ","ベルナルディ","コロンボ","リッチ","マリーニ","グレコ","ロンバルディ","バルビエリ","カターニア","フェラーラ","モレッティ","ガッリ","サルヴィ","デ・ルーカ",
         "パガーノ","ヴィターリ","レオーネ","トスカーノ","オルランディ","ベネデッティ"],
  fra:  ["ルフェーヴル","モロー","デュラン","ボネ","ドラクロワ","フォンテーヌ","ジラール","マルソー","ロシェ","テヴナン","ヴィアル","クレマン","ダルモン","ペリエ","ラフォン",
         "メルシエ","ギヨーム","ブリアン","フルニエ","ヴェルディエ"],
  ger:  ["ミュラー","シュミット","ヴェーバー","ワグナー","ベッカー","ホフマン","シェーファー","クラウス","リヒター","ケーラー","ブラント","ノイマン","ツィマーマン","ハートマン",
         "フランケ","ゼーガー","キルシュ","ラインハルト","シュトルツ","フォークト"],
  por:  ["シルヴェイラ","ドゥアルテ","コスタ","アルメイダ","カルヴァーリョ","フェレイラ","ヴィエイラ","レイス","モンテイロ","ノゲイラ","テイシェイラ","ピニェイロ","ブラガンサ",
         "マガリャンイス","レゼンデ","フォンセカ","アゼヴェド","マチャド","サントス","ロウレンソ"],
  ned:  ["ヤンセン","バッカー","フィッサー","スミット","メイヤー","デ・グラーフ","ダイクストラ","ボス","フルート","ペータース","ホーフマン","ブリンク","クイパー","ヴェルメール",
         "スホルテン","リンデルス","オーステルハウス","ヴァンダール","コック","ムルダー"],
  bel:  ["ヘンドリクス","ウィレムス","クレイス","ドゥ・スメット","マールテンス","ヴァンホーヴェ","デクレルク","ヴェルビースト","ヴァンデンベルフ","デヴォス","ヤコブス","セーガース",
         "ヴァンダム","ラムベール","デュポン","ジルソン","レイナールト","スタッセン","ボダール","ティレマン"],
  cro:  ["ホルヴァート","マルコヴィチ","ペトロヴィチ","ヨヴァノヴィチ","ラドヴァノヴィチ","ミルコヴィチ","パヴロヴィチ","ヴコヴィチ","トミッチ","バビッチ","クネジェヴィチ","ラキッチ",
         "ザヤツ","ノヴァク","マティッチ","ボジッチ","グルビッチ","シムニッチ","ユリッチ","ヴィドヴィチ"],
  den:  ["イェンセン","ニールセン","ハンセン","ペダーセン","アンデルセン","クリステンセン","ラーセン","セーレンセン","ラスムセン","ヨルゲンセン","モーテンセン","オルセン",
         "トムセン","ポールセン","スコウ","ヴィンター","ホルム","ダール","ビェア","リンド"],
  pol:  ["コヴァルスキ","ヴィシニェフスキ","ヴォイチェホフスキ","ヤブウォンスキ","ドンブロフスキ","ザレフスキ","カミンスキ","シマンスキ","ヴォズニアク","グラボフスキ","パヴウォフスキ",
         "ミハラク","ジェリンスキ","ソビエスキ","マズル","バルトシュ","クルパ","ヤシンスキ","レシュチンスキ","ステファンスキ"],
  bra:  ["オリヴェイラ","ペレイラ","リマ","カルドーゾ","バルボーザ","ロシャ","メンデス","ラモス","モウラ","バチスタ","カブラル","ゴメス","アラウージョ","フレイタス",
         "タヴァレス","ヴァスコンセロス","シケイラ","ナシメント","ジェズス","コエーリョ"],
  arg:  ["ゴンサレス","ロドリゲス","マルティネス","ペレス","ソーサ","ロメロ","アコスタ","ベニテス","ドミンゲス","オヘダ","カブレラ","メディナ","レイバ","ヴィラルバ","ソリス",
         "パラシオス","カンポス","イバラ","ルハン","ザラテ"],
  uru:  ["バレラ","オリヴェラ","コレア","アリアス","カステージョ","セバージョス","ウルタド","ロサーノ","デルガード","ファリアス","ピリス","レギサモン","オラーサ","ビニャス",
         "サラビア","カルドナ","ベルトラン","エチェバリア","キロス","マルドナド"],
  sen:  ["ディウフ","ンドイエ","サール","ファル","シセ","ゲイ","ンディアイエ","ソウ","バ","カマラ","トゥーレ","ダンファ","ゲイエ","ムバイエ","サンゴ","ジャロ","ボー",
         "セック","タル","ンジャイ"],
  nga:  ["オコンクウォ","アデバヨ","オビ","エゼ","チュクウ","ンワチュク","オラデレ","アビオラ","イケチュクウ","オグ","バログン","アデクンレ","オニエカ","エメカ","ウチェ",
         "オルワセユン","アキンヨミ","オセイ","オカフォー","ンナジ"],
  jpn:  ["秋山","石垣","上原","大津","加賀美","桐谷","剣崎","小早川","志賀","立花",
         "鶴見","長瀬","成瀬","早瀬","深沢","藤堂","三上","望月","柳原","若槻"],
};

// 6桁のカードID。生成元(クラブ/パック)に依らず一意になるよう uid を回す。
let uid=1;
function nextCardId(){ return uid++; }

// ポジション別の能力の重み。各行の合計は 6.0 にそろえてあるので、
// 「OVR を6等分したもの × 重み」で配ると合計が OVR に一致する。
// 順は STAT_KEYS(atk, def, pow, tec, spd, sta)。GKの def はセービングにあたる。
// **どの重みも 1.35 を超えない**(→docs/03 §3.27)。20 に届くのは OVR 89 からで、
// そこは LEGENDS の頂点。これで「上に行くほど尖る」が最後まで崩れない。
// pow/tec/spd は 1.20 までに抑えてあるので、主能力より先に頭打ちにならない。
const STAT_W={
  GK:[0.45,1.35,1.20,1.20,0.85,0.95],
  DF:[0.70,1.35,1.20,0.90,0.95,0.90],
  MF:[0.95,0.95,0.85,1.35,0.95,0.95],
  FW:[1.35,0.60,1.20,1.10,1.20,0.55],
};

// 体つき(→docs/03 §3.27)。**pow / tec / spd の重みだけ**を組み替える。
// ポジションごとの重みが固定だと、同じ枠の選手はみな同じ手を選び、同じ動きになる。
// 3つの合計は変えないので、**OVR も段の帯も動かない**(尖り方だけが変わる)。
const BODY_IX=[2,3,4];                                   // pow / tec / spd
const BODY_NAME=["","パワー型","テクニック型","スピード型","万能型"];
/**
 * その選手の体つきを引く。**ほとんどは素の重み(null)**。
 *   spec … 3つのうち1つが飛び抜ける(FWなのに極端に速い、など)
 *   flat … 3つが横並びになる(尖りは無いが穴も無い)
 */
function rollBody(rng){
  const B=TUNING.body;
  if(rng()>=B.rate)return null;
  return rng()<B.flat?{ kind:"flat" }:{ kind:"spec", ix:BODY_IX[Math.floor(rng()*3)] };
}
/**
 * 体つきを能力に反映する。**3つの中だけで点を移す**。
 *
 * 重みをいじって `statsFor` に配らせてはいけない。削ったぶんが **atk など別の能力へ
 * 流れて**しまい、特化が「速くて決定力も高い」という純粋な強化になる。実測で
 * 1試合の得点が 2.7 → 7.0 まで跳ねた。3つの中で閉じれば、尖った分だけ必ず穴が空く。
 */
function applyBody(st,body){
  if(!body)return st;
  const B=TUNING.body, keys=BODY_IX.map(i=>STAT_KEYS[i]);
  const tot=keys.reduce((n,k)=>n+st[k],0);
  if(body.kind==="flat"){
    const base=Math.floor(tot/3);
    keys.forEach((k,i)=>st[k]=base+(i<tot-base*3?1:0));
    return st;
  }
  const hi=STAT_KEYS[body.ix], lo=keys.filter(k=>k!==hi);
  for(const k of lo){
    const move=Math.min(B.move,st[k]-1,STAT_MAX-st[hi]);
    if(move>0){ st[k]-=move; st[hi]+=move; }
  }
  return st;
}
/** 体つきの呼び名(カード詳細に出す)。素の重みなら空。 */
const bodyLabel=body=>!body?"":body.kind==="flat"?BODY_NAME[4]:BODY_NAME[BODY_IX.indexOf(body.ix)+1];

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
  // 国籍は呼び出し側が決める(makeRoster がリーグの構成比から配る)。
  // 単体で作るときだけ、ここで世界中から1つ引く。
  const nation=opts.nation||rpick(rng,NATION_IDS);
  // 体つき(→docs/03 §3.27)。**能力を配ってから3つの中で移す**
  const body=rollBody(rng);
  const st=applyBody(statsFor(rng,pos,ovr),body);
  // 位置ごとの札 + 汎用の札(→docs/08 §8.4)。**汎用は専門の札より出にくい**。
  // 均等に混ぜると位置の札が薄まり、それだけで試合のバランスが動く(→§8.5)
  const own=SKILLS[pos]||[], n=RARITY[rarity].skills;
  const skills=[];
  for(let guard=0;skills.length<n&&guard<200;guard++){
    const from=(rng()<TUNING.skill.any)?SKILLS_ANY:own;
    const s=rpick(rng,from);
    if(!skills.includes(s))skills.push(s);
  }
  const subs=rollSubs(rng,pos,rarity);
  const sur=opts.family||rpick(rng,FAMILY[nation]);
  return {
    id:nextCardId(),
    // 姓は makeRoster が重複なしで配る。並び順は国籍で変わる(日本は姓が先)
    name:makeName(rng,nation,sur),
    sur,                          // 姓。表示名から切り出せないので別に持つ
    pos,                          // メイン(大分類)
    subs,                         // サブ(複数)。subs[0] がプライマリ
    rarity, ovr:calcOvr(pos,st),
    age:rri(rng,18,34), nation,
    ...st,                        // atk/def/pow/tec/spd/sta
    skills,
    club:opts.club||"",           // 所属クラブ(コンビネーション combo の判定に使う)
    ...(body?{ body:bodyLabel(body) }:{}),   // 体つき(→docs/03 §3.27)。素の重みなら持たない
  };
}

// ---------- 汎用選手の絵(→docs/03 §3.19) ----------
// 絵の一覧を**コードに持たない**。書き出し名が `<段>-<ポジション>-<ハッシュ>` なので、
// ASSETS のキーを見れば振り分けられる。**絵を足しても JS を触らなくてよい。**
//
// カードに art を持たせない(=セーブに残さない)のも要点。描画のたびに引き直すので、
// **絵を足すとその場で手持ちの選手にも新しい絵が回る**。誰がどれになるかは変わるが、
// カードの中身は変わらないので、これは意図した挙動(→§3.19)。
/**
 * 絵の在処(→docs/03 §3.19)。**自動生成の汎用は players、手で足した実在選手は sig**。
 * 書き出し先を分けているのは、手で足した1枚が60枚の自動生成に埋もれないため。
 */
const artOf=key=>{
  const W=(typeof window!=="undefined"&&window.ASSETS)||{};
  return (W.sig&&W.sig[key])||(W.players&&W.players[key])||null;
};
const _artPool={};
function artPool(rar,pos){
  const key=rar+":"+pos;
  if(_artPool[key])return _artPool[key];
  // **汎用のプールは players だけ**。実在選手が抽選で回ってきてはいけない
  const A=(typeof window!=="undefined"&&window.ASSETS&&window.ASSETS.players)||{};
  const all=Object.keys(A).filter(k=>k.endsWith("_play")).map(k=>k.slice(0,-5));
  const r=(rar||"").toLowerCase(), p=(pos||"").toLowerCase();
  // **合致するプールを全部足す**。段やポジション専用の絵を1枚入れた途端に
  // 全員がその1枚になる、という事故を防ぐ(バラエティは足し算で増える)。
  //
  // **GK だけは外野の絵に落とさない。** 絵が明確に違うので、GKが外野の格好で
  // 出るのは他のどのズレより目立つ。外野は "out"(外野なら誰でも可)まで落とす。
  const tiers=p==="gk"?[[r,"gk"],["any","gk"]]
                      :[[r,p],["any",p],[r,"out"],["any","out"]];
  const seen=new Set(), out=[];
  for(const [rr,pp] of tiers)
    for(const k of all)
      if(k.startsWith(rr+"-"+pp+"-")&&!seen.has(k)){ seen.add(k); out.push(k); }
  return (_artPool[key]=out.sort());
}
/**
 * カードに割り当てる絵のキー。**乱数を使わない**のが要点。
 * makeCard の rng を1回でも余計に引くと、そのあとに作られる選手が全員ずれる
 * (クラブの顔ぶれが総入れ替えになる)。IDのハッシュなら乱数列に触らずに決まる。
 */
function commonArt(c){
  const p=artPool(c.rarity,c.pos);
  return p.length?p[hashStr("art:"+c.id)%p.length]:null;
}
/** そのカードが実際に使う絵。**手で指定した絵(署名カード)が最優先**。 */
function artKeyOf(c){
  if(c.art&&artOf(c.art+"_play"))return c.art;   // 素材が消えていたら汎用へ落とす
  return commonArt(c);
}
/** プライマリのサブポジション(表示の既定)。 */
const primarySub=c=>c.subs[0];

// ---------- スカウト(→docs/03 §3.22) ----------
// **コインで引くパック。** 試合ごとに配るのではなく、稼いだコインをいつ使うかを選ばせる。
// 監督が自分で補強のタイミングを決める、という体験にしたいため(WCCFの1試合1パックは踏襲しない)。

/** 段を1つ引く。pack.w があればその重みで、無ければ通常の出現率。 */
function scoutRarity(rng,pack,minKey){
  if(!pack.w)return rollRarity(rng,minKey);
  // **重みを持つパックは、そこに書かれた段だけを見る。**
  // WORLD CLASS は RARITY.w が 0 なので普通のパックからは出ないが、
  // プロスカウトのように明示したパックからは出る(→docs/03 §3.26)
  const keys=RAR_KEYS.filter(k=>(pack.w[k]||0)>0);
  const from=minKey?Math.max(0,keys.indexOf(minKey)):0;
  const pool=keys.slice(from);
  const total=sum(pool.map(k=>pack.w[k]||0));
  if(total<=0)return rollRarity(rng,minKey);
  let x=rng()*total;
  for(const k of pool){ x-=(pack.w[k]||0); if(x<=0)return k; }
  return pool[pool.length-1];
}
/**
 * パックを1つ開ける。**確定枠は最後ではなく最初に引く**。
 * 最後に回すと「残り1枚で確定」が読めてしまい、めくる楽しみが消える。
 */
function openScout(pack,rng,boost){
  const out=[];
  for(let i=0;i<pack.cards;i++){
    const min=(i===0&&pack.floor)?pack.floor:null;
    let rarity=scoutRarity(rng,pack,min);
    // **スカウト網**(→docs/03 §3.5)。確率で引き直し、良いほうを取る
    if(boost&&rng()<boost){
      const r2=scoutRarity(rng,pack,min);
      if(RAR_KEYS.indexOf(r2)>RAR_KEYS.indexOf(rarity))rarity=r2;
    }
    const pos=rpick(rng,["GK","DF","DF","MF","MF","MF","FW","FW"]);   // GKは出過ぎない
    out.push(makeCard(rng,pos,{ rarity }));
  }
  // 引いた順のままだと確定枠が必ず先頭に来る。並べ替えて隠す
  for(let i=out.length-1;i>0;i--){ const j=Math.floor(rng()*(i+1)); [out[i],out[j]]=[out[j],out[i]]; }
  return out;
}

/** 内訳({STD:10,REG:6} など)を16人ぶんの段の並びに展開する。 */
function expandRarPlan(plan){
  const bag=[];
  RAR_KEYS.forEach(k=>{ for(let i=0;i<(plan[k]||0);i++)bag.push(k); });
  return bag;
}
/**
 * 1チーム分(先発11+控え)を作る。強さの水準は ovrBias で調整する。
 *   opts.nations … 国籍の抽選箱(重み付きで展開済みのID配列 → world.js の nationBox)。
 *                  省略すると世界中から一様に引く。
 *   opts.rarPlan … 段の内訳(→docs/03 §3.25)。指定するとその内訳を配り切る。
 * **姓はロスター全体で重複させない**。同じクラブに同姓が並ぶと編成画面で見分けが付かない。
 * 国籍が混ざるので姓のプールも混ざる。埋まらなければ他の国籍から借りてでも重複を避ける。
 */
function makeRoster(rng,opts={}){
  const plan=["GK","GK","DF","DF","DF","DF","DF","MF","MF","MF","MF","MF","FW","FW","FW","FW"];
  // **段の内訳が指定されていれば、それを配り切る**(→docs/03 §3.25)。
  // どのポジションに強い段が来るかは抽選(偏らないよう並びをかき混ぜる)
  let bag=null;
  if(opts.rarPlan){
    bag=expandRarPlan(opts.rarPlan);
    while(bag.length<plan.length)bag.push("STD");
    bag=rshuffle(rng,bag).slice(0,plan.length);
  }
  const box=opts.nations&&opts.nations.length?opts.nations:NATION_IDS;
  const bags={};                                  // 国籍ごとの姓の袋(引いたら減る)
  const used=new Set();
  const takeFamily=nat=>{
    for(const id of [nat,...rshuffle(rng,NATION_IDS)]){   // 尽きたら他国から借りる
      if(!bags[id])bags[id]=rshuffle(rng,FAMILY[id]);
      const f=bags[id].find(x=>!used.has(x));
      if(f){ used.add(f); return f; }
    }
    return null;                                  // 320個あるので実際には起きない
  };
  return plan.map((pos,i)=>{
    const nation=rpick(rng,box);
    return makeCard(rng,pos,{ ...opts, nation, family:takeFamily(nation),
      rarity:bag?bag[i]:opts.rarity });
  });
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
