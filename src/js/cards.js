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

/** OVR からポジション別に4能力へ配分する。合計は OVR×4 前後に収める。 */
function statsFor(rng,pos,ovr){
  // [atk, def, spd, tec] の重み。GKは def を「守備=セービング」として扱う。
  const W={ GK:[0.55,1.35,0.85,1.05], DF:[0.70,1.30,1.00,0.90],
            MF:[0.95,0.95,1.00,1.15], FW:[1.35,0.60,1.15,0.95] }[pos];
  const st=W.map(w=>{
    const v=ovr*w+rri(rng,-4,4);
    return clamp(Math.round(v),35,99);
  });
  return { atk:st[0], def:st[1], spd:st[2], tec:st[3] };
}

/** 4能力から OVR を再計算する(ステータスを変えたら必ずこれで揃える)。 */
function calcOvr(pos,st){
  const W={ GK:[0.10,0.45,0.15,0.30], DF:[0.12,0.46,0.22,0.20],
            MF:[0.24,0.24,0.22,0.30], FW:[0.42,0.08,0.26,0.24] }[pos];
  return Math.round(W[0]*st.atk+W[1]*st.def+W[2]*st.spd+W[3]*st.tec);
}

/** レアリティを抽選する(重みは RARITY.w)。opts.min で下限を指定できる。 */
function rollRarity(rng,minKey){
  const from=minKey?RAR_KEYS.indexOf(minKey):0;
  const pool=RAR_KEYS.slice(from);
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
  const ovr=clamp(rri(rng,lo,hi)+(opts.ovrBias||0),50,99);
  // 自国籍が中心だが、3割ほどは外国籍にして顔ぶれに幅を出す
  const nation=(opts.nation&&rng()<0.7)?opts.nation:rpick(rng,NATIONS);
  const st=statsFor(rng,pos,ovr);
  const pool=SKILLS[pos];
  const n=rarity==="ULTRA"?3:rarity==="SUPER"?3:rarity==="RARE"?2:1;
  const skills=[];
  while(skills.length<n){ const s=rpick(rng,pool); if(!skills.includes(s))skills.push(s); }
  return {
    id:nextCardId(),
    name:rpick(rng,GIVEN)+" "+rpick(rng,FAMILY[nation]),
    pos, favPos:rpick(rng,SUBPOS[pos]),
    rarity, ovr:calcOvr(pos,st),
    age:rri(rng,18,34), nation,
    atk:st.atk, def:st.def, spd:st.spd, tec:st.tec,
    skills,
    club:opts.club||"",          // 所属クラブ(コンビネーション combo の判定に使う)
  };
}

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

/** 枠(細分ポジション)に対する適性。ぴったり=1、大分類が同じ=0.85、それ以外=0.6。 */
function slotFit(card,subPos){
  if(!card)return 0;
  if(card.favPos===subPos)return 1;
  const group=Object.keys(SUBPOS).find(g=>SUBPOS[g].includes(subPos));
  return card.pos===group?0.85:0.6;
}
