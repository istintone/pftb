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
  // 国籍は呼び出し側が決める(makeRoster がリーグの構成比から配る)。
  // 単体で作るときだけ、ここで世界中から1つ引く。
  const nation=opts.nation||rpick(rng,NATION_IDS);
  const st=statsFor(rng,pos,ovr);
  const pool=SKILLS[pos];
  const n=RARITY[rarity].skills;
  const skills=[];
  while(skills.length<n){ const s=rpick(rng,pool); if(!skills.includes(s))skills.push(s); }
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
  };
}

// ---------- 汎用選手の絵(→docs/03 §3.19) ----------
// 絵の一覧を**コードに持たない**。書き出し名が `<段>-<ポジション>-<ハッシュ>` なので、
// ASSETS のキーを見れば振り分けられる。**絵を足しても JS を触らなくてよい。**
//
// カードに art を持たせない(=セーブに残さない)のも要点。描画のたびに引き直すので、
// **絵を足すとその場で手持ちの選手にも新しい絵が回る**。誰がどれになるかは変わるが、
// カードの中身は変わらないので、これは意図した挙動(→§3.19)。
const _artPool={};
function artPool(rar,pos){
  const key=rar+":"+pos;
  if(_artPool[key])return _artPool[key];
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
  const A=(typeof window!=="undefined"&&window.ASSETS&&window.ASSETS.players)||{};
  if(c.art&&A[c.art+"_play"])return c.art;   // 素材が消えていたら汎用へ落とす
  return commonArt(c);
}
/** プライマリのサブポジション(表示の既定)。 */
const primarySub=c=>c.subs[0];

/**
 * 1チーム分(先発11+控え)を作る。強さの水準は ovrBias で調整する。
 *   opts.nations … 国籍の抽選箱(重み付きで展開済みのID配列 → world.js の nationBox)。
 *                  省略すると世界中から一様に引く。
 * **姓はロスター全体で重複させない**。同じクラブに同姓が並ぶと編成画面で見分けが付かない。
 * 国籍が混ざるので姓のプールも混ざる。埋まらなければ他の国籍から借りてでも重複を避ける。
 */
function makeRoster(rng,opts={}){
  const plan=["GK","GK","DF","DF","DF","DF","DF","MF","MF","MF","MF","MF","FW","FW","FW","FW"];
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
  return plan.map(pos=>{
    const nation=rpick(rng,box);
    return makeCard(rng,pos,{ ...opts, nation, family:takeFamily(nation) });
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
