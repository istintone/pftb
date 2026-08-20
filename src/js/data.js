"use strict";
// ================= 定義・ユーティリティ =================
// このファイルは結合時の先頭。1行目の "use strict"; の直後へ build.py が
// アセット(window.ASSETS)を注入するので、1行目は必ず "use strict"; のままにする。

const GAME={ id:"pftb", title:"P-footBall", sub:"CLUB CARD FOOTBALL" };

// --- 汎用ユーティリティ ---
const ri=(a,b)=>a+Math.floor(Math.random()*(b-a+1));    // a..b の整数乱数(両端含む)
const rnd=a=>a[Math.floor(Math.random()*a.length)];     // 配列から1つ
const clamp=(v,lo,hi)=>v<lo?lo:v>hi?hi:v;
const sum=a=>a.reduce((x,y)=>x+y,0);
const fmtNum=n=>String(Math.round(n||0)).replace(/\B(?=(\d{3})+(?!\d))/g,",");  // 12400 → "12,400"
function todayLabel(){                                   // 契約書の締結日
  const d=new Date();
  return d.getFullYear()+"年"+(d.getMonth()+1)+"月"+d.getDate()+"日";
}

// --- 決定的な乱数(mulberry32) ---
// 世界(クラブの選手)はセーブに持たず、シード + クラブIDから毎回同じ内容を再生成する。
// これでセーブが軽くなり、同じキャリアなら何度開いても同じ選手が並ぶ。
function mulberry32(seed){
  let a=seed>>>0;
  return function(){
    a=(a+0x6D2B79F5)>>>0;
    let t=Math.imul(a^(a>>>15),1|a);
    t=(t+Math.imul(t^(t>>>7),61|t))^t;
    return ((t^(t>>>14))>>>0)/4294967296;
  };
}
// 文字列 → 32bit ハッシュ(シードの合成に使う)
function hashStr(s){
  let h=2166136261>>>0;
  for(let i=0;i<s.length;i++){ h^=s.charCodeAt(i); h=Math.imul(h,16777619); }
  return h>>>0;
}
// rng を受け取るヘルパ(Math.random 版と使い分ける)
const rri=(rng,a,b)=>a+Math.floor(rng()*(b-a+1));
const rpick=(rng,a)=>a[Math.floor(rng()*a.length)];
/** 決定的シャッフル(Fisher-Yates)。**重複なしで配りたい**ときに使う。元の配列は壊さない。 */
function rshuffle(rng,a){
  const out=a.slice();
  for(let i=out.length-1;i>0;i--){ const j=Math.floor(rng()*(i+1)); const t=out[i]; out[i]=out[j]; out[j]=t; }
  return out;
}

// --- 能力 ---
// WCCF に由来し、上限は各20。OVR は6つの**合計**なので最大120になる。
// card-eleven と同じ6軸にすることで、試合ロジックを card-eleven の考え方の上で
// 差別化できるようにしてある(→docs/03 §3.13)。
const STAT_KEYS=["atk","def","pow","tec","spd","sta"];
const STAT_LABEL={ atk:"ATK", def:"DEF", pow:"POW", tec:"TEC", spd:"SPD", sta:"STA" };
// 能力を**言葉**で言い換える(→docs/03 §3.35)。秘書は数字を読み上げないので、
// 「いちばん高い能力」はこの言い方で伝える。連体形にしてあるのは「〜選手です」に繋ぐため。
const STAT_TRAIT={ atk:"得点の取れる", def:"守備の堅い", pow:"当たりの強い",
                   tec:"技術のある", spd:"足の速い", sta:"よく走る" };
const STAT_MAX=20;
const OVR_MAX=STAT_MAX*STAT_KEYS.length;   // 120

// --- ポジション ---
// メイン(大分類)とサブの組み合わせ。カードは**サブを複数**持ち、subs[0] がプライマリ。
const POS=["GK","DF","MF","FW"];
const SUBPOS={
  GK:["GK"],
  DF:["CB","CB","LSB","RSB"],              // CBを厚めに(生成時の出現比を兼ねる)
  MF:["DMF","CMF","CMF","OMF","LMF","RMF"],
  FW:["CF","ST","LWG","RWG"],
};
// 例外的に持てる「隣接する」サブ。FWのSTがOMFもこなす、といったケース。
// プライマリは必ずメインの側から選ぶので、メインが揺らぐことはない。
const NEIGHBOR_SUBS={
  GK:[],
  DF:["DMF"],
  MF:["CB","ST","CF"],
  FW:["OMF"],
};
/** サブポジションが属する大分類を返す(隣接サブも含めて引ける)。 */
function subGroup(sub){
  return POS.find(g=>SUBPOS[g].includes(sub))||null;
}

// --- レアリティ(D18 → docs/03 §3.13) ---
// 段は「監督から見た選手の役割」で分かれる。色は base.css の --rar-* と対応。
//   ovr    6能力合計の目安(最大120)
//   skills 持てるスキル数
//   w      通常パックからの排出の重み。0 = パックからは出ない(別経路)
//   real   実在選手をモチーフにする段(手で定義するデータ。自動生成しない)
//   abbr   カード左上のクレストに入れる2文字(正式名称は長すぎて入らない)
//   bg     背景画像のキー。**SPECIALS は REGULAR と同じ背景**を使い、差はCSSの発光で付ける
//   holo   CSSで載せるホロ表現("sheen" 光沢 / "rainbow" 虹 / "gold" 金 / null なし)
//          ホロを画像に焼き込むと質が落ちるため、**必ずCSS側で表現する**
// OVR帯は**天井(20)に張り付かない範囲**に収めてある(→docs/03 §3.27)。
// 主能力の重みは最大 1.35 なので、20 に届くのは OVR 89 から = LEGENDS の頂点だけ。
const RARITY={
  STD: { label:"STANDARD",    abbr:"ST", ovr:[46,65],   skills:1, w:62, real:false, bg:"std", holo:null,
         note:"控え。クラブにはいるがレギュラーではない" },
  REG: { label:"REGULAR",     abbr:"RG", ovr:[58,75],   skills:2, w:30, real:false, bg:"reg", holo:null,
         note:"スタメン。クラブのメイン選手" },
  SPE: { label:"SPECIALS",    abbr:"SP", ovr:[68,80],   skills:3, w:8,  real:false, bg:"reg", holo:"sheen",
         note:"切り札。REGULAR と同じ地だが光る" },
  // w:0 = **既定の重みでは出ない段**。プロスカウトのように段を名指ししたパックからは出る
  // (→docs/03 §3.26)。実在選手そのものは SIGNATURES だけで、段は「強さと見た目の階級」
  WC:  { label:"WORLD CLASS", abbr:"WC", ovr:[76,85],   skills:3, w:0,  real:true,  bg:"wc",  holo:"rainbow",
         note:"世界屈指。シルバー(Chrome)地に虹ホロ" },
  LEG: { label:"LEGENDS",     abbr:"LE", ovr:[82,90],   skills:4, w:0,  real:true,  bg:"leg", holo:"gold",
         note:"歴史に残る名選手。黒地に金縁" },
};
/** 背景画像の種類。SPECIALS が REGULAR を共有するので5段でも4枚で足りる。 */
const CARD_BGS=[...new Set(Object.values(RARITY).map(r=>r.bg))];
const RAR_KEYS=Object.keys(RARITY);
// 既定の重みで出る段(w:0 の段はパック側が名指ししたときだけ出る → §3.26)
const RAR_DROPS=RAR_KEYS.filter(k=>RARITY[k].w>0);

// 画面に出すバージョン(→SPEC.md)。**手で上げる。**
// 日付やコミットハッシュは入れない — 中身の変わらないビルドでも index.html が
// 差分になり、「ビルドし直しただけ」と「本当に変えた」が見分けられなくなる。
const VERSION="0.1.0";

// --- スキル(→docs/03 §3.21 / docs/08) ---
// **1スキル = 1つの掛かり先**。効果は2つだけ:
//   w … その札を**引く重み**の倍率(= どれだけ「機会」が増えるか)
//   s … その判定の**スコア**の倍率(= 機会1回あたりの「効果」)
// **w と s は必ずセット**にする。引きやすいだけでは成功率に繋がらず、強くならない。
//
// **数値はグループの広さから決まる**(→docs/08 §8.6④)。フラットに置くと、
// 広いグループの札(carry 56%)が狭いグループの札(passTec 10%)の**4.8倍**強くなる。
//   価値 = 発動率 × (s−1) を層ごとに揃える → 狭いほど w も s も大きい
//   w を持つ札の s は小さめ(w が発動率を押し上げているぶん)
// 目標値は TUNING.skillVal。careertest が全札の価値を突き合わせる。
// 札を持たない層(GK・空中戦・スタミナ等)は k(単独の倍率)を使う。
// **プールの大きさはポジション間で揃える**(→docs/08 §8.5)。GKが5種しか無かった頃は、
// LEGENDS のGKが5種のうち4種を持つのでどれも同じ札構成になっていた。
const SKILLS={
  GK:["セービング","反射神経","飛び出し判断","PKストップ","ハイボール処理",
      "1対1の強さ","角度の消し方","守備の統率","ビルドアップ"],
  DF:["対人守備","カバーリング","空中戦","ロングパス","オーバーラップ","クロス","スピード","タックル",
      "シュートブロック","クリーンな守備","正確なクロス","厳しい寄せ","推進力","正確なフィード"],
  MF:["スルーパス","視野の広さ","キープ力","ボール奪取","ロングシュート","ドリブル","展開力","運動量",
      "PKの名手","セカンドボール","パスの精度","ミドルの精度","サイドチェンジ","間合いの読み"],
  FW:["決定力","ポストプレー","オフザボール","ドリブル突破","カットイン","フィニッシュ","スピード","空中戦",
      "ゴール前の嗅覚","詰めの速さ","冷静なフィニッシュ","切れ込みの鋭さ","初速"],
};
// **ポジションを問わない札**(→docs/08 §8.4)。どの選手のプールにも足される。
// 掛かり先が「その選手が何をするか」ではなく**「どんな選手か」**なので、位置で分けない。
const SKILLS_ANY=["ケガ耐性","キャプテンシー","ムードメーカー","セットプレーの名手",
                  "スーパーサブ","鉄人"];
/** そのポジションが引ける札の全体(検証用)。実際の抽選は重みを変える → makeCard。 */
const skillPool=pos=>(SKILLS[pos]||[]).concat(SKILLS_ANY);

// 札のグループ。**新しいデータは持たせない**。既にある属性から導く。
//   起点  … kind(pass/carry) / lane(box=クロス, out・switch=散らす, in=中へ) / to(一発)
//   守備  … foul(荒い手) / stat
//   終点  … minH(ゴール前限定かどうか)
const SK_GRP={
  pass:    ch=>ch.kind==="pass",
  carry:   ch=>ch.kind==="carry",
  passTec: ch=>ch.kind==="pass"&&ch.stat==="tec",
  long:    ch=>ch.to!=null,
  cross:   ch=>ch.lane==="box",
  wide:    ch=>ch.lane==="out"||ch.lane==="switch",
  cut:     ch=>ch.lane==="in",
  carryOut:ch=>ch.kind==="carry"&&ch.lane==="out",
  press:   ch=>ch.foul>=0.35,
  close:   ch=>ch.minH!=null,
  far:     ch=>ch.minH==null,
  spd:     ch=>ch.stat==="spd",
  tec:     ch=>ch.stat==="tec",
  set:     ch=>ch.id==="pk"||ch.id==="fk",   // 直接狙うセットプレー
  all:     ()=>true,
};
// at … 札の層(origin / counter / finish)。それ以外は札を持たない**単独の掛かり先**
const SKILL_FX={
  // ---- GK ----
  "セービング":     { at:"gk",       k:1.10 },   // 枠内シュート vs GK
  "反射神経":       { at:"noRebound",k:0.65 },   // こぼれ球そのものが起きにくい
  "飛び出し判断":   { at:"longStop", k:0.92 },   // 相手の一発(long)を摘む
  "PKストップ":     { at:"pkGk",     k:1.30 },
  "ハイボール処理": { at:"aerial",   k:1.12 },
  // **GKを増やすときは「PKに触らない」ものを選ぶ**(→docs/08 §8.6①)。
  // PKは fixAcc で枠内が決まり close=false なので、下の4つはどれもPKに掛からない。
  // ここを外すと、GKの枚数を増やしただけでPK戦の決定率が落ちる(実測 49%→45%)。
  "1対1の強さ":     { at:"gkFin",    grp:"close", s:1.22 },   // ゴール前の終点に強い(26%)
  "角度の消し方":   { at:"offTarget",k:1.08 },   // 相手のシュートが枠を外れやすい
  "守備の統率":     { at:"marshal",  k:1.15 },   // **味方の寄せ**(coverOf の支援ぶん)が厚くなる
  "ビルドアップ":   { at:"mid",      k:1.15 },   // 後ろから組み立てて中盤の押し合いを助ける
  // ---- DF ----
  "対人守備":       { at:"counter", grp:"all",      s:1.05 },
  "カバーリング":   { at:"cover",   k:1.45 },     // 守備の厚み(coverOf)
  "空中戦":         { at:"aerial",  k:1.15 },     // 攻守とも自分の側に効く
  "ロングパス":     { at:"origin",  grp:"long",     w:1.70, s:1.06 },
  "オーバーラップ": { at:"origin",  grp:"carryOut", w:1.95, s:1.09 },
  "クロス":         { at:"origin",  grp:"cross",    w:1.85, s:1.08 },
  // **両層で発動する唯一の札**。起点でも守備でも効くので、1層あたりの s は小さい
  "スピード":       { at:"both",    grp:"spd",      w:1.60, s:1.04 },
  "タックル":       { at:"counter", grp:"press",    s:1.14 },
  "シュートブロック":{ at:"block",   k:1.18 },     // 身体を投げ出してコースを消す
  "クリーンな守備": { at:"clean",   k:0.70 },     // **ファウルもケガも起こしにくい**
  "正確なクロス":   { at:"origin",  grp:"cross",    s:1.13 },  // クロス(W型)の対
  "厳しい寄せ":     { at:"counter", grp:"press",    w:1.60, s:1.10 },  // タックル(S型)の対
  "推進力":         { at:"origin",  grp:"carryOut", s:1.15 },  // オーバーラップ(W型)の対
  "正確なフィード": { at:"origin",  grp:"long",     s:1.09 },  // ロングパス(W型)の対
  // ---- MF ----
  "スルーパス":     { at:"origin",  grp:"passTec",  w:1.85, s:1.08 },
  "視野の広さ":     { at:"vision",  k:1.60, at2:"origin", grp:"pass", s:1.05 },
  "キープ力":       { at:"origin",  grp:"carry",    s:1.05 },
  "ボール奪取":     { at:"counter", grp:"tec",      w:1.60, s:1.10 },
  "ロングシュート": { at:"finish",  grp:"far",      w:2.00, s:1.07 },
  "ドリブル":       { at:"origin",  grp:"carry",    w:1.55, s:1.04 },
  "展開力":         { at:"origin",  grp:"wide",     w:1.70, s:1.07 },
  "運動量":         { at:"stam",    k:0.80 },      // 消耗が緩やか
  "PKの名手":       { at:"pkKick",  k:1.25 },
  "セカンドボール": { at:"mid",     k:1.12 },     // 中盤の押し合い(支配率)に効く
  "パスの精度":     { at:"origin",  grp:"passTec",  s:1.13 },  // スルーパス(W型)の対
  "ミドルの精度":   { at:"finish",  grp:"far",      s:1.08 },  // ロングシュート(W型)の対
  "サイドチェンジ": { at:"origin",  grp:"wide",     s:1.10 },  // 展開力(W型)の対
  "間合いの読み":   { at:"counter", grp:"tec",      s:1.14 },  // ボール奪取(W型)の対
  // ---- FW ----
  "決定力":         { at:"finish",  grp:"all",      s:1.06 },
  "フィニッシュ":   { at:"onTarget",k:1.12 },      // 枠に飛ぶ率
  "ポストプレー":   { at:"recv",    k:1.60, at2:"origin", grp:"carry", s:1.05 },
  "オフザボール":   { at:"start",   k:1.50, at2:"origin", grp:"spd",   s:1.07 },
  "ドリブル突破":   { at:"origin",  grp:"carry",    s:1.05 },
  "カットイン":     { at:"origin",  grp:"cut",      w:1.85, s:1.08 },
  "ゴール前の嗅覚": { at:"finish",  grp:"close",    w:1.70, s:1.13 },
  "詰めの速さ":     { at:"rebound", k:1.15 },
  "冷静なフィニッシュ":{ at:"finish",grp:"close",    s:1.22 },  // ゴール前の嗅覚(W型)の対
  "切れ込みの鋭さ": { at:"origin",  grp:"cut",      s:1.13 },  // カットイン(W型)の対
  "初速":           { at:"origin",  grp:"spd",      s:1.07 },  // スピード(W型)の対
  // ---- 汎用(ポジションを問わない) ----
  "ケガ耐性":       { at:"tough",   k:0.45 },   // 競り負けてもケガをしにくい
  "キャプテンシー": { at:"captaincy",k:1.10 },  // **腕章を巻いているときだけ**勢いが乗る
  "ムードメーカー": { at:"mood",    k:1.05 },   // ピッチに居るだけで勢いが乗りやすい
  // k(クロスの質)と s(直接狙う球)は**別の枝**なので重ならない。それでも s は
  // 控えめに置く — 主効果を持つ札の s は 1.09 までという表の形を崩さないため
  "セットプレーの名手":{ at:"spDeliver",k:1.15, at2:"finish", grp:"set", s:1.08 },
  "スーパーサブ":   { at:"joker",   k:1.90 },   // 交代直後だけボールが集まる
  "鉄人":           { at:"iron",    k:0.45 },   // 好不調の振れ幅が縮む

  // ---- 固有スキル(→docs/03 §3.41) ----
  // **その選手だけが持つ1枚**。SKILLS / SKILLS_ANY に入れないので、
  // 抽選プールには絶対に入らない(生成カードが持つことはない)。
  //
  //   sig  … 持ち主(signatures.js の id)。テストと画面がこれで見分ける
  //   fx   … **1枚で複数の効果**。普通の札は1つだけなので fx を持たない
  //   move … 技名。その札が発動した局面では、チャンネルの呼び名がこれに変わる
  //
  // **効果は1つずつ見れば普通の札と同じ強さ**にしてある(→docs/08 §8.6④)。
  // 特別なのは「1枠で2つ働く」ことと、局面が名前で呼ばれることの2点。
  "不動の門番":     { sig:"buffon",
    fx:[{ at:"psoGk", k:1.30 },{ at:"gk", k:1.10 }] },
  "皇帝のフィード": { sig:"beckenbauer", move:"皇帝のフィード",
    fx:[{ at:"origin", grp:"long", s:1.09 },{ at:"counter", grp:"tec", s:1.14 }] },
  "弾丸の左足":     { sig:"rcarlos", move:"弾丸の左足",
    fx:[{ at:"finish", grp:"set", s:1.08 },{ at:"spDeliver", k:1.15 }] },
  "不動の右":       { sig:"zanetti",
    fx:[{ at:"counter", grp:"all", s:1.05 },{ at:"stam", k:0.80 }] },
  "中盤の掌握":     { sig:"matthaus", move:"一撃のミドル",
    fx:[{ at:"counter", grp:"press", w:1.60, s:1.10 },{ at:"finish", grp:"far", s:1.08 }] },
  "不屈の心臓":     { sig:"schweinsteiger",
    fx:[{ at:"comeback", k:1.35 },{ at:"stam", k:0.85 }] },
  // **終盤だけ跳ねる**。絞られるぶん s は「いつでも効く札」の上限の外に置く
  "疾風の推進":     { sig:"nedved", move:"止まらない推進",
    fx:[{ at:"origin", grp:"carry", w:1.55, s:1.23, when:"late" },{ at:"stam", k:0.82 }] },
  "マエストロ":     { sig:"zidane", move:"マエストロの一差し",
    fx:[{ at:"origin", grp:"passTec", w:1.85, s:1.08 },{ at:"recv", k:1.35 }] },
  "精密機械":       { sig:"beckham", move:"ベンドイット",
    fx:[{ at:"origin", grp:"cross", s:1.13 },{ at:"spDeliver", k:1.15 }] },
  // **脚が残っているあいだだけ**。前半に仕掛けさせる札
  "魔法の足":       { sig:"ronaldinho", move:"エラシコ",
    fx:[{ at:"origin", grp:"cut", w:1.85, s:1.36, when:"fresh" },{ at:"mood", k:1.06 }] },
  "無回転の弾道":   { sig:"ronaldo", move:"無回転ミドル",
    fx:[{ at:"finish", grp:"far", w:2.00, s:1.07 },{ at:"origin", grp:"spd", s:1.07 }] },
  "本能":           { sig:"inzaghi", move:"一瞬の抜け出し",
    fx:[{ at:"finish", grp:"close", w:1.70, s:1.13 },{ at:"recv", k:1.30 }] },
  // --- WORLD CLASS の固有スキル(2026-08-12) ---
  // **LEGENDS と同じ物差し**で置く(→docs/03 §3.41)。段が違っても札の強さは変えない。
  // 段の差は能力(76〜85 と 82〜90)と札の枚数(3枚と4枚)で付いている。
  "加速する司令塔": { sig:"kaka", move:"一気の持ち上がり",
    fx:[{ at:"origin", grp:"carry", w:1.55, s:1.17, when:"fresh" },{ at:"recv", k:1.25 }] },
  "巨壁":           { sig:"courtois",
    fx:[{ at:"gk", k:1.10 },{ at:"aerial", k:1.20 }] },
  "最終ラインの主": { sig:"vandyck", move:"競り勝ち",
    fx:[{ at:"counter", grp:"all", s:1.05 },{ at:"aerial", k:1.22 }] },
  "牙":             { sig:"lmartinez", move:"食い付き",
    fx:[{ at:"counter", grp:"press", w:1.60, s:1.10 },{ at:"tough", k:1.12 }] },
  "絡みつく守備":   { sig:"cucurella",
    fx:[{ at:"counter", grp:"tec", s:1.14 },{ at:"stam", k:0.88 }] },
  "読みの速さ":     { sig:"timber", move:"読み勝ち",
    fx:[{ at:"counter", grp:"all", s:1.05 },{ at:"cover", k:1.18 }] },
  "試合の心拍":     { sig:"rodri", move:"刈り取り",
    fx:[{ at:"counter", grp:"press", w:1.60, s:1.10 },{ at:"mid", k:1.10 }] },
  "遅れて入る":     { sig:"bellingham", move:"二列目からの飛び出し",
    fx:[{ at:"finish", grp:"close", w:1.70, s:1.13 },{ at:"start", k:1.20 }] },
  "曲がる軌道":     { sig:"olise", move:"巻いたクロス",
    fx:[{ at:"origin", grp:"cross", s:1.13 },{ at:"spDeliver", k:1.12 }] },
  "天才の閃き":     { sig:"yamal", move:"閃きのカットイン",
    fx:[{ at:"origin", grp:"cut", w:1.85, s:1.36, when:"fresh" },{ at:"mood", k:1.05 }] },
  "点取りの化身":   { sig:"haaland", move:"叩き込む",
    fx:[{ at:"finish", grp:"close", w:1.70, s:1.13 },{ at:"aerial", k:1.18 }] },
  "加速":           { sig:"mbappe", move:"置き去りの加速",
    fx:[{ at:"origin", grp:"spd", s:1.07 },{ at:"start", k:1.18 }] },
  "左足の魔術":     { sig:"messi", move:"左足の一差し",
    fx:[{ at:"origin", grp:"passTec", w:1.85, s:1.08 },{ at:"vision", k:1.20 }] },
  "間で受ける":     { sig:"wirtz", move:"間で受ける",
    fx:[{ at:"finish", grp:"far", w:2.00, s:1.07 },{ at:"recv", k:1.25 }] },
  // --- 追加の実在選手(2026-08-17) ---
  // **札の組み合わせは既にある形から採る**(→docs/03 §3.41)。
  // 層とグループごとの s は careertest が価値の帯で見張っていて、
  // 新しい数字を思いつきで置くと必ず落ちる。**個性は2枚目の掛かり先で出す**。
  "静かな支配":     { sig:"vandersar",
    fx:[{ at:"gk", k:1.10 },{ at:"marshal", k:1.15 }] },
  "間合いの芸術":   { sig:"nesta", move:"間合いで奪う",
    fx:[{ at:"counter", grp:"tec", s:1.14 },{ at:"clean", k:0.70 }] },
  "果てなき上下動": { sig:"cafu", move:"駆け上がり",
    fx:[{ at:"counter", grp:"all", s:1.05 },{ at:"stam", k:0.80 }] },
  "番犬":           { sig:"davids", move:"食い下がり",
    fx:[{ at:"counter", grp:"press", w:1.60, s:1.10 },{ at:"tough", k:1.12 }] },
  "二列目の砲":     { sig:"lampard", move:"遅れて撃つ",
    fx:[{ at:"finish", grp:"far", w:2.00, s:1.07 },{ at:"start", k:1.20 }] },
  "白い旋律":       { sig:"iniesta", move:"するりと抜ける",
    fx:[{ at:"origin", grp:"passTec", w:1.85, s:1.08 },{ at:"recv", k:1.35 }] },
  "神の左":         { sig:"maradona", move:"五人抜き",
    fx:[{ at:"origin", grp:"cut", w:1.85, s:1.36, when:"fresh" },{ at:"vision", k:1.20 }] },
  "若き司令塔":     { sig:"cubarsi", move:"背後を射抜く",
    fx:[{ at:"origin", grp:"long", s:1.09 },{ at:"cover", k:1.18 }] },
  "持ち上がる壁":   { sig:"gvardiol", move:"運び出し",
    fx:[{ at:"origin", grp:"carry", w:1.55, s:1.17, when:"fresh" },{ at:"aerial", k:1.18 }] },
  "先を読む足":     { sig:"tonali", move:"先回り",
    fx:[{ at:"counter", grp:"all", s:1.05 },{ at:"mid", k:1.10 }] },
  "未完の煌めき":   { sig:"mastantuono", move:"若さの一閃",
    fx:[{ at:"origin", grp:"cut", w:1.85, s:1.36, when:"fresh" },{ at:"mood", k:1.06 }] },
  "冷たい一撃":     { sig:"palmer", move:"表情を変えない一撃",
    fx:[{ at:"finish", grp:"set", s:1.08 },{ at:"pkKick", k:1.25 }] },
  "詰めの嗅覚":     { sig:"ferran", move:"押し込む",
    fx:[{ at:"finish", grp:"close", w:1.70, s:1.13 },{ at:"recv", k:1.25 }] },
  "跳ねる才能":     { sig:"endrick", move:"弾ける初速",
    fx:[{ at:"origin", grp:"spd", s:1.07 },{ at:"start", k:1.18 }] },
  "奔放な足":       { sig:"estevao", move:"止まらない仕掛け",
    fx:[{ at:"origin", grp:"cut", w:1.85, s:1.36, when:"fresh" },{ at:"mood", k:1.05 }] },
  // --- ミランの面々(2026-08-18) ---
  // **札の組み合わせは既にある形から採る**(→docs/03 §3.41)。
  // 層とグループごとの s は careertest が価値の帯で見張っている。個性は2枚目で出す
  "神の手袋":       { sig:"dida",
    fx:[{ at:"gk", k:1.10 },{ at:"psoGk", k:1.30 }] },
  "静かな壁":       { sig:"maldini", move:"間合いで消す",
    fx:[{ at:"counter", grp:"tec", s:1.14 },{ at:"clean", k:0.70 }] },
  "最後の砦":       { sig:"costacruta",
    fx:[{ at:"counter", grp:"all", s:1.05 },{ at:"block", k:1.18 }] },
  "巨岩":           { sig:"stam", move:"押し返す",
    fx:[{ at:"counter", grp:"press", w:1.60, s:1.10 },{ at:"aerial", k:1.20 }] },
  "堅実な左":       { sig:"kaladze",
    fx:[{ at:"counter", grp:"all", s:1.05 },{ at:"tough", k:1.12 }] },
  "レジスタ":       { sig:"pirlo", move:"静かな一差し",
    fx:[{ at:"origin", grp:"passTec", w:1.85, s:1.08 },{ at:"spDeliver", k:1.15 }] },
  "闘犬":           { sig:"gattuso", move:"噛みつく",
    fx:[{ at:"counter", grp:"press", w:1.60, s:1.10 },{ at:"mid", k:1.10 }] },
  "汗かき役":       { sig:"ambrosini",
    fx:[{ at:"counter", grp:"all", s:1.05 },{ at:"stam", k:0.80 }] },
  "四つの持ち場":   { sig:"seedorf", move:"持ち上がって撃つ",
    fx:[{ at:"finish", grp:"far", w:2.00, s:1.07 },{ at:"recv", k:1.25 }] },
  "十番の芸":       { sig:"ruicosta", move:"針の穴を通す",
    fx:[{ at:"origin", grp:"passTec", w:1.85, s:1.08 },{ at:"vision", k:1.20 }] },
  "撃ち抜く":       { sig:"shevchenko", move:"迷いのない一撃",
    fx:[{ at:"finish", grp:"close", w:1.70, s:1.13 },{ at:"onTarget", k:1.12 }] },
  "獲物を待つ":     { sig:"crespo", move:"背中で外す",
    fx:[{ at:"finish", grp:"close", w:1.70, s:1.13 },{ at:"start", k:1.20 }] },
  // --- ユース限定(→docs/03 §3.57) ---
  // **数の効果を持たない札**。連携の扱いそのものを変えるので、
  // skillsOf は何も拾わない(grp も k も無い)。効き方は matchSide が見る
  "クラブユース":   { youth:true },
  // --- ロンドン・ガナーズの面々(2026-08-19) ---
  // **札の組み合わせは既にある形から採る**(→docs/03 §3.41)。
  // 層とグループごとの w/s は careertest が価値の帯で見張っているので、
  // 新しい数字を作らず、既に置かれている型を選び直す。個性は2枚目の k で出す
  "猛る門番":       { sig:"lehmann",
    fx:[{ at:"gk", k:1.10 },{ at:"pkGk", k:1.22 }] },
  // **共通スキルの形をそのまま借りない。** 固有スキルだけが価値の帯で見張られるので、
  // 共通スキル用の (w,s) を持ってくると必ず帯から外れる(s が無ければ NaN になる)。
  // **既に固有スキルで使われている (層,グループ,w,s) の組から選ぶ**こと。
  // いま使える組: counter/all s1.05 ／ counter/press w1.6 s1.1 ／ counter/tec s1.14 ／
  //   finish/close w1.7 s1.13 ／ finish/far w2 s1.07 ／ origin/cross s1.13 ／
  //   origin/passTec w1.85 s1.08 ／ origin/carry w1.55 s1.17(fresh)
  "上がる右":       { sig:"lauren",
    fx:[{ at:"counter", grp:"tec", s:1.14 },{ at:"stam", k:0.85 }] },
  "駆ける壁":       { sig:"kolotoure", move:"追いつく",
    fx:[{ at:"counter", grp:"press", w:1.60, s:1.10 },{ at:"cover", k:1.18 }] },
  "動じぬ柱":       { sig:"solcampbell",
    fx:[{ at:"counter", grp:"all", s:1.05 },{ at:"aerial", k:1.22 }] },
  "執念の寄せ":     { sig:"keown", move:"離さない",
    fx:[{ at:"counter", grp:"press", w:1.60, s:1.10 },{ at:"tough", k:1.12 }] },
  "往復する左":     { sig:"ashleycole", move:"外を駆け上がる",
    fx:[{ at:"origin", grp:"cross", s:1.13 },{ at:"stam", k:0.82 }] },
  "若い快足":       { sig:"clichy",
    fx:[{ at:"counter", grp:"all", s:1.05 },{ at:"start", k:1.18 }] },
  "背骨":           { sig:"vieira", move:"跳ね返す",
    fx:[{ at:"counter", grp:"press", w:1.60, s:1.10 },{ at:"mid", k:1.10 }] },
  "見えない箒":     { sig:"gilberto",
    fx:[{ at:"counter", grp:"all", s:1.05 },{ at:"cover", k:1.20 }] },
  "静かな配球":     { sig:"edu",
    fx:[{ at:"origin", grp:"passTec", w:1.85, s:1.08 },{ at:"vision", k:1.18 }] },
  "早熟の設計図":   { sig:"fabregas", move:"最初の一本",
    fx:[{ at:"origin", grp:"passTec", w:1.85, s:1.08 },{ at:"spDeliver", k:1.15 }] },
  "忍ぶ左":         { sig:"pires", move:"内へ滑り込む",
    fx:[{ at:"finish", grp:"close", w:1.70, s:1.13 },{ at:"recv", k:1.25 }] },
  "二列目の影":     { sig:"ljungberg", move:"背後を取る",
    fx:[{ at:"finish", grp:"far", w:2.00, s:1.07 },{ at:"start", k:1.20 }] },
  "氷の一触":       { sig:"bergkamp", move:"止めて外す",
    fx:[{ at:"origin", grp:"passTec", w:1.85, s:1.08 },{ at:"recv", k:1.28 }] },
  "内へ切れ込む":   { sig:"henry", move:"左から差す",
    fx:[{ at:"finish", grp:"close", w:1.70, s:1.13 },{ at:"onTarget", k:1.14 }] },
  "切り返しの妙":   { sig:"reyes", move:"内を突く",
    fx:[{ at:"origin", grp:"carry", w:1.55, s:1.17, when:"fresh" },{ at:"start", k:1.15 }] },
};
/**
 * 固有スキルの発動条件(→docs/03 §3.41)。**文脈が分からなければ発動しない**
 * (安全側に倒す)。条件付きの成分は、絞られるぶんだけ効果を大きく置いてある。
 */
const SK_WHEN={
  late: (p,min)=>min!=null&&min>=TUNING.skillCond.late,
  fresh:(p)=>!!p&&p.stam!=null&&p.stam>=TUNING.skillCond.fresh,
  // **盤面の状態で立つ条件**。選手が持てるのは自分のことだけなので、点差は
  // 毎ティック refreshStamina が選手に降ろしている(→docs/03 §3.50)
  lead: (p)=>!!p&&p.lead>0,
};
// **実際に立つ割合**(実測 200試合・14,880件の起点/連鎖)。
// テストがこれを掛けて「絞られたぶん強い」を検算する。条件を足したら測り直す。
const SK_WHEN_SHARE={ late:0.256, fresh:0.337, lead:0.306 };
const SK_WHEN_WHAT={ late:"残り15分だけ", fresh:"脚が残っているあいだだけ",
                     lead:"リードしているあいだだけ" };
/** 固有スキル(持ち主つき)。**抽選プールには入らない**ので skillPool は触らない。 */
const SKILLS_SIG=Object.keys(SKILL_FX).filter(n=>SKILL_FX[n].sig);
const sigSkillOf=id=>SKILLS_SIG.find(n=>SKILL_FX[n].sig===id)||null;

// --- 画面ごとの説明(HELPタブの中身 → docs/06 §6.16) ---
// **UIを説明文で埋めないための収納先**。盤面には状態だけを出し、
// 「なぜそうなるのか」「どう読むのか」は全部ここへ寄せる(card-eleven のヘルプタブに倣う)。
//
//   キー   = 画面ID(SCREENS のキー)。**ここに項目がある画面にだけタブが出る**
//   値     = 文字列、または TUNING 等を参照したい場合は文字列を返す関数
//
// 置かない画面: タイトル / 試合 / 結果 / キャリア終了。
// 試合と演出は**止めてはいけない画面**で、タイトルと結果は説明するものが無い。
const HELP={
  offer:()=>"名声で届く範囲のクラブだけが声をかけてきます。"
    +"格の高いクラブほど<b>オーナーの目標順位</b>が厳しくなります。"
    +"<br>クラブを選べるのは任期が明けたときだけです。次の"+TUNING.tenure.limit
    +"節(最大"+TUNING.tenure.hardMax+"節)をどこで過ごすかを決める場面です。",
  contract:()=>"記入した監督名がそのまま署名になります。"
    +"<br>任期は<b>"+TUNING.tenure.limit+"節</b>で、その間はこのクラブと添い遂げます。"
    +"第"+TUNING.tenure.extendAt+"節にオーナーの評価が"+TUNING.eval.extendNeed
    +"以上なら<b>"+TUNING.tenure.hardMax+"節まで</b>伸びます。"
    +"<br>シーズンごとに部の昇降格があり、DIV3から上を目指します。",
  board:()=>"オーナーと向き合う場です。"
    +"<br><b>就任のあいさつ</b>で目標順位を告げられ、<b>シーズンの総括</b>で結果と次季の目標を、"
    +"<b>第"+TUNING.tenure.extendAt+"節</b>で去就を受け取ります。"
    +"<br><br>3つの軸は役割が違います。"
    +"<br>・<b>目標順位</b> … お金。達成で一時金 +"+fmtNum(TUNING.reward.season.goalHit)
    +"（上回るほど増額）、1つ下回るごとに −"+fmtNum(TUNING.reward.season.goalMiss)+"。昇格報酬は別枠です"
    +"<br>・<b>評価</b> … 契約の長さ。格上に勝つ・昇格・優勝で上がり、格下に負ける・"
    +"カップを初戦で落とすと下がります。第"+TUNING.tenure.extendAt+"節に"
    +TUNING.eval.extendNeed+"以上で任期 +"+TUNING.tenure.extend+"節（<b>解任はありません</b>）"
    +"<br>・<b>名声</b> … 経歴。評価が上がった出来事は名声も生みます（"+TUNING.eval.fameK
    +"倍）。<b>下がる出来事では減りません</b>"
    +"<br><br>上位2クラブは昇格、下位2クラブは降格し、次のシーズンは同じクラブのまま新しい部で戦います。",
  home:"監督が持っているデバイスです。"
    +"<br><b>秘書</b>は次に何をすればよいかを教えてくれます。"
    +"<br><b>CLUB NEWS</b>はクラブの今を映します。順位表を開かなくても状況が分かります。"
    +"施設の建設状況（完成まであと何節か）もここに出ます。"
    +"<br>オーナーに呼ばれているときは、ここに<b>OWNER</b>のタイルが出ます。"
    +"<br>試合は SEASON から始めます。ここは進行の操作盤ではありません。",
  cards:()=>"集めた選手カードの一覧です。"
    +"<br>印が付くのは<b>借りている側</b>で、<span class=\"loan\">(CLUBS)</span> は"
    +"クラブからの貸与です。<b>退任するとそのクラブに残ります</b>。"
    +"印の無いカードが自分のもので、クラブを移っても連れて行けます。"
    +"<br>名前の右の<b>★</b>は強化トレーニングで覚醒した回数です（任期のあいだだけ）。"
    +"<br>右上の数字は <b>OVR</b> = 6能力の合計(最大"+OVR_MAX+")です。"
    +"<br><br><b>まとめて売る</b>を押すと、札をタップして<b>選ぶ</b>操作に変わります。"
    +"選んだぶんの合計額が足元に出て、一度の確認で売却します。"
    +"<b>編成に入っている選手・師弟・実在選手・貸与</b>は選べません。"
    +"（選んだ内容はページを送っても残ります）",
  gacha:()=>"稼いだコインで選手を探します。"+TUNING.scout.map(pk=>
      "<br>・<b>"+pk.name+"</b>（"+fmtNum(pk.cost)+"） "+pk.note).join("")
    +"<br><br>引いた選手は <b>CARDS</b> に加わり、編成で使えるようになります。"
    +"コインは試合の結果とシーズン末の順位で増えます。"
    +"<b>いつ補強に回すかは監督の判断</b>です。"
    +"<br><br><b>移籍市場</b>では、誰が来るか分かったうえで名指しで買えます。",
  // **名指しで買える唯一の場所**(→docs/03 §3.53)。値段の根拠まで書く。
  // 「スカウトより割高」は隠す理由が無い。何を買っているのかが分かるほうが選べる
  market:()=>"いま移籍を受け入れる選手が"+TUNING.market.slots+"人並びます。"
    +"能力も値段も<b>全部見えた状態で買えます</b>。"
    +"<br><b>節が変わると顔ぶれは総入れ替え</b>です。迷っているうちに居なくなります。"
    +"<br><br>値段はその選手を売ったときの<b>"+TUNING.market.k+"倍</b>です。"
    +"スカウトより割高ですが、<b>引くのではなく選んでいる</b>ぶんの差だと思ってください。"
    +"<br><b>WORLD CLASS</b> はまれに並び、桁が変わります。"
    +"<b>LEGENDS は市場に出ません</b>。",
  deck:()=>{
    const F=TUNING.fit, B=TUNING.bond;
    return "ピッチの11枠に選手を並べます。"
      +"<br>枠をタップすると入れ替える選手を選べます。一覧は<b>適性の高い順</b>で、"
      +"行をタップすると入れ替え、<b>左端の「›」</b>でその選手の詳細が開きます。"
      +"<br><b>立ち絵の右上</b>は<b>適性を掛けた実効値</b>です（素のOVRではありません）。"
      +"素のOVRは枠をタップした先の一覧と、カードの詳細で確認できます。"
      +"<br>名前の下の<b>★</b>は強化トレーニングで覚醒した回数です。"
      +"上限まで並ぶと<b>金色</b>になり、もう伸びしろが無いことを表します。"
      +"<br>選手の後ろの<b>オーラ</b>がその日の調子です。"
      +"青（不調）→ 緑（普通）→ 金（好調）→ 大きな金（絶好調）の順に良く、"
      +"<b>光っていない選手は治療中</b>で、立ち絵の左に<b>✚</b>が付きます。"
      +"休養（打ち手）で1段よくなります。"
      +"<br><b>白い線</b>は選手同士の<b>連携</b>で、太いほど噛み合っています。"
      +"試合とコミュニケーションで積み上がり、<b>編成から外しても消えません</b>（戻せば続きから）。"
      +"消えるのは任期が明けたときだけです。"
      +"<br>十分に噛み合った組は<b>コミュニケーションで覚醒</b>することがあり、"
      +"成功すると<b>金色の線</b>になってパスがさらに通りやすくなります。"
      +"<br><b>CAPTAIN</b> は腕章を巻く選手です。"
      +"キャプテンは<b>スタミナの減りが緩やか</b>になり、長くピッチに居られます。"
      +"指名しなければ総合力と経験で自動的に決まります。"
      +"<br><b>SET PIECES</b> の3枠は、PK・FK・CKを蹴る選手の指名です。"
      +"指名しなければ能力で自動選出され、その場合も実際に蹴る選手の名前が出ます。"
      +"PKは決定力と技術、FKは技術、CKは力が主に効きます。"
      +"<b>先発に居ないと蹴れない</b>ので、交代で退いた選手は自動選出に戻ります。"
      // **軸の説明はここに置く**(→docs/06 §6.37)。指名は試合中に行うが、
      // 試合画面は止めてはいけないので説明を出せない。編成を考える場所で伝える
      +"<br><br><b>KP（キープレイヤー）</b>は試合中に1人だけ指名できます。"
      +"ボールが集まり、札も出やすくなります。"
      +"かわりに<b>消耗が早く、相手のマークも厳しく</b>なります。"
      +"何度でも指名し直せますが、<b>軸を張った時間ぶんの消耗は残ります</b>。"
      +"ピッチでは<b>チームカラーに光る</b>ので、相手の軸も色で見分けられます。"
      +"<br><b>BENCH</b> の"+TUNING.squad.bench+"枠は交代要員です。ここも枠なのでタップで差し替えられ、"
      +"先発の選手を選ぶとその枠と入れ替わります。"
      +"控えは枠のポジションを持たないため適性が掛からず、<b>素のOVR</b>を出しています。"
      +"<br><br><b>枠適性</b> — その枠に合っているかで、出せる力が変わります。"
      +"<b>数字の色</b>が目減りを表し、<b>枠のポジション名の濃さ</b>も合わせて薄くなります。"
      +'<div class="fit-legend">'
      +[["a","",     "サブ一致",  F.sub],
        ["b","v-warn","メインのみ",F.main],
        ["c","v-bad", "不一致",    F.none]]
        .map(([t,v,label,r])=>'<span class="fit-chip">'
          +'<i class="pk-ovr '+v+'">'+Math.round(80*r)+'</i>'
          +'<i class="sl-pos fit-'+t+'">POS</i>'
          +label+" "+Math.round(r*100)+"%</span>").join("")
      +"</div>"
      +"上は<b>OVR 80 の選手</b>を各段の枠に置いたときの数字です。"
      +"サブポジションが一致していれば本来の力が出ます。"
      +"メインだけ合っている選手はとりあえず使えますが力を出し切れず、"
      +"どちらも違う選手はほぼ機能しません。"
      +"<br>上の総合力は<b>配置込み</b>の値です。適性で目減りした分は「適性ロス」に出ます。"
      +"<br><br><b>陣形</b> — 「陣形変更」で"+Object.keys(FORMATIONS).length+"種から選べます。"
      +"各行の数字は<b>いまの11人をその形へ並べ直したときの総合力</b>なので、"
      +"手持ちに噛み合う形を選べます。<b>選手は入れ替わりません</b>。";
  },
  // **TUNING を読むので関数にする**。素の文字列だと data.js の途中で評価され、
  // まだ TUNING が定義されていない(実際に落ちた)
  chat:()=>"クラブのグループチャットです。ここで1節の準備をすべて決めます。"
    +"<br>秘書がカップ戦のエントリー、<b>相手の見立て</b>、打ち手(強化トレーニング・コミュニケーション・休養)、"
    +"この節の予定を順に確認し、最後に「試合へ向かう」でキックオフです。"
    +"<br>見立ては<b>大会が決まったあと・打ち手の前</b>に入ります。"
    +"カップに出るかどうかで相手が変わるためで、聞いてから手を選べます。"
    +"<br>選んだ内容はいつ戻ってきても残っています。"
    +"<br><br><b>信頼</b>は選手ごとに0から積み上がります。"
    +"<b>スタメン出場で+"+TUNING.trust.startXI+"</b>、"
    +"<b>強化トレーニング</b>は成功+"+TUNING.trust.trainOk+"・大成功+"+TUNING.trust.trainGreat
    +"・失敗"+TUNING.trust.trainFail+"、"
    +"<b>コミュニケーション</b>は成功+"+TUNING.trust.bondOk+"・大成功+"+TUNING.trust.bondGreat
    +"・失敗"+TUNING.trust.bondFail+"です（コミュニケーションは2人とも動きます）。"
    +"<br><b>"+TUNING.trust.need+"</b>を超えると打ち手のあとに選手から相談が入り、"
    +"受ければ<b>師弟</b>になります。<b>選手ごとに一度きり</b>で、"
    +"結べるのは<b>"+TUNING.trust.max+"人まで</b>です。"
    +"<br>師弟になった選手は<b>覚醒の★と伸びた能力、師弟どうしの連携を持ったまま"
    +"次の任期へ付いてきます</b>。",
  season:()=>{
    return "任期"+TUNING.tenure.limit+"節のカレンダーです。上から下へ進みます。"
      +"<br>1つの節は<b>打ち手 → 大会 → 試合</b>の順に決めます。打ち手を選ぶまで試合には進めません。"
      +"<br><b>任期の記録</b>は打った手とその結果です。クラブを移っても1本で続きます。"
      +"<br>右端の<b>契約</b>でクラブと評価、<b>日程</b>で<b>大会の一覧と参加条件</b>を開けます。"
      +"<br><br>リーグの日程は節に固定されていません。<b>リーグを選んだ節に次の1試合</b>を消化します。"
      +"<br><b>カップ戦は"+CUPS.length+"種類</b>あり、それぞれ<b>決まった倍数の節</b>に開催されます。"
      +"出場条件は<b>熟練度・所属する部・カップ優勝の数・DIV1でのリーグ優勝</b>のいずれかで、"
      +"上の大会ほど相手が強く、賞金と名声も大きくなります。"
      +"<br>勝ち抜けば賞金と名声が入り、<b>その大会の初優勝はトロフィー</b>になります。"
      +"<br>カップに出た節は<b>リーグの日程が進みません</b>。負けると次の開催でまた1回戦からです。"
      +"<br><b>開催日が重なった節は、どの大会に出るかを選べます</b>（見送ることもできます）。"
      +"<br><b>大会を終えると次のエントリーまで"+TUNING.cup.rest+"節あきます</b>。"
      +"すべての大会に出られる任期にはならないので、<b>どれに出るかを選びます</b>。"
      +"<br><br>第"+TUNING.tenure.extendAt+"節に<b>オーナーが去就を告げます</b>。ここで任期が"+TUNING.tenure.hardMax+"節まで伸びるかどうかが決まります。"
      +"<br>上限に達しても<b>進行中の大会は最後まで戦い</b>、決着した時点で任期が明けます。";
  },
  foe:"対戦相手の下見です。<b>この11人がそのまま出てきます</b>。"
    +"<br>選手をタップすると能力が見られます。編成は変えられません。"
    +"<br>監督の指名(CAP・セットプレー)は相手も自動選出で、あなたが指名しなかったときと同じ決まり方です。"
    +"<br>連携は出しません。相手の連携は覗けるものではなく、覗けても打てる手がないためです。",
  schedule:"参照用の日程表です。ここからは試合を始められません。"
    +"<br>リーグの日程は節に固定していません。カップ戦が割り込むためで、"
    +"リーグを選んだ節に次の1試合を消化します。"
    +"<br><b>相手の行をタップすると編成を下見できます</b>。カップは組み合わせ表の枠から開けます。",
  standings:()=>"リーグの順位表です。<b>クラブの行をタップすると編成を下見できます</b>。"
    +"<br>左端の色帯が<b>昇格圏（上位"+TUNING.world.promote+"）と降格圏（下位"
    +TUNING.world.relegate+"）</b>です。"
    +"<br><b>オーナーの目標順位</b>はクラブの格と、就任時に持ち込んだ編成の強さから決まります。"
    +"シーズン末に目標以上ならボーナス、届かなければ減俸です。",
  clubhouse:()=>"監督個人の資産と、クラブの施設を置く場所です。名声とトロフィーはクラブを移っても失われません。"
    +"<br><b>師弟</b>を結んだ選手（最大"+TUNING.trust.max+"人）は、任期が明けても"
    +"覚醒の★と連携を持ったまま付いてきます（→クラブチャットの説明）。"
    +"<br><b>名声</b>が次にどのクラブから声がかかるかを決めます。"
    +"格上に勝つ・昇格する・タイトルを獲ると増えます。"
    +"減るのは<b>スポンサーの課題を落としたとき</b>だけです。"
    +"カップは勝ち上がった順位ぶんが完了節に入ります。"
    +"<br><br><b>スポンサー</b>は契約中のクラブの支援先です（"+TUNING.spon.term+"節前後で入れ替わります）。"
    +"<b>期限つきの課題</b>を出してきて、達成すればコインやスカウトが届きます。"
    +"最上位の契約だけが <b>LEGENDS</b> を連れてきます。"
    +"落とすと<b>名声が下がります</b>。契約中は打ち手に<b>4つ目</b>が増え、"
    +"決まった能力だけを<b>大成功しやすい状態で</b>伸ばせます。"
    +"<br><br><b>TROPHIES</b> は実績の棚です。"
    +"<b>カップ"+CUPS.length+"種と、各リーグ各部の制覇</b>が並び、"
    +"まだ獲っていないものも鍵つきで置いてあります。"
    +"同じ実績を重ねて獲ると<b>回数</b>だけ増え、初めて獲った季は残ります。"
    +"<br><br><b>CLUB FACILITIES</b> は<b>クラブの資産</b>で、退任すると置いていきます。"
    +"就任したクラブのレベルは<b>前任者の遺産</b>です。"
    +"<br>投資した節には効果が出ず、完成まで<b>"+TUNING.fac.nodes[0]+"〜"
    +TUNING.fac.nodes[TUNING.fac.maxLv-1]+"節</b>かかります。"
    +"<b>同時に建てられるのは1つだけ</b>なので、何を先に建てるかが判断になります。"
    +"<br>コインはパックとも取り合いになります。"
    +"<b>今を取る（即戦力）か、先を取る（施設）か</b>です。",
  gallery:"各レアリティの見本です。<b>所持カードではありません</b>。タップで詳細が開きます。"
    +"<br>WORLD CLASS はプロスカウトからまれに出ます。"
    +"LEGENDS は実在選手をモチーフにする段のためパックからは出ず、"
    +"トロフィーや実績など別の経路で配ります。",
  secretary:"秘書からの連絡です。**溜まっていく連絡**で、クラブチャット（1節の準備）とは別物です。"
    +"<br>HOME の秘書のひとことは<b>ここの最新</b>を映していて、"
    +"<b>未読があると数が付きます</b>。開いた時点で既読になります。"
    +"<br>引換券などが添えられている連絡は<b>受け取る</b>を押すと手に入ります（一度きり）。"
    +"引換券はスカウトの画面で使えます。",
  gacha:"コインで選手を招く画面です。"
    +"<br><b>引換券</b>を持っているときは一番上に並びます。"
    +"<b>コインは減りません</b>。LEGENDS の券は、まだ持っていない選手から招きます。",
  market:"能力と値段を見てから買える画面です。"
    +"<br>スカウトが<b>引く</b>場所なのに対して、ここは<b>選ぶ</b>場所です。"
    +"そのぶん割高で、<b>節が変われば居なくなります</b>。",
};
/** 画面の説明を取り出す(関数で書かれていれば呼ぶ)。無ければ null。 */
function helpFor(id){
  const h=HELP[id];
  return h==null?null:(typeof h==="function"?h():h);
}

// --- 国籍(実在の16か国 → docs/03 §3.15) ---
// **クラブの所属リーグとは別物**。選手はどのリーグのクラブにも他国から集まる。
// 実在選手カード(WORLD CLASS/LEGENDS)との国籍シナジーを載せる土台でもある。
const NATIONS=[
  { id:"eng",  name:"イングランド",      abbr:"ENG" },
  { id:"esp",  name:"スペイン",        abbr:"ESP" },
  { id:"ita",  name:"イタリア",        abbr:"ITA" },
  { id:"fra",  name:"フランス",        abbr:"FRA" },
  { id:"ger",  name:"ドイツ",         abbr:"GER" },
  { id:"por",  name:"ポルトガル",       abbr:"POR" },
  { id:"ned",  name:"オランダ",        abbr:"NED" },
  { id:"bel",  name:"ベルギー",        abbr:"BEL" },
  { id:"cro",  name:"クロアチア",       abbr:"CRO" },
  { id:"den",  name:"デンマーク",       abbr:"DEN" },
  { id:"pol",  name:"ポーランド",       abbr:"POL" },
  { id:"bra",  name:"ブラジル",        abbr:"BRA" },
  { id:"arg",  name:"アルゼンチン",      abbr:"ARG" },
  { id:"uru",  name:"ウルグアイ",       abbr:"URU" },
  { id:"sen",  name:"セネガル",        abbr:"SEN" },
  { id:"nga",  name:"ナイジェリア",      abbr:"NGA" },
  // order:"east" = 姓→名の並び。省略時は "west"(名→姓)。
  // 名の形式も国籍ごとに変わる(西欧はイニシャル1文字、日本は漢字の名)。
  { id:"jpn",  name:"日本",           abbr:"JPN", order:"east" },
];
const nationById=id=>NATIONS.find(n=>n.id===id);
const NATION_IDS=NATIONS.map(n=>n.id);

// --- フォーメーション(card-eleven から踏襲 → docs/03 §3.16) ---
// 各枠は [細分ポジション, ピッチ上の位置(%)]。DECK画面の配置と枠適性の判定に使う。
// **y は 13〜87 に収める**。87を超えると名前帯がゴールラインの外へ出る
// (card-eleven とはピッチの縦横比が違うので、座標をそのままは使えない)。
const FORMATIONS={
  // **2トップは斜めに置く**。真縦に重ねると 4-4-1-1 に見えてしまう。
  // 左右の幅は 5-3-2 の2トップ(38/62)に合わせ、ST を一枚引いた位置に落とす
  "4-4-2":[["GK",50,87],["LSB",18,72],["CB",38,73],["CB",62,73],["RSB",82,72],["LMF",16,48],["CMF",38,50],
           ["CMF",62,50],["RMF",84,48],["ST",38,24],["CF",62,14]],
  "4-3-3":[["GK",50,87],["LSB",18,72],["CB",38,73],["CB",62,73],["RSB",82,72],["CMF",30,48],["DMF",50,58],
           ["CMF",70,48],["LWG",18,15],["CF",50,13],["RWG",82,15]],
  // 4-4-2 と同じ理由で斜めに(→上)。真縦だと 3-5-1-1 に見える
  "3-5-2":[["GK",50,87],["CB",26,73],["CB",50,74],["CB",74,73],["LMF",12,48],["CMF",30,47],["DMF",50,58],
           ["CMF",70,47],["RMF",88,48],["ST",38,24],["CF",62,14]],
  "5-3-2":[["GK",50,87],["LSB",10,69],["CB",30,73],["CB",50,71],["CB",70,73],["RSB",90,69],["CMF",30,48],
           ["DMF",50,58],["CMF",70,48],["CF",38,18],["CF",62,18]],
  "4-3-1-2":[["GK",50,87],["LSB",18,72],["CB",38,73],["CB",62,73],["RSB",82,72],["CMF",28,50],["DMF",50,58],
             ["CMF",72,50],["OMF",50,37],["CF",38,18],["CF",62,18]],
  "4-2-3-1":[["GK",50,87],["LSB",18,72],["CB",38,73],["CB",62,73],["RSB",82,72],["DMF",38,58],["DMF",62,58],
             ["LWG",18,29],["OMF",50,37],["RWG",82,29],["CF",50,15]],
  "5-4-1":[["GK",50,87],["LSB",10,69],["CB",30,73],["CB",50,71],["CB",70,73],["RSB",90,69],["LMF",16,50],
           ["CMF",38,51],["CMF",62,51],["RMF",84,50],["CF",50,20]],
  "3-4-3":[["GK",50,87],["CB",26,73],["CB",50,71],["CB",74,73],["LMF",14,50],["CMF",38,53],["CMF",62,53],
           ["RMF",86,50],["LWG",18,16],["CF",50,13],["RWG",82,16]],
  "4-1-4-1":[["GK",50,87],["LSB",18,72],["CB",38,73],["CB",62,73],["RSB",82,72],["DMF",50,60],["LMF",16,45],
             ["CMF",38,43],["CMF",62,43],["RMF",84,45],["CF",50,18]],
  "4-3-2-1":[["GK",50,87],["LSB",18,72],["CB",38,73],["CB",62,73],["RSB",82,72],["CMF",30,50],["DMF",50,58],
             ["CMF",70,50],["OMF",38,32],["OMF",62,32],["CF",50,14]],
  "4-4-2ダイヤ":[["GK",50,87],["LSB",16,72],["CB",38,73],["CB",62,73],["RSB",84,72],["DMF",50,60],["CMF",30,48],
              ["CMF",70,48],["OMF",50,35],["ST",38,20],["CF",62,16]],
  "4-2-2-2":[["GK",50,87],["LSB",16,72],["CB",38,73],["CB",62,73],["RSB",84,72],["DMF",36,58],["DMF",64,58],
             ["OMF",30,36],["OMF",70,36],["ST",38,19],["CF",62,16]],
  "ゼロトップ":[["GK",50,87],["LSB",18,72],["CB",38,73],["CB",62,73],["RSB",82,72],["CMF",30,49],["DMF",50,59],
           ["CMF",70,49],["LWG",16,18],["OMF",50,29],["RWG",84,18]],
  "4-3-3アシメ":[["GK",50,87],["LSB",18,72],["CB",38,73],["CB",62,73],["RSB",82,72],["DMF",50,58],["LMF",30,45],
              ["CMF",66,45],["LWG",16,25],["CF",46,14],["RWG",86,15]],
  "4-2-4":[["GK",50,87],["LSB",16,72],["CB",38,73],["CB",62,73],["RSB",84,72],["CMF",36,52],["CMF",64,52],
           ["LWG",12,22],["RWG",88,22],["ST",40,15],["CF",60,13]],
  "9.5番":[["GK",50,87],["LSB",18,72],["CB",38,73],["CB",62,73],["RSB",82,72],["DMF",36,59],["DMF",64,59],
          ["LMF",20,42],["RMF",80,42],["OMF",50,33],["CF",50,20]],
};
const DEFAULT_FORM="4-4-2";

// --- 起点のチャンネル(サブポジごとに3種 → docs/07 §7.7) ---
// **その選手が攻撃を起こすために何をするか**。サブポジションで持ち札が変わる。
//
// ⚠ ここに置くのは**自分から仕掛ける動き**だけ。「クロスに合わせる」「引いて受ける」
//   のような**受け手のアクションは置かない**(それは連鎖の中で起きること → §7.10)。
//   前線の選手なら「前線からのプレスで奪う」「裏へ走り出す」「こぼれ球に詰める」が起点にあたる。
//   stat … 成否を決める能力。**この能力が高いほど選ばれやすく、成功もしやすい**
//   risk … 成功のしやすさ(**相対値**)。安全な選択ほど高く、一発を狙うほど低い。
//          絶対の水準は TUNING.atk.originK で一括調整する
//   gain … 成功したときに稼ぐ前進(0〜1)。**残りの距離に対する割合**。低リスクは小さい
//   to   … あれば「**最低ここまで届く**」高さ(0〜1)。ロングフィードやクロスのように、
//          自陣から出しても一気に前線へ送る手に付ける(割合計算だと頭打ちになるため)
//   kind … pass  … ボールが**他の選手**へ渡る
//          carry … ドリブル/キープ。**自分がそのまま次の起点**になる
//          shot  … その場でシュートまで行く(連鎖はここで終わる)
//   lane … ボールが運ばれる左右(→docs/07 §7.9)
//          same=そのレーン / in=中央へ / out=サイドへ / switch=逆サイド /
//          box=ペナルティエリア中央 / any=散らす(ばらつきが大きい)
// risk と gain はトレードオフに置く。安全に繋ぐか、失っても一気に行くかが選手の個性になる。
// **どのサブポジも pass を1枚以上持つ**(→docs/07 §7.8)。前線(OMF/CF/ST)が
// carry と shot だけだった頃は、**前線に入った球がそこから味方に渡らなかった**
// (CFは1試合に9.14回受けてパス0本)。スキル「ポストプレー」が捌く先を持たない、
// という食い違いも起きていた。
const ORIGINS={
  GK: [{id:"gkLong",  label:"ロングキック",   stat:"pow", risk:0.40, gain:0.55, to:0.60, kind:"pass",  lane:"any"},
       {id:"gkQuick", label:"速攻のスロー",   stat:"spd", risk:0.66, gain:0.30, kind:"pass",  lane:"out"},
       {id:"gkShort", label:"短い繋ぎ",       stat:"tec", risk:0.80, gain:0.08, kind:"pass",  lane:"same"}],
  CB: [{id:"cbCarry", label:"持ち上がり",     stat:"spd", risk:0.62, gain:0.28, kind:"carry", lane:"same"},
       {id:"cbVert",  label:"縦パス",         stat:"tec", risk:0.58, gain:0.38, kind:"pass",  lane:"same"},
       {id:"cbFeed",  label:"ロングフィード", stat:"pow", risk:0.38, gain:0.60, to:0.76, kind:"pass",  lane:"any"}],
  LSB:[{id:"sbOver",  label:"オーバーラップ", stat:"spd", risk:0.66, gain:0.48, kind:"carry", lane:"out"},
       {id:"sbInner", label:"インナーラップ", stat:"tec", risk:0.64, gain:0.42, kind:"carry", lane:"in"},
       {id:"sbEarly", label:"早いクロス",     stat:"pow", risk:0.44, gain:0.55, to:0.88, kind:"pass",  lane:"box"}],
  RSB:[{id:"sbOver",  label:"オーバーラップ", stat:"spd", risk:0.66, gain:0.48, kind:"carry", lane:"out"},
       {id:"sbInner", label:"インナーラップ", stat:"tec", risk:0.64, gain:0.42, kind:"carry", lane:"in"},
       {id:"sbEarly", label:"早いクロス",     stat:"pow", risk:0.44, gain:0.55, to:0.88, kind:"pass",  lane:"box"}],
  DMF:[{id:"dmSpray", label:"散らし",         stat:"tec", risk:0.78, gain:0.15, kind:"pass",  lane:"any"},
       {id:"dmDrive", label:"持ち出し",       stat:"spd", risk:0.68, gain:0.35, kind:"carry", lane:"same"},
       {id:"dmSwitch",label:"サイドチェンジ", stat:"pow", risk:0.52, gain:0.40, kind:"pass",  lane:"switch"}],
  CMF:[{id:"cmThru",  label:"スルーパス",     stat:"tec", risk:0.50, gain:0.55, to:0.82, kind:"pass",  lane:"same"},
       {id:"cmCarry", label:"持ち出し",       stat:"spd", risk:0.62, gain:0.35, kind:"carry", lane:"same"},
       {id:"cmOpen",  label:"展開",           stat:"pow", risk:0.72, gain:0.22, kind:"pass",  lane:"out"}],
  OMF:[{id:"omLast",  label:"ラストパス",     stat:"tec", risk:0.48, gain:0.58, to:0.90, kind:"pass",  lane:"box"},
       {id:"omTurn",  label:"反転ドリブル",   stat:"spd", risk:0.52, gain:0.50, kind:"carry", lane:"in"},
       // **pow にする**(→docs/03 §3.37)。3枚が tec/spd/atk だと、OMF だけ pow の出番が無く
       // パワー型の選手が置き所を失う。ミドルは威力の手なので pow が素直
       {id:"omMid",   label:"ミドルシュート",   stat:"pow", risk:0.44, gain:0.62, kind:"shot",  lane:"same"}],
  LMF:[{id:"wmUp",    label:"サイドの駆け上がり", stat:"spd", risk:0.62, gain:0.46, kind:"carry", lane:"out"},
       {id:"wmIn",    label:"絞り込み",       stat:"tec", risk:0.70, gain:0.46, kind:"carry", lane:"in"},
       {id:"wmCross", label:"クロス",         stat:"pow", risk:0.46, gain:0.55, to:0.90, kind:"pass",  lane:"box"}],
  RMF:[{id:"wmUp",    label:"サイドの駆け上がり", stat:"spd", risk:0.62, gain:0.46, kind:"carry", lane:"out"},
       {id:"wmIn",    label:"絞り込み",       stat:"tec", risk:0.70, gain:0.46, kind:"carry", lane:"in"},
       {id:"wmCross", label:"クロス",         stat:"pow", risk:0.46, gain:0.55, to:0.90, kind:"pass",  lane:"box"}],
  // **CF も pow を持たせる**(→docs/03 §3.37)。def 起点は「CFの3番目に大事な能力が守備」
  // という妙な評価を作っていた(実測: CF の def が spd/pow より価値が高かった)
  //
  // **CFの3枚を組み替えた**(2026-08-11)。決定機の質(→docs/07 §7.21)を入れたら、
  // **パス札の能力がそのままチームの得点に効く**ようになった。CF のパス札は
  // 「落とし」1枚だけで、それが TEC だったので、CF は TEC に尖ったときだけ点が伸びた
  // (実測 パワー1.02 / テク1.26 / スピード1.10)。
  //   落とし        … 背負って収め、身体を張って預ける手なので **POW** が筋
  //   前線からのプレス … pow が空いたので **くさびを収める(TEC)** に置き換えた
  //                     (3枚は別々の能力、という決まりがある → careertest)
  // これで パワー1.19 / テク1.06 / スピード1.10。
  // **ST は変えない** — あちらはダイレクトシュートで POW の出口があり、
  // 同じことをすると今度は POW に偏る(実測 1.33倍)。
  CF: [{id:"cfPress",label:"くさびを収める",  stat:"tec", risk:0.52, gain:0.55, kind:"carry", lane:"same"},
       {id:"cfDrop", label:"落とし",         stat:"pow", risk:0.80, gain:0.10, kind:"pass",  lane:"same"},
       {id:"cfRun",   label:"裏抜け",     stat:"spd", risk:0.42, gain:0.62, kind:"carry", lane:"same"}],
  ST: [{id:"stBehind",label:"背後への抜け出し", stat:"spd", risk:0.44, gain:0.60, kind:"carry", lane:"same"},
       {id:"stHold",  label:"収めて預ける",   stat:"tec", risk:0.74, gain:0.14, kind:"pass",  lane:"same"},
       {id:"stStrike",label:"ダイレクトシュート",   stat:"pow", risk:0.40, gain:0.66, kind:"shot",  lane:"same"}],
  LWG:[{id:"wgLine",  label:"縦の突破",       stat:"spd", risk:0.52, gain:0.50, kind:"carry", lane:"out"},
       {id:"wgCut",   label:"カットイン",     stat:"tec", risk:0.56, gain:0.46, kind:"carry", lane:"in"},
       {id:"wgCross", label:"早いクロス",     stat:"pow", risk:0.55, gain:0.54, to:0.90, kind:"pass",  lane:"box"}],
  RWG:[{id:"wgLine",  label:"縦の突破",       stat:"spd", risk:0.52, gain:0.50, kind:"carry", lane:"out"},
       {id:"wgCut",   label:"カットイン",     stat:"tec", risk:0.56, gain:0.46, kind:"carry", lane:"in"},
       {id:"wgCross", label:"早いクロス",     stat:"pow", risk:0.55, gain:0.54, to:0.90, kind:"pass",  lane:"box"}],
};

// --- 守備のチャンネル(サブポジごとに3種 → docs/07 §7.12) ---
// **相手が仕掛けてきたときに、その選手が何をするか**。攻撃側と対の構造にしてある。
//   stat … def と混ぜる能力。**この能力が高いほど選ばれやすく、止めやすい**
//   k    … 守備力の係数。思い切った手ほど強いが、そのぶんファウルになりやすい
//   foul … 止めたときにファウルになる率。**アクションが反則の重さを決める**
//          (以前は一律だったので、削っても間合いを取っても同じ確率だった)
const COUNTERS={
  GK: [{id:"gkOut",  label:"飛び出し",       stat:"spd", k:1.02, foul:0.40},
       {id:"gkLine", label:"高い位置取り", stat:"tec", k:0.94, foul:0.10},
       {id:"gkStand",label:"正面の構え",   stat:"pow", k:1.00, foul:0.22}],
  CB: [{id:"cbBody", label:"体当たり",     stat:"pow", k:1.02, foul:0.34},
       {id:"cbRead", label:"インターセプト", stat:"tec", k:0.96, foul:0.08},
       {id:"cbSlide",label:"スライディング", stat:"spd", k:1.08, foul:0.46}],
  LSB:[{id:"sbStay", label:"並走",stat:"spd",k:0.95, foul:0.12},
       {id:"sbLine", label:"縦切り",       stat:"tec", k:0.98, foul:0.16},
       {id:"sbStop", label:"押し出し",     stat:"pow", k:1.04, foul:0.40}],
  RSB:[{id:"sbStay", label:"並走",stat:"spd",k:0.95, foul:0.12},
       {id:"sbLine", label:"縦切り",       stat:"tec", k:0.98, foul:0.16},
       {id:"sbStop", label:"押し出し",     stat:"pow", k:1.04, foul:0.40}],
  DMF:[{id:"dmCrush",label:"潰し",     stat:"pow", k:1.06, foul:0.48},
       {id:"dmRead", label:"先読み",     stat:"tec", k:0.97, foul:0.10},
       {id:"dmBlock",label:"進路封鎖",     stat:"sta", k:1.00, foul:0.22}],
  CMF:[{id:"cmClose",label:"寄せ",         stat:"spd", k:0.98, foul:0.24},
       {id:"cmHook", label:"引っ掛け",     stat:"tec", k:1.00, foul:0.44},
       {id:"cmChase",label:"粘りの追走",   stat:"sta", k:0.94, foul:0.16}],
  OMF:[{id:"omPress",label:"軽い寄せ",     stat:"spd", k:0.92, foul:0.18},
       {id:"omDelay",label:"遅らせ",       stat:"tec", k:0.90, foul:0.12},
       {id:"omHold", label:"腕での牽制",stat:"pow",k:0.98, foul:0.55}],
  LMF:[{id:"wmSand", label:"挟み込み",       stat:"spd", k:0.98, foul:0.28},
       {id:"wmIn",   label:"絞り",     stat:"tec", k:0.96, foul:0.14},
       {id:"wmBody", label:"体寄せ",     stat:"pow", k:1.00, foul:0.38}],
  RMF:[{id:"wmSand", label:"挟み込み",       stat:"spd", k:0.98, foul:0.28},
       {id:"wmIn",   label:"絞り",     stat:"tec", k:0.96, foul:0.14},
       {id:"wmBody", label:"体寄せ",     stat:"pow", k:1.00, foul:0.38}],
  CF: [{id:"cfChase",label:"前からの追走",     stat:"spd", k:0.88, foul:0.20},
       {id:"cfCut",  label:"パスコース切り",stat:"tec",k:0.86, foul:0.08},
       {id:"cfHack", label:"削り",     stat:"pow", k:0.94, foul:0.58}],
  ST: [{id:"stBack", label:"戻りの牽制",     stat:"sta", k:0.84, foul:0.14},
       {id:"stStand",label:"コース取り",   stat:"tec", k:0.86, foul:0.10},
       {id:"stSteal",label:"強引な奪取",stat:"spd",k:0.92, foul:0.55}],
  LWG:[{id:"wgHerd", label:"追い込み",       stat:"spd", k:0.90, foul:0.20},
       {id:"wgCut",  label:"コース消し",   stat:"tec", k:0.88, foul:0.10},
       {id:"wgHook", label:"引っ掛け",     stat:"pow", k:0.94, foul:0.50}],
  RWG:[{id:"wgHerd", label:"追い込み",       stat:"spd", k:0.90, foul:0.20},
       {id:"wgCut",  label:"コース消し",   stat:"tec", k:0.88, foul:0.10},
       {id:"wgHook", label:"引っ掛け",     stat:"pow", k:0.94, foul:0.50}],
};

// --- 終点のチャンネル(サブポジごとに3種 → docs/07 §7.13) ---
// **どう撃つか**。起点・守備と同じ構造で、サブポジションごとに持ち札が変わる。
// これが無かった頃はシュートが1種類しかなく、「ヘディングで押し込む」も
// 「GKと一対一」も「30mのミドル」も、まったく同じ計算になっていた。
//   stat … atk と混ぜる能力。**この能力が高いほど選ばれやすく、決まりやすい**
//   k    … シュートの威力(GKとの勝負に掛かる)
//   acc  … 枠に飛ぶ率の倍率。振り抜くほど外れやすい
//   blk  … ブロックのされにくさ。**大きいほど当たらない**(コースを狙う手ほど大きい)
//   minH … この高さより手前では選べない(ヘディングや流し込みは近くでしか撃てない)
const FINISHES={
  GK: [{id:"gkLob",  label:"ロングシュート", stat:"pow", k:0.85, acc:0.80, blk:1.20},
       {id:"gkPlace",label:"コース狙い",   stat:"tec", k:0.86, acc:1.08, blk:1.00},
       {id:"gkRush", label:"走り込み",     stat:"spd", k:0.95, acc:0.92, blk:0.95}],
  CB: [{id:"cbHead", label:"ヘディング",   stat:"pow", k:1.06, acc:0.90, blk:1.08, minH:0.82},
       {id:"cbLoose",label:"こぼれ球の一撃", stat:"spd", k:0.95, acc:0.95, blk:1.00},
       {id:"cbLong", label:"強引な一撃", stat:"tec", k:0.90, acc:0.88, blk:1.10}],
  LSB:[{id:"sbRun",  label:"走り込みの合わせ",stat:"spd",k:1.00, acc:1.00, blk:0.95, minH:0.78},
       {id:"sbFar",  label:"ファーへの流し込み",stat:"tec", k:0.95, acc:1.10, blk:1.05},
       {id:"sbHit",  label:"強引な一撃", stat:"pow", k:1.02, acc:0.82, blk:1.05}],
  RSB:[{id:"sbRun",  label:"走り込みの合わせ",stat:"spd",k:1.00, acc:1.00, blk:0.95, minH:0.78},
       {id:"sbFar",  label:"ファーへの流し込み",stat:"tec", k:0.95, acc:1.10, blk:1.05},
       {id:"sbHit",  label:"強引な一撃", stat:"pow", k:1.02, acc:0.82, blk:1.05}],
  DMF:[{id:"dmMid",  label:"ミドルシュート", stat:"pow", k:1.05, acc:0.80, blk:1.15},
       {id:"dmPlace",label:"コース狙い",   stat:"tec", k:0.95, acc:1.08, blk:1.00},
       {id:"dmLoose",label:"こぼれ球狙い", stat:"spd", k:0.95, acc:1.00, blk:0.90}],
  CMF:[{id:"cmMid",  label:"ミドルシュート", stat:"pow", k:1.05, acc:0.82, blk:1.15},
       {id:"cmSlot", label:"流し込み",       stat:"tec", k:0.96, acc:1.12, blk:1.00, minH:0.72},
       {id:"cmRun",  label:"走り込み", stat:"spd", k:1.00, acc:0.98, blk:0.92}],
  OMF:[{id:"omKnuck",label:"無回転ミドル",   stat:"pow", k:1.10, acc:0.78, blk:1.20},
       {id:"omPlace",label:"コース狙い",   stat:"tec", k:0.96, acc:1.10, blk:1.00},
       {id:"omDrib", label:"ドリブルシュート",stat:"spd",k:1.00, acc:1.00, blk:0.98}],
  LMF:[{id:"wmCurl", label:"巻いたシュート",     stat:"tec", k:1.02, acc:1.06, blk:1.05},
       {id:"wmNear", label:"ニアへの一撃", stat:"pow", k:1.08, acc:0.85, blk:1.00},
       {id:"wmDive", label:"飛び込みヘッド",stat:"spd",k:1.00,acc:1.00, blk:0.92, minH:0.80}],
  RMF:[{id:"wmCurl", label:"巻いたシュート",     stat:"tec", k:1.02, acc:1.06, blk:1.05},
       {id:"wmNear", label:"ニアへの一撃", stat:"pow", k:1.08, acc:0.85, blk:1.00},
       {id:"wmDive", label:"飛び込みヘッド",stat:"spd",k:1.00,acc:1.00, blk:0.92, minH:0.80}],
  CF: [{id:"cfTurn", label:"反転シュート",   stat:"tec", k:1.05, acc:1.02, blk:1.00},
       {id:"cfPush", label:"押し込み",       stat:"pow", k:1.12, acc:1.05, blk:0.85, minH:0.84},
       {id:"cfThru", label:"裏からの流し込み",stat:"spd",k:1.04,acc:1.08, blk:1.05, minH:0.74}],
  ST: [{id:"stOne",  label:"ワンタッチシュート",stat:"tec",k:1.06, acc:1.04, blk:0.95, minH:0.78},
       {id:"stHit",  label:"叩きつけ",       stat:"pow", k:1.14, acc:0.92, blk:1.00},
       {id:"stSolo", label:"GKとの一対一",   stat:"spd", k:1.06, acc:1.06, blk:1.10, minH:0.80}],
  LWG:[{id:"wgCurl", label:"カットインシュート",stat:"tec",k:1.06, acc:1.04, blk:1.00},
       {id:"wgNear", label:"ニア狙い",     stat:"pow", k:1.08, acc:0.94, blk:1.00},
       {id:"wgSpeed",label:"振り切りシュート", stat:"spd", k:1.02, acc:0.98, blk:0.98}],
  RWG:[{id:"wgCurl", label:"カットインシュート",stat:"tec",k:1.06, acc:1.04, blk:1.00},
       {id:"wgNear", label:"ニア狙い",     stat:"pow", k:1.08, acc:0.94, blk:1.00},
       {id:"wgSpeed",label:"振り切りシュート", stat:"spd", k:1.02, acc:0.98, blk:0.98}],
};
// セットプレーの終点(→§7.11)。位置も状況も決まっているので、抽選せず固定で引く。
//   fixAcc … 枠に飛ぶ率そのもの(通常の技術×距離の式を使わない)
//   noBlk  … 壁もブロックも無い
const SET_FINISH={
  // k は**PK戦の決定率で決める**(→docs/08 §8.6)。実測 2.50 で 73%(現実は約75%)。
  // 1.62 の頃は母集団で 44% しかなく、psotest が1人のGKしか見ていなかったため隠れていた
  pk: {id:"pk", label:"ペナルティキック", stat:"tec", w:0.70, k:2.50, fixAcc:0.86, noBlk:true},
  fk: {id:"fk", label:"直接フリーキック", stat:"tec", w:0.50, k:1.15, acc:1.00, blk:1.00, tecAcc:true},
  hdr:{id:"hdr",label:"ヘディング",       stat:"pow", w:0.40, k:1.00, fixAcc:0.50, blk:1.00},
};

/**
 * 施設(→docs/03 §3.5)。**クラブの資産**なので、退任時は置いていく。
 * 就任したクラブのレベルは**前任者の遺産**で、国の格によって水準が変わる。
 *
 * **1度に建てられるのは1つだけ。** これが「全施設最大」を構造で止める
 * (0→5 に 40節かかるので、96節では2つ上げるのが限界)。
 */
const FACILITIES=[
  { id:"training", label:"練習場",     note:"強化トレーニングの経験点が増える" },
  { id:"medical",  label:"医療施設",   note:"ケガをしにくく、治りが早い" },
  { id:"stadium",  label:"スタジアム", note:"観客収入が増える" },
  { id:"scouting", label:"スカウト網", note:"パックで良い段が出やすい" },
  // **1段でも建っていれば機能する**(→docs/03 §3.57)。段が上がるほど上がってくる段が良くなる
  { id:"youth",    label:"ユース組織", note:"任期の中ほどに下部組織から新人が上がる" },
];
const facById=id=>FACILITIES.find(f=>f.id===id);

// --- カップ戦(→docs/03 §3.23) ---
// **参加条件を満たした節にだけ出られる大会**。リーグ戦と同じ「1節=1試合」の枠を使う。
//   fame     … 順位ごとの名声(→docs/03 §3.9)。**賞金と同じく完了節に入る**。
//              カップを攻略する意味を「次にどのクラブへ行けるか」に繋げる
//   every    … この倍数の節に開催する(任期の節で数える)
//   needExp  … 参加に必要なチーム熟練度
//   rounds   … 勝ち抜く回数。1節につき1回戦だけ進む
//   bias     … 相手の強さ(自クラブの水準に対する上乗せ)
//   elite    … 全員 SPECIALS の強豪が現れる確率
//   prize    … 賞金。**決勝からの距離**で引く(0=優勝 / 1=準優勝 / 2=ベスト4 …)
//              **大会が完了した節にまとめて入金する**(順位が決まった時点では払わない)
// 大会(→docs/03 §3.23)。**開く順に並べる**(上ほど早く出られる)。
//   every    … 何節おきに開くか
//   needExp  … チーム熟練度の条件
//   needDiv  … その部以上でないと出られない(1 = DIV1 のみ)
//   needCups … **優勝したカップの種類数**の条件
//   needLg1  … DIV1 でリーグ優勝した経験が要る
//   rounds   … 回戦数。2^rounds クラブの表を作る(5回戦 = 32クラブ)
//   plan     … 相手の編成の内訳(d3 / d2 / d1 / mix32 / rand / best)
//   bias     … 相手のOVRの下駄。回戦が上がるとさらに +1 ずつ
//   elite    … 1枠だけ現れる「★ 強豪」の確率
const CUPS=[
  { id:"pre", name:"プレシーズンカップ", every:6, needExp:0, rounds:3, plan:"d3",
    prize:[1800,700,350,180], fame:[120,40,15,5],
    bias:-2, elite:0.02, trophy:"プレシーズンカップ 優勝",
    note:"条件なしで出られる腕試し。各国の DIV3 が集まる" },
  { id:"kings", name:"キングズクラブカップ", every:7, needExp:1000, rounds:3, plan:"d3",
    prize:[3000,1200,600,300], fame:[300,100,40,10],
    bias:2, elite:0.04, trophy:"キングズクラブカップ 優勝",
    note:"常時開催の定番。3回戦を勝ち抜けば優勝" },
  // **DIV2 に上がると開く**。キングズの一つ上で、相手も DIV2 の水準になる
  { id:"super", name:"スーパーキングズカップ", every:8, needExp:1800, needDiv:2, rounds:3,
    plan:"d2", prize:[5000,2000,1000,500], fame:[500,170,70,20],
    bias:5, elite:0.10, trophy:"スーパーキングズカップ 優勝",
    note:"DIV2 に上がると出場権が得られる。相手も DIV2 の水準" },
  // **条件は無いが相手が読めない**。各国の DIV3〜DIV1 が完全にランダムで混ざる
  { id:"univ", name:"ユニバーサルカップ", every:9, needExp:0, rounds:5, plan:"rand",
    prize:[7000,2800,1400,700], fame:[700,240,100,30],
    bias:6, elite:0.16, trophy:"ユニバーサルカップ 優勝",
    note:"条件なし。ただし各国の DIV3〜DIV1 が完全にランダム。5回戦の長丁場" },
  // **どれか1つでもカップを獲ると開く**。優勝者だけの大会
  { id:"holder", name:"タイトルホルダーカップ", every:11, needExp:0, needCups:1, rounds:4,
    plan:"mix32", prize:[6000,2400,1200,600], fame:[600,200,80,25],
    bias:4, elite:0.12, trophy:"タイトルホルダーカップ 優勝",
    note:"カップを1つでも制すと開く。DIV3 と DIV2 の混成" },
  { id:"conti", name:"コンチネンタルカップ", every:10, needExp:2500, needDiv:1, rounds:3,
    plan:"d1", prize:[9000,3600,1800,900], fame:[900,300,120,30],
    bias:9, elite:0.22, trophy:"コンチネンタルカップ 優勝",
    note:"一部リーグの強豪だけが集う。DIV1 に上がると出場権が得られる" },
  // **カップを3つ制すと開く**。各国 DIV1 の常連が並ぶ
  { id:"trophy", name:"チャンピオンズトロフィー", every:13, needExp:0, needCups:3, rounds:4,
    plan:"d1", prize:[14000,5600,2800,1400], fame:[1400,470,190,60],
    bias:11, elite:0.28, trophy:"チャンピオンズトロフィー 優勝",
    note:"カップを3つ制すと開く。各国リーグの DIV1 から集まる" },
  // **最終目標**(→docs/03 §3.23)。DIV1 でリーグを制して初めて開く
  { id:"world", name:"ワールドクラブチャンピオンカップ", every:16, needExp:0, needLg1:true,
    rounds:5, plan:"best", prize:[24000,9600,4800,2400], fame:[2400,800,320,100],
    bias:14, elite:0.40, trophy:"ワールドクラブチャンピオン",
    note:"DIV1 を制して初めて開く。各国の最強が終結する5回戦。キャリアの最終目標" },
];
const cupById=id=>CUPS.find(c=>c.id===id);
/** 回戦の呼び名。決勝から逆算するので、rounds を変えても崩れない。 */
function cupRoundName(cup,round){
  const left=cup.rounds-round;
  return left===0?"決勝":left===1?"準決勝":left===2?"準々決勝":round+"回戦";
}
// カップに出てくるクラブ名。実在クラブとは無関係の架空名(→docs/03 §3.13)
// **5回戦の大会は32枠**(→docs/03 §3.23)なので、相手の名前は31以上要る。
// 足りないと組み合わせ表が埋まらず、TBD のまま決勝まで進んでしまう。
const CUP_CLUBS=[
  "アルビオン・ロイヤルズ","ノースゲート・ユナイテッド","サンティアゴ・レオネス",
  "ヴェルデ・アトレティコ","ハーバー・シティ","オルデンブルク・アドラー",
  "リオ・ドラード","カステリョン・アスール","ノルド・スティール","バルティカ・ウルフ",
  "モンテレイ・ハルコネス","アドリア・マリーナ","ケープタウン・ライノス",
  "サンパウロ・トリコロール","ミュンヘン・レーヴェン","リヴァプール・ドックス",
  "アンダルシア・ソル","トリノ・グラナータ","ロッテルダム・ハーフェン",
  "コペンハーゲン・ノーラ","ワルシャワ・ヴィスワ","ザグレブ・プラヴィ",
  "ダカール・リオン","ラゴス・イーグルス","モンテビデオ・セレステ",
  "ボルドー・ヴィニュ","ナポリ・ヴェスヴィオ","ポルト・ドウロ",
  "グラスゴー・シスル","アンカラ・ボズクルト","キエフ・ドニプロ",
  "アテネ・オリンピア","ベオグラード・ズヴェズダ","ブリュッセル・ロワイヤル",
  "ストックホルム・ノルド","オスロ・フィヨルド","ヘルシンキ・ロウタ",
  "ブエノスアイレス・パンパ","サンティアゴ・アンデス","ボゴタ・エスメラルダ",
];

// --- 試合の煽り(→docs/06 §6.8) ---
// **状況から1つ選ぶ**。同じ節なら毎回同じ文になる(たねはクラブ+シーズン+節)。
// 上から順に見て、最初に当たったものを使う(→ui.js の hypeOf)。
//   tag   … 局面の名前。文の前に小さく出して「なぜこの煽りなのか」を見せる
//   lines … 候補。**1行を1要素にした配列**で持つ(見出しは2行まで)。
//           文字列の中に改行を書くと1行のソースが壊れるので、配列で明示する
const HYPE={
  opening:  { tag:"開幕", lines:[
    ["ここから始まる。","長い航海の第一歩。"],
    ["白紙のシーズン。","最初の一勝を掴め。"] ] },
  final:    { tag:"最終節", lines:[
    ["最後の90分。","すべてはこのために。"],
    ["終わりの笛まで。","悔いを残すな。"] ] },
  survival: { tag:"残留争い", lines:[
    ["退路なし。","すべてを懸けたサバイバル。"],
    ["落ちるか、残るか。","分かれ目はここ。"] ] },
  summit:   { tag:"首位攻防", lines:[
    ["頂点をかけた、","運命の分岐点。"],
    ["頂への天王山。","勝者がすべてを手にする。"] ] },
  giant:    { tag:"格上挑戦", lines:[
    ["王者の牙城を崩せ。","下剋上の90分。"],
    ["歴史を変える90分。","挑戦者に失うものはない。"],
    ["牙を剥く、","勝利への飢え。"] ] },
  favorite: { tag:"格下相手", lines:[
    ["負けられないプライドが、","ここにある。"],
    ["主役は、","どちらだ。"],
    ["取りこぼしは","許されない。"] ] },
  rival:    { tag:"実力伯仲", lines:[
    ["因縁のピッチ、","火花散らす宿命の一戦。"],
    ["宿命の激突、","いざ開戦。"],
    ["譲れない","プライドの衝突。"] ] },
  late:     { tag:"終盤戦", lines:[
    ["勝者が","すべてを手にする。"],
    ["運命を分かつ90分。"],
    ["残りは僅か。","一戦の重みが増す。"] ] },
  generic:  { tag:"リーグ戦", lines:[
    ["次の一戦、","積み上げる90分。"],
    ["勝点3を、","この手に。"],
    ["淡々と、","しかし確実に。"] ] },
};

// --- 打ち手(各節に1つ選ぶ。→docs/03 §3.2.3) ---
// WCCF を踏襲した3種。**効果の詳細は D16 で決める**ため、ここでは選択肢の定義だけを持つ。
// 1手 = 1エントリなので、後から足すのも効果を実装するのもこの表を触ればよい。
// **カップのエントリーは打ち手に含めない**(→docs/03 §3.23)。
// 打ち手にすると1回戦の節だけ選手を呼べず、会話が飛ばされたようにしか読めなかった。
/**
 * オーナーの言葉(→docs/03 §3.9 / §3.24)。改行は入れない(→§3.22の教訓)。
 *   open        … 就任直後。**目標順位を告げる**({g}位)
 *   up/over/met/under/down … シーズン総括。昇格 / 目標超え / 目標どおり / 目標割れ / 降格
 *   goal        … 総括の締めに告げる**次のシーズンの目標**({g}位)
 *   keepOk/keepNg … 第80節の去就。契約を延ばす / 当初のまま
 */
const OWNER={
  open:["君に預けるのはこのクラブだ。今季は{g}位以内、これが私の求める線だ。",
        "契約の話は済んだ。あとは結果だけだ。今季は{g}位以内で頼む。",
        "期待している。まずは{g}位以内、そこからの話をしよう。"],
  goal:["来季は{g}位以内を求める。",
        "次は{g}位以内だ。準備を頼む。",
        "来季の線は{g}位以内。それでいこう。"],
  keepOk:["君となら、もう少し先が見たい。契約を延ばそう。",
          "ここまでの仕事は認めている。任期を延ばす、続けてくれ。",
          "君を選んだのは間違いではなかった。契約はこのまま先へ伸ばす。"],
  keepNg:["契約は当初のままだ。残りで示してくれ。",
          "延長の話は今回は無しだ。まだ時間はある。",
          "判断は保留する。残りの節で私を説得してくれ。"],
  up:["よくやってくれた。来季は一つ上の舞台だ。","昇格おめでとう。だが上は甘くない、編成を厚くしてくれ。",
      "クラブの歴史が一つ進んだ。この勢いを止めるな。"],
  over:["期待以上だ。次は表彰台を狙おう。","この順位は偶然ではない。来季こそ昇格だ。",
        "見違えた。予算も少し都合をつけよう。"],
  met:["約束は守ってもらった。来季も同じ調子で頼む。","悪くない。だが我々の目標は昇格だ。",
       "堅実だった。次は一つ上を見せてくれ。"],
  under:["正直、物足りない。来季は結果で示してくれ。","この成績では株主に説明できない。時間は無限ではないぞ。",
         "期待を裏切られた気分だ。立て直しを頼む。"],
  down:["降格だ。責任の話はしない、来季すぐに戻ってこい。","苦しい一年だった。だが下から見える景色もある。",
        "この結果は重い。だが私はまだ君に賭けている。"],
};
/**
 * 采配(→docs/03 §3.28)。**同時に効くのは1つだけ**で、試合中いつでも変えられる。
 *   lane … そのレーン(x座標)の選手が起点と受け手に選ばれやすくなる
 *   push … 陣形の上下(+1=前、-1=後ろ)。あわせて ATK / DEF に小さな補正が付く
 * 十字に並べる: 上=攻撃 / 左中右=レーン / 下=守備。
 */
const ORDERS=[
  { id:"attack", icon:"▲", label:"攻撃重視", push:1,
    desc:"陣形をやや上げ、攻撃力が上がる。押し込めるが背後は薄くなる" },
  { id:"left",   icon:"◀", label:"左サイド", lane:18,
    desc:"左のレーンから組み立てる。左の選手が起点と受け手に選ばれやすい" },
  // 既定でも中央の関与は6割ある。同じ強さで寄せると密集して手数が消えるので、
  // 中央だけ効きを浅くする(→docs/03 §3.28)
  { id:"center", icon:"◆", label:"中央",     lane:50, laneK:0.5,
    desc:"中央から組み立てる。中央の選手が起点と受け手に選ばれやすい" },
  { id:"right",  icon:"▶", label:"右サイド", lane:82,
    desc:"右のレーンから組み立てる。右の選手が起点と受け手に選ばれやすい" },
  { id:"defend", icon:"▼", label:"守備重視", push:-1,
    desc:"陣形をやや下げ、守備力が上がる。守れるが前が遠くなる" },
];
const orderById=id=>ORDERS.find(o=>o.id===id);

/**
 * 特別采配(→docs/03 §3.50)。**指示(上の5つ)の上に1つだけ重ねる**。
 *
 * 中身は「チーム全体に掛かる札」。スキル(→docs/08)とまったく同じ書き方
 * (at / grp / w / s / k)なので、**発動すればカットインのバッジにも出る**。
 *
 *   form … 使える陣形。**陣形を選ぶ理由**になる(16種あるのに選ぶ理由が薄かった)
 *   exp  … 要るチーム熟練度。**クラブに貯まるもの**なので、移籍すると0から
 *          (監督が覚えていても、選手が理解していなければ使えない →§3.50)
 *   role … 掛ける相手を絞る(null なら全員)
 *   push/ordM … 既存の指示と同じ層。指示と**足し算**になる
 *   fx   … 札と同じ層。**必ず代償(k)を1つ持たせる**。得しかない采配は選択にならない
 */
const TACTICS=[
  {
    id:"direct", label:"ダイレクトプレー", icon:"⇡",
    form:null, exp:0,
    desc:"蹴って走る。技術が要らないぶん、力のあるチームなら熟練度ゼロでも回る",
    ordM:{ pow:1.06, tec:0.94 },
    // **強さも持たせる**(→docs/03 §3.50)。w だけだと札の選ばれ方しか変わらず、
    // 効きの倍率(tactic.k)が掛かる先が無い = 他の采配と一緒に上げ下げできない
    fx:[{ at:"origin", grp:"long", w:1.15, s:1.06 },
        { at:"origin", grp:"passTec", w:0.45 }],
    line:"前へ蹴り込む！",
  },
  {
    id:"highpress", label:"ハイプレス", icon:"▲",
    form:null, exp:1500,
    desc:"ラインを上げて前から奪う。背後は当然薄くなる",
    push:1, ordM:{ def:1.05, sta:0.96 },
    fx:[{ at:"counter", grp:"press", w:1.70, s:1.07 },
        { at:"cover", k:0.88 }],
    line:"前から捕まえにいく！",
  },
  {
    id:"retreat", label:"リトリート", icon:"▼",
    form:null, exp:1500,
    desc:"低い位置で受け止める。守れるが、攻めるには遠い",
    push:-1,
    fx:[{ at:"cover", k:1.34 },
        { at:"origin", grp:"carry", w:0.70 }],
    line:"引いて構える",
  },
  {
    id:"shortcounter", label:"ショートカウンター", icon:"⚡",
    form:["4-2-3-1","4-3-3","4-4-2"], exp:5000,
    desc:"高い位置で奪って一気に撃つ。奪えなければ何も起きない",
    ordM:{ spd:1.06, pow:0.97 },
    fx:[{ at:"finish", grp:"close", w:1.60, s:1.07 }],
    line:"奪って一気に！",
  },
  {
    id:"gegen", label:"ゲーゲンプレス", icon:"⛊",
    form:["4-3-3","4-2-3-1"], exp:12000,
    desc:"失った瞬間に奪い返す。走り切れれば強いが、消耗が激しい",
    push:1, ordM:{ def:1.06, spd:1.04, tec:0.98 },
    fx:[{ at:"counter", grp:"press", w:2.20, s:1.12 },
        { at:"stam", k:1.02 }],
    line:"即時奪回！",
  },
  {
    id:"longcounter", label:"ロングカウンター", icon:"➵",
    form:["5-3-2","4-4-2","5-4-1","4-1-4-1"], exp:1500,
    desc:"深く守って一発で終わらせる。持たれるのは承知の上",
    push:-1, ordM:{ spd:1.05, tec:0.98 },
    fx:[{ at:"origin", grp:"long", w:1.90, s:1.04 },
        { at:"origin", grp:"carry", w:0.82 }],
    line:"一発を狙う",
  },
  {
    id:"zone", label:"ゾーンディフェンス", icon:"▦",
    form:["4-4-2","4-1-4-1","4-3-3","4-2-3-1","4-4-2ダイヤ"], exp:5000,
    desc:"人ではなく場所を守る。穴は埋まるが、上手い守備者の持ち味は薄れる",
    fx:[{ at:"cover", k:1.26 },
        { at:"counter", grp:"all", s:0.98 }],
    line:"陣形を崩さない",
  },
  {
    id:"fivelane", label:"5レーン", icon:"⫼",
    form:["3-5-2","4-2-3-1","3-4-3","4-3-3アシメ"], exp:5000,
    desc:"幅を使って外から崩す。中央は薄くなる",
    ordM:{ spd:1.04 },
    fx:[{ at:"origin", grp:"wide", w:1.60 },
        { at:"origin", grp:"cross", w:1.45, s:1.05 },
        { at:"origin", grp:"cut", w:0.82 }],
    line:"幅を使え",
  },
  {
    id:"storming", label:"ストーミング", icon:"⇶",
    form:["4-4-2","4-2-4","4-2-2-2","3-4-3"], exp:5000,
    desc:"縦に速く、当たりも強く。雑になるぶんは目をつぶる",
    ordM:{ spd:1.05, pow:1.04, tec:0.96 },
    fx:[{ at:"origin", grp:"carry", w:1.45, s:1.04 },
        { at:"stam", k:1.01 }],
    line:"縦に速く！",
  },
  {
    id:"catenaccio", label:"カテナチオ", icon:"⛓",
    form:["5-3-2","5-4-1","4-3-2-1"], exp:12000,
    desc:"守り切って勝点1を持ち帰る。点は入らなくなる",
    push:-1, ordM:{ def:1.06, atk:0.93 },
    fx:[{ at:"cover", k:1.30 },
        { at:"finish", grp:"far", w:0.55 }],
    line:"閉じる",
  },
  {
    id:"invfb", label:"インバーテッド・フルバック", icon:"⤺",
    form:["4-3-3","4-2-3-1","4-1-4-1","4-3-1-2"], exp:12000,
    desc:"サイドバックが中に入る。中盤で数的優位を作るが、外は空ける",
    fx:[{ at:"origin", grp:"cut", w:1.70, s:1.05, role:"DF" },
        { at:"start", k:1.30, role:"DF" },
        { at:"counter", grp:"all", s:0.99, role:"DF" }],
    line:"内へ絞れ",
  },
  {
    id:"false9", label:"フォルス9", icon:"⊘",
    form:["4-3-3","ゼロトップ","4-2-3-1"], exp:12000,
    desc:"前線が下りて的が消える。2列目が飛び出すが、放り込みは死ぬ",
    fx:[{ at:"recv", k:0.92, role:"FW" },
        { at:"recv", k:1.38, role:"MF" },
        // **下りた9番は繋ぎ役になる**。受ける回数を減らすだけでは損しかしない
        // (関与の回数は価値にならない →docs/03 §3.38)。
        // grp は "pass" にする — 4-3-3 の前3枚は tec のパス札を持っておらず、
        // passTec だと一度も発動しなかった(実測で気付いた)
        { at:"origin", grp:"pass", w:1.40, s:1.04, role:"FW" },
        { at:"finish", grp:"close", w:1.60, s:1.09, role:"MF" },
        { at:"aerial", k:0.94 }],
    line:"下りて受けろ",
  },
  {
    id:"manmark", label:"マンマーク", icon:"⌖",
    form:["3-5-2","5-3-2","3-4-3","5-4-1"], exp:12000,
    desc:"相手の軸に人を付ける。剥がされたときの穴は大きい",
    manMark:true,
    fx:[{ at:"counter", grp:"press", w:1.60, s:1.06 },
        { at:"cover", k:0.96 }],
    line:"あいつに付け",
  },
  {
    id:"tikitaka", label:"ティキ・タカ", icon:"◌",
    form:["4-3-3","4-1-4-1","9.5番"], exp:25000,
    desc:"短いパスを重ねて崩す。無理には撃たない",
    ordM:{ tec:1.06, pow:0.95 },
    fx:[{ at:"origin", grp:"passTec", w:1.90, s:1.06 },
        { at:"finish", grp:"far", w:0.50 }],
    line:"つないで崩す",
  },
  {
    id:"total", label:"トータルフットボール", icon:"✺",
    form:null, exp:45000,
    desc:"全員がどこでもこなす。枠の噛み合わせを気にしなくてよくなる",
    fitK:0.48,
    fx:[{ at:"stam", k:1.03 }],
    line:"全員で回す",
  },
  {
    id:"bus", label:"パーク・ザ・バス", icon:"⊔",
    form:["5-3-2","5-4-1","4-1-4-1","4-4-2"], exp:5000,
    desc:"リードしたら閉じる。追う展開では何の役にも立たない",
    push:-1,
    // **リードしているあいだだけ**。追う展開では下がるぶんの損しか残らない
    // grp:"all" に w は効かない(全部の札を同じだけ持ち上げても選ばれ方は変わらない)。
    // **リードしているあいだだけ**、寄せの強さそのものを上げる
    fx:[{ at:"counter", grp:"all", s:1.28, when:"lead" },
        { at:"origin", grp:"long", w:1.40, when:"lead" }],
    line:"閉じろ！",
  },
  {
    id:"cynical", label:"戦術的ファウル", icon:"⊗",
    form:null, exp:12000,
    desc:"止めるためなら掴む。芽は摘めるが、カードが増え、退場が現実になる",
    foulX:1.50,
    fx:[{ at:"counter", grp:"press", w:1.90, s:1.18 }],
    line:"ここで止めろ！",
  },
  {
    id:"automat", label:"オートマティズム", icon:"⧉",
    form:null, exp:25000,
    desc:"型で動く。長く組んだ11人ほど噛み合い、初対面の集団では何も起きない",
    bondX:2.6,
    // 型に嵌るぶん、個で運ぶ場面が減る
    fx:[{ at:"origin", grp:"carry", w:0.72 }],
    line:"型どおりに！",
  },
  // --- メモラビリア限定(→docs/03 §3.55) ---
  // **所属で絞る采配**。持ち帰っても、その所属の選手にしか効かない。
  // 熟練度の縛りは無い(覚えること自体が難しいので、二重の鍵にしない)
  {
    id:"meraviglioso", label:"イル・メラヴィリオーゾ", icon:"⚜",
    form:["4-4-2ダイヤ"], exp:0, mem:true, club:"ミラノ・ロッソネリ",
    desc:"技巧で崩す。ミラノ・ロッソネリの選手だけが応えられる、消耗の激しい形",
    ordM:{ tec:1.10, pow:0.96 },
    fx:[{ at:"stam", k:1.05 }],
    line:"美しく崩せ！",
  },
  {
    // **記念の名前をそのまま采配に**。技巧のミランに対して、こちらは速さで裏返す
    id:"invincibles", label:"インヴィンシブルズ", icon:"⚡",
    form:["4-4-2"], exp:0, mem:true, club:"ロンドン・ガナーズ",
    desc:"速さで裏返す。ロンドン・ガナーズの選手だけが走り切れる、背後の薄い形",
    ordM:{ spd:1.10, pow:0.96 },
    // 前がかりになるぶん、**止める場面では弱くなる**
    fx:[{ at:"counter", grp:"all", s:0.98 }],
    line:"一気に裏返せ！",
  },
];
const tacticById=id=>TACTICS.find(t=>t.id===id);

// ---------- メモラビリア(→docs/03 §3.55) ----------
// **普段は戦えない編成**との一戦。QRで配る合言葉(hash)を読ませると開く。
// 相手は常に最強の状態(★上限・全ペア黄金線)で、限定の采配を敷いてくる。
// 勝てば相手の選手を1人もらえることがあり、采配も見て盗める。
//
// **合言葉はそのまま置く**(難読化しない)。オフラインの単一HTMLなので隠しても
// 読めてしまうし、隠すと配った側が確かめられなくなる。
const MEMORABILIA=[
  {
    id:"acm2005",
    hash:"ROSSONERI-2005",
    name:"2005 CL 決勝 ACミラン",
    sub:"あの夜の11人",
    note:"欧州の頂点まで届きかけた、赤と黒の完成形。",
    club:"ミラノ・ロッソネリ",
    coach:"C. アンチェロッティ",
    coachType:"canny",   // 勝っていれば押し切る(→§3.56)
    form:"4-4-2ダイヤ",
    // 枠の並びは FORMATIONS["4-4-2ダイヤ"] と同じ順に置く
    //   GK / LSB / CB / CB / RSB / DMF / CMF / CMF / OMF / ST / CF
    xi:["dida","maldini","nesta","stam","cafu",
        "pirlo","gattuso","seedorf","kaka","crespo","shevchenko"],
    bench:["inzaghi","ambrosini","ruicosta","kaladze","costacruta"],
    kp:"kaka",
    order:"attack",
    tactic:"meraviglioso",
  },
  {
    id:"ars2004",
    hash:"INVINCIBLES-2004",
    name:"2003-04 無敗優勝 アーセナル",
    sub:"負けなかった38節",
    note:"一度も負けずにリーグを駆け抜けた、赤と白の完成形。",
    club:"ロンドン・ガナーズ",
    coach:"A. ヴェンゲル",
    coachType:"keyman",  // 軸(アンリ)の居る側へ振る(→§3.56)
    form:"4-4-2",
    // 枠の並びは FORMATIONS["4-4-2"] と同じ順に置く
    //   GK / LSB / CB / CB / RSB / LMF / CMF / CMF / RMF / ST / CF
    xi:["lehmann","ashleycole","solcampbell","kolotoure","lauren",
        "pires","vieira","gilberto","ljungberg","bergkamp","henry"],
    bench:["keown","clichy","edu","fabregas","reyes"],
    kp:"henry",
    order:"attack",
    tactic:"invincibles",
  },
];
const memById=id=>MEMORABILIA.find(m=>m.id===id);

// ---------- 相手監督(→docs/03 §3.56) ----------
// **できるのは指示と交代の2つだけ**。采配(→§3.50)は動かさない。
// 同じ11人でも「誰が指揮しているか」で試合の運びが変わるようにする。
//
//   at      … 手を打つ節目(分)。ここを過ぎた最初のティックで考える
//   order   … 指示の決め方
//               fixed  そのまま動かさない
//               half   前後半で入れ替える
//               chase  負けていれば攻撃・勝っていれば守備(ふつうの追い方)
//               press  勝っていれば攻撃・負けていれば守備(押し切る/畳む)
//               keyman 軸の居る側へ振る
//               whim   その都度でたらめに
//   subAt   … 交代を考え始める分。null なら**自分からは代えない**
//   subGap  … 続けて代えるまでに空ける分
//   subMax  … その試合で使う枚数の上限(枠の上限とは別に、監督の性分)
const COACHES=[
  { id:"steady", name:"堅物",     note:"最初の形を変えない",
    at:[], order:"fixed", subAt:null, subGap:0, subMax:0 },
  { id:"normal", name:"標準",     note:"前後半で手を変え、交代も使う",
    at:[46,70], order:"half", subAt:55, subGap:12, subMax:3 },
  { id:"whim",   name:"気まぐれ", note:"短い間隔で手も選手も変える",
    at:[15,30,45,60,75], order:"whim", subAt:25, subGap:9, subMax:3 },
  { id:"smart",  name:"知能",     note:"形勢が悪いと手を変える",
    at:[30,50,65,78], order:"chase", subAt:58, subGap:10, subMax:3 },
  { id:"late",   name:"出し惜しみ", note:"終盤まで動かず、最後に一気に",
    at:[75], order:"chase", subAt:75, subGap:3, subMax:3 },
  { id:"canny",  name:"知将",     note:"勝っていれば攻め、負けていれば守る",
    at:[35,55,70,80], order:"press", subAt:60, subGap:11, subMax:3 },
  { id:"keyman", name:"キーマン", note:"軸の居る側へ振る",
    at:[20,40,60,75], order:"keyman", subAt:62, subGap:12, subMax:2 },
];
const coachById=id=>COACHES.find(c=>c.id===id)||COACHES[1];

// ---------- クラブチャット(→docs/03 §3.29) ----------
// 節の進行を**秘書と選手とのやり取り**で行う。打ち手も大会の選択もここで決まる。
// 台詞に改行は入れない(→§3.22 の教訓)。{n} は選手名、{m} は相方の名前に置き換える。
const TRAININGS=[
  { id:"atk", stat:"atk", label:"攻撃練習", ask:"ゴール前の形、詰めておきますか" },
  { id:"def", stat:"def", label:"守備練習", ask:"背後のケア、やっておきましょうか" },
  { id:"sta", stat:"sta", label:"ダッシュ", ask:"走り込み、まだいけます" },
  { id:"tec", stat:"tec", label:"パスワーク", ask:"止めて蹴る、突き詰めますか" },
  { id:"spd", stat:"spd", label:"カウンター", ask:"切り替えの速さ、鍛えますか" },
  { id:"pow", stat:"pow", label:"競り合い", ask:"当たり負けしない身体、作りますか" },
];
const trainById=id=>TRAININGS.find(t=>t.id===id);
const BONDS=[
  { id:"combo",  label:"コンビネーションを磨け" },
  { id:"talk",   label:"お互いについて話し合え" },
  { id:"tactic", label:"戦術について会話しろ" },
];
const bondById=id=>BONDS.find(b=>b.id===id);

// --- スポンサー(→docs/03 §3.40) ---
// **契約中だけ使える4つ目の打ち手**。強化トレーニングの1能力だけに絞った上位版で、
// 手応え(great/fail)が良くなる。id は TRAININGS と共通(同じ能力を指す)。
const SPONSOR_AID=[
  { id:"atk", label:"シュート力強化",       ask:"ゴール前だけを、とことん詰めましょう" },
  { id:"def", label:"組織守備強化",         ask:"守り方を全員で揃えておきますか" },
  { id:"sta", label:"スプリントトレーニング", ask:"最後まで走り切る身体を作りますか" },
  { id:"tec", label:"パス＆コントロール",   ask:"止めて蹴る、徹底的にやりましょう" },
  { id:"spd", label:"ラン＆ガン",           ask:"縦への速さだけを磨きますか" },
  { id:"pow", label:"ウエイトトレーニング", ask:"当たりの強さを底上げしますか" },
];
const sponAidById=id=>SPONSOR_AID.find(a=>a.id===id);
/**
 * スポンサーの候補。**段(tier)が課題の重さと報酬を決める**。
 *   need   … 声が掛かるのに要る名声
 *   league … そのリーグに居るときだけ現れる(無ければどこでも)
 *   coin   … 1段だけ。**会社ごとに額が違う**(無ければ TUNING.spon.coin の段の値)
 * 段の報酬は SPON_PRIZE(1段=コイン … 5段=LEGENDS)。
 */
const SPONSORS=[
  // 1段 … 街の会社。**額は会社ごとに違う**ので、名声0でも「どれと組むか」の判断になる
  { id:"shoutengai", name:"駅前商店会",           tier:1, need:0, coin:6000 },
  { id:"kobo",       name:"ボルタ工房",           tier:1, need:0, coin:5000 },
  { id:"seed",       name:"シードスポーツ用品",   tier:1, need:0, coin:7000 },
  { id:"bento",      name:"大盛り弁当センター",   tier:1, need:0, coin:4000 },
  { id:"clinic",     name:"みどり接骨院",         tier:1, need:0, coin:5500 },
  { id:"taxi",       name:"ホタル交通",           tier:1, need:0, coin:8000 },
  { id:"paint",      name:"サンライズ塗装",       tier:1, need:0, coin:9000 },
  { id:"lager",      name:"ノルドラガー",         tier:2, need:1200 },
  { id:"telco",      name:"リンクテレコム",       tier:2, need:1800 },
  { id:"airline",    name:"アズーレ航空",         tier:2, need:2400 },
  { id:"pub",        name:"レッドライオン醸造",   tier:2, need:1500, league:"eng" },
  { id:"olive",      name:"ソル・デ・オリバ",     tier:2, need:1500, league:"esp" },
  { id:"moto",       name:"モトーレ・トリノ",     tier:2, need:1500, league:"ita" },
  { id:"werk",       name:"シュタール工業",       tier:2, need:1500, league:"ger" },
  { id:"maison",     name:"メゾン・クレール",     tier:2, need:1500, league:"fra" },
  { id:"cafe",       name:"カフェ・ヴェルジ",     tier:2, need:1500, league:"sam" },
  { id:"bank",       name:"メリディアン銀行",     tier:3, need:5000 },
  { id:"auto",       name:"アウレリア・モーターズ", tier:3, need:6500 },
  { id:"stream",     name:"グローブ・ストリーム", tier:3, need:8000 },
  { id:"energy",     name:"ヘリオス・エナジー",   tier:4, need:10000 },
  { id:"ocean",      name:"トランスオーシャン海運", tier:4, need:12000 },
  { id:"world",      name:"ワールドワイド・グループ", tier:5, need:14000 },
  { id:"dynasty",    name:"ダイナスティ財団",     tier:5, need:18000 },
];
const sponsorById=id=>SPONSORS.find(s=>s.id===id);
/** 段ごとの報酬。**最上位が LEGENDS の入手経路**(→docs/03 §3.13)。 */
// **報酬は引換券で配る**(→docs/03 §3.40a)。kind は TICKETS の id と同じ。
// その場で選手を渡していたが、券にしておけば引く時機を監督が選べる。
const SPON_PRIZE=[
  { kind:"coin",       label:"コイン" },
  { kind:"scoutPos",   label:"ポジション確定スカウト",   note:"SPECIALS か WORLD CLASS" },
  { kind:"scoutWc",    label:"WORLD CLASS 確定スカウト", note:"世界屈指の1枚" },
  { kind:"scoutWcPos", label:"WORLD CLASS ポジション確定スカウト",
                       note:"欲しい枠の、世界屈指の1枚" },
  { kind:"scoutLe",    label:"LEGENDS 確定スカウト",     note:"歴史に残る1枚" },
];
const sponPrize=tier=>SPON_PRIZE[Math.min(tier,SPON_PRIZE.length)-1];
/**
 * 連携の覚醒の2択(→docs/03 §3.31)。能力の覚醒と同じ形で、**どちらが当たりかは50/50**。
 * 相手が居る話なので、声の掛け方は「2人に対して」になる。
 */
const BOND_AWAKES=[
  { id:"trust", label:"二人に任せる" },
  { id:"shape", label:"型を決めてやる" },
];
const bondAwakeById=id=>BOND_AWAKES.find(a=>a.id===id);
/** 覚醒の2択(→docs/03 §3.30)。**どちらが当たりかは毎回50/50**で決まる。 */
/** 師弟の2択(→docs/03 §3.39)。**断っても失うものは無い**(枠を空けておける)。 */
const MENTORS=[
  { id:"yes", label:"よろしく頼む", sub:"師弟の約束を結ぶ（任期が明けても連れていける）" },
  { id:"no",  label:"ライバルとして讃える", sub:"約束は結ばない（この選手にはもう起きない）" },
];
const AWAKES=[
  { id:"believe", label:"自分を信じてやってみろ" },
  { id:"hint",    label:"成長のヒントを与える" },
];
// --- 秘書からの連絡(→docs/03 §3.42) ---
// **試合の準備とは別のチャット。** クラブチャットが「1節の判断」なのに対し、
// こちらは**溜まっていく連絡**で、チュートリアルや配布物の入口にする。
//   when … 届く条件。true を返した節に1度だけ届く(id で二度目を防ぐ)
//   gift … 受け取れるもの。いまは引換券だけ
const MAILS=[
  // --- チュートリアル(→docs/03 §3.43) ---
  // **画面のツアーではなく、秘書との一連のやりとり**にしてある。HOME に出しっぱなしの
  // 案内は読み飛ばされるうえ、あとから「何を言われたか」を辿れない。連絡なら受信箱に残る。
  //   tut … 何番目の案内か(見出しの「はじめかた n/N」に出る)
  //   go  … 「行ってみる」で飛ぶ画面。**次にどこを触るか**を1つに絞る
  // 進み具合は S.player.seen(→docs/03 §3.43)。**キャリアで一度きり**なので、
  // 二度目の就任では届かない。
  {
    id:"tut1", from:"sec", tut:1, title:"ようこそ、監督",
    text:"監督、就任おめでとうございます。秘書として、これからお手伝いさせていただきます。"
        +"まずはオーナーがお待ちです。HOME の一番上のタイルから、ごあいさつに向かいましょう。",
    when:S=>!!S.club,
  },
  {
    id:"tut2", from:"sec", tut:2, title:"クラブのみんなに会いましょう", go:"cards",
    text:"ごあいさつ、おつかれさまでした。次は選手たちです。"
        +"CARDS にクラブから預かった選手が並んでいます。"
        +"誰がいるのか、まずは顔ぶれを見ておきましょう。",
    when:S=>mailHas("tut1")&&!!S.career.opened,
  },
  {
    id:"tut3", from:"sec", tut:3, title:"はじめての編成", go:"deck",
    text:"選手は見ていただけましたか。では DECK で先発11人と役割を決めましょう。"
        +"枠に合った選手ほど力を出せます。迷ったら、いまのままでも構いませんよ。",
    when:S=>mailHas("tut2")&&seenHas("cards"),
  },
  {
    id:"tut4", from:"sec", tut:4, title:"はじめての試合", go:"season",
    text:"編成ができましたね。いよいよ試合です。SCHEDULE から次の一戦へ向かってください。"
        +"試合の前には、私から相手の話をさせていただきます。",
    when:S=>mailHas("tut3")&&seenHas("deck"),
  },
  {
    id:"tut5", from:"sec", tut:5, title:"はじめての補強", go:"gacha",
    text:"初戦おつかれさまでした。勝っても負けても、チームは強くしていきましょう。"
        +"SCOUT でコインを使えば、新しい選手が来てくれます。",
    when:S=>mailHas("tut4")&&(S.career.log||[]).length>0,
  },
  {
    id:"tut6", from:"sec", tut:6, title:"それでは監督",
    text:"ひととおりご案内しました。ここからは監督のクラブです。"
        +"オーナーの目標、カップ戦、スポンサー……やることは尽きませんが、"
        +"私はいつでもここにいます。クラブの躍進を、おねがいします。",
    when:S=>mailHas("tut5")&&seenHas("scoutDone"),
  },
  {
    id:"leTest", from:"sec", title:"LEGENDS の引換券",
    text:"監督、初勝利おめでとうございます。上から預かりものが届いていますよ。"
        +"LEGENDS の選手をひとり招ける券だそうです。スカウトの画面で使えます。"
        +"……本当に来るんでしょうか、こんな人が。",
    gift:{ ticket:"scoutLe" },
    // **初勝利のあと**に届く。連絡は id で一度きりなので、キャリアを通して1回だけ
    when:S=>(S.career.log||[]).some(e=>e.res==="win"),
  },
];
const mailById=id=>MAILS.find(m=>m.id===id);
/** チュートリアルの案内は何通あるか(見出しの「n/N」に出す)。 */
const TUT_ALL=MAILS.filter(m=>m.tut).length;
// 引換券(→docs/03 §3.42)。**コインでは買えないパック**。スカウト画面に並ぶ。
/**
 * 引換券(→docs/03 §3.42 / §3.40)。**持っておいて好きなときに引ける**。
 * スポンサーの報酬はここへ集約してある(→§3.40a)。選手をその場で渡すと、
 * いつ引くかを選べないうえ、時限の催しを足したときに「今すぐ引くしかない」になる。
 *
 *   sig  … 実在選手を先に当てる段(→§3.13)。無ければ自動生成
 *   pick … **引くときに枠を選ぶ**。受け取るときではない(券のまま持てるように)
 */
const TICKETS={
  scoutPos:  { id:"scoutPos",  name:"ポジション確定スカウト", pick:true,
               note:"選んだ枠から SPECIALS か WORLD CLASS" },
  scoutWc:   { id:"scoutWc",   name:"WORLD CLASS 確定スカウト", sig:"WC",
               note:"世界屈指の1枚。まだ持っていない選手から招く" },
  scoutWcPos:{ id:"scoutWcPos",name:"WORLD CLASS ポジション確定スカウト", sig:"WC", pick:true,
               note:"選んだ枠の、世界屈指の1枚" },
  scoutLe:   { id:"scoutLe",   name:"LEGENDS 確定スカウト", sig:"LEG",
               note:"歴史に残る1枚。まだ持っていない選手から招く" },
};
const ticketById=id=>TICKETS[id]||null;
/** 台詞。**どれも1行**。監督の発言は選んだ選択肢がそのまま入る。 */
const CHAT={
  // --- 秘書。**やわらかい丁寧語でそろえる**。言い切らず、監督に判断を残す ---
  open:["監督、おはようございます。第{d}節の準備を始めましょうか。",
        "監督、お待ちしていました。第{d}節の段取りを確認しますね。",
        "監督、今日もよろしくお願いします。第{d}節の準備です。"],
  cupAsk:["本日は {c} の開催日です。エントリーの手続き、取っておきましょうか。",
          "{c} が開かれます。参加なさいますか。",
          "{c} の受付が始まっています。いかがいたしましょう。"],
  // **開催日が重なることがある**(→docs/03 §3.23)。そのときはどれに出るかを監督が選ぶ
  cupPick:["本日は {c} の開催日が重なっています。どちらに出ましょうか。",
           "{c} が同じ日に開かれます。どれを狙いますか。",
           "{c} の受付が同時に始まっています。お選びください。"],
  cupYes:["承知しました。手続きは済ませておきますね。初戦のお相手は {f} です。",
          "かしこまりました。エントリー完了です。初戦は {f} と当たります。",
          "手配しておきました。まずは {f} との一戦ですね。"],
  cupNo:["かしこまりました。今節はリーグ戦に集中しましょうね。",
         "承知しました。まずは足元を固めていきましょう。",
         "そういたしましょう。順位を上げるほうが先ですものね。"],
  // 師弟(→docs/03 §3.39)。**選手本人が話しかけてくる**。秘書ではない
  // トレード(→docs/03 §3.49)。**任期の折り返しと終盤に1度ずつ**。
  //   nodes … 話が来る節(これを過ぎていて、まだその回を済ませていなければ出る)
  //   pick  … 相手から提示される候補の数
  // 相手の采配(→docs/03 §3.51)。**何を盗めるか**が試合の前に分かる
  foeTac:["戦い方は「{t}」で来ます。よく見ておきましょう。",
          "相手は「{t}」を敷いてきます。学べるものがあるかもしれません。"],
  // 采配を盗む(→docs/03 §3.51)
  learnMail:["監督、先日の {f} の戦い方——「{t}」ですね。"
             +"うちの選手にも落とし込めそうです。形にしてみませんか。"],
  // トレード(→docs/03 §3.49)。**秘書が持ってくる話**
  tradeAsk:["監督、トレードのオファーが来ているようです。"
            +"先方は {n} を欲しがっています。出しますか。",
            "他クラブから話が来ています。{n} を出せば、条件に合う選手を用意すると。"],
  tradePick:["では、どんな選手を希望しますか。先方の候補はこちらです。"],
  tradeNo:["承知しました。お断りしておきます。",
           "分かりました。この話は無かったことに。"],
  tradeOk:["話をまとめます。{n} の移籍が決まりました。"
           +"先方から選手が届きしだい、受信箱にお知らせしますね。"],
  // 節の出来事(→docs/03 §3.48)。**選手が話しかけてくる**ので、秘書ではなく本人の声
  luckSub:["監督、今日の試合……俺を使ってもらえませんか。ずっと準備してきました。",
           "監督。出番をください。今日なら絶対にやれます。",
           "ベンチから見ているのはもう嫌なんです。今日、使ってください。"],
  luckSubOk:["{n} は見違えるような顔つきになった。"],
  luckAsk:["監督。ひとつ聞かせてください。俺に何を求めていますか。",
           "監督が俺に期待しているのは、どんな役割なんでしょうか。",
           "はっきり言ってください。監督にとって、俺は何ですか。"],
  luckHit:["……そうですか。分かりました。その通りにやってみせます。",
           "腑に落ちました。今日はそのつもりで戦います。"],
  luckMiss:["……そうですか。いえ、分かりました。",
            "……なるほど。少し、思っていたのとは違いました。"],
  luckHitSec:["{n} の顔つきが変わりましたね。今日は期待できそうです。"],
  luckMissSec:["{n}、少し気落ちしているようです。言葉は難しいですね。"],
  luckBond:["{a} と {b} が居残りで練習していましたよ。ずいぶん息が合ってきました。"],
  luckBad:["{n} が浮かない顔をしています。……監督を信じきれていないのかもしれません。"],
  mentorAsk:["監督の采配に感銘を受けました。これからも監督のもとで戦わせてください。",
             "監督についていきたいんです。次にどこへ行くとしても、俺を連れて行ってください。",
             "監督と一緒なら、まだ上へ行ける気がするんです。声を掛けてもらえませんか。"],
  mentorYes:["……ありがとうございます。この先も、必ず力になります。",
             "はい。どこへでも付いていきます。",
             "任せてください。監督の下でもう一段上へ行きます。"],
  mentorNo:["そうですか。……いつか、対戦相手として認めさせます。",
            "分かりました。次はライバルとして、監督の前に立ちます。",
            "残念です。でも、その言葉は忘れません。"],
  mentorSecYes:["{n} 選手と師弟の約束が交わされました。任期が明けても付いてきますよ。",
                "{n} 選手はもう監督の教え子ですね。次の任期にも連れていけます。"],
  mentorSecNo:["{n} 選手には、そう伝えておきますね。",
               "{n} 選手はここまで、ということですね。承知しました。"],
  cupStay:["{c} を勝ち残っていますね。今節は {r}、お相手は {f} です。",
           "まだ {c} が続いています。{r} で {f} と当たりますよ。",
           "{c} は {r} まで来ました。次のお相手は {f} です。"],
  foeLeague:["今節のリーグ戦は {f} と、{v} での一戦です。",
             "お相手は {f}、{v} での試合になります。",
             "今節は {v} で {f} をお迎えします。"],
  // 相手の見立て(→docs/03 §3.35)。**並び・注目選手・戦力差の3つだけ**を言う
  // 助詞の前後に空白を入れない。名前を浮かせるより、声に出したときの自然さを取る
  foeScout:["相手は{f}で来ます。注目は{p}の{n}、{t}選手です。",
            "{f}の布陣ですね。{p}の{n}が中心で、{t}選手です。",
            "相手の並びは{f}。気をつけたいのは{p}の{n}、{t}選手です。"],
  // 相手の軸(→docs/03 §3.44)。**誰を消せばいいか**が分かると、こちらの軸選びが読み合いになる
  foeKey:["相手の KP は{n}です。ここを消せれば楽になります。",
          "{n}を中心に回してきます。まず捕まえたい相手です。",
          "相手の KP は{n}。ここにボールが集まると思ってください。"],
  foeGap:{
    up2:["戦力では大きく上回っています。落ち着いていけば勝てるはずです。",
         "力の差ははっきりしています。堂々と戦ってください。",
         "こちらが格上です。取りこぼしのないように。"],
    up: ["こちらが少し上ですね。油断さえしなければ大丈夫です。",
         "わずかに上回っています。丁寧に運べば形になるはずです。",
         "分はこちらにあります。ただ、気を抜かないでください。"],
    even:["戦力差はほとんどありません。拮抗した戦いになりそうです。",
          "力は互角です。ひとつのミスで決まる試合になるかもしれません。",
          "五分と見ていいと思います。競り合いになりますね。"],
    dn: ["少し分が悪いですね。守りを固めれば十分に狙えます。",
         "わずかに相手が上です。粘り強く戦いましょう。",
         "こちらがやや劣ります。集中を切らさないことですね。"],
    dn2:["正直に申し上げて、格上のお相手です。守って一発を狙いましょう。",
         "力の差はあります。ですが、試合はやってみないと分かりません。",
         "厳しいお相手です。守備から入るのが賢明かと。"],
  },
  handAsk:["チームへの指示をおねがいします、監督。","チームへの指示をおねがいします、監督。",
           "チームへの指示をおねがいします、監督。"],
  whoAsk:["どなたをお呼びしましょう。","誰を呼んでまいりましょうか。",
          "お呼びする選手を決めてください。"],
  restSec:["全員に休養を伝えておきますね。","チーム全体に休みを回しました。",
           "今日はゆっくり休ませましょう。"],
  restDone:["{g}人ほど、表情がよくなってきました。","{g}人の調子が上向いていますよ。",
            "{g}人が持ち直したようです。"],
  restHeal:["{g}人の調子が上向きました。うち{h}人はピッチに戻れそうです。",
            "{g}人が持ち直し、{h}人は復帰できますよ。",
            "{h}人が戻ってこられます。ほかにも{g}人、顔色がよくなりました。"],
  restNone:["みな仕上がっていますね。今日はのんびりさせておきましょう。",
            "全員いい状態です。無理をさせずにおきますね。",
            "特に手当ての要る選手はいません。よい兆しです。"],
  restUrge:["監督、{n} がまだ治療中です。休ませてあげると早く戻ってきますよ。",
            "{n} の具合がまだ戻りません。休養を入れてはいかがでしょう。",
            "{n} は治療の途中です。休ませるのもひとつの手かと。"],
  // スポンサー(→docs/03 §3.40)。**話を持ってくるのはオーナー**
  sponAsk:["オーナーから話です。クラブを支えてくださる企業を決めたいそうですよ。",
           "スポンサーのお話が来ています。どちらと組みますか、監督。",
           "支援の申し出が届いています。オーナーは監督に選ばせたいそうです。"],
  sponYes:["{n} と契約しました。課題は「{g}」、期限は第{d}節です。",
           "{n} で進めますね。「{g}」を第{d}節までに、とのことです。"],
  sponMiss:["{n} との契約が切れました。課題は届かず、評判は少し落ちています。",
            "{n} は静かに引き上げていきました。約束は果たせませんでしたね。"],
  sponEnd:["{n} との契約が満了しました。次の支援先を探しましょう。",
           "{n} との契約はここまでです。お疲れさまでした。"],
  sponAid:["{a} ですね。集中してやらせます。","{a} の日にしましょう。"],
  eventNone:["今節、特にご報告はありません。","変わったお知らせは入っていませんね。",
             "この節は静かなものです。"],
  ready:["すべて整いました。試合へ向かいましょう。","準備完了です。ピッチでお待ちしていますね。",
         "以上です。あとは戦うだけですね。"],
  // --- 監督。**単語で返さない**。短くても文にする(→docs/06 §6.23) ---
  sayCupYes:["エントリーしよう。手続きを頼む。","出るぞ。うちの力を試したい。",
             "参加だ。段取りを進めてくれ。"],
  sayCupNo:["今節は見送ろう。リーグに集中したい。","今回はやめておく。足元を固めるぞ。",
            "見送りだ。順位を上げるのが先だ。"],
  sayTrain:["今日は練習だ。追い込むぞ。","トレーニングに時間を使おう。","体を作る日にする。"],
  sayBond:["少し話をさせよう。","選手同士で語らせたい。","チームの空気を整えたい。"],
  sayRest:["今日は休ませよう。","無理はさせない。体を戻すのが先だ。","休養だ。次に備えろ。"],
  sayWho:["{n} を呼んでくれ。","{n} と話したい。","{n} をここへ。"],
  sayWho2:["相手は {m} でいこう。","{m} と組ませてくれ。","{m} を呼んでやれ。"],
  sayMenu:["{t} をやろう。","今日は {t} だ。","{t} で追い込め。"],
  // --- 選手 ---
  callTrain:["監督、お呼びですか。何をやりましょう。","はい監督。今日は何をしますか。",
             "呼ばれて来ました。メニューをください。"],
  callBond:["監督、誰と話せばいいですか。","はい。相手を指名してください。",
            "了解です。誰と組みましょう。"],
  bondAsk:["{m} と何をすればいいですか。","{m} とは何を話しましょう。",
           "{m} が相手ですね。何をやりますか。"],
  great:["体が軽い。今までで一番の手応えです。","完璧に噛み合いました。これは効きます。",
         "掴みました。次の試合、見ていてください。"],
  ok:["やれました。少しずつですが確実に。","悪くない感触です。続けます。",
      "手応えあり、といったところです。"],
  fail:["……すみません、今日は噛み合いませんでした。","うまくいきませんでした。切り替えます。",
        "力み過ぎました。次は必ず。"],
  bondGreat:["{m} と完全に息が合いました。","{m} との距離感、掴めました。","{m} とは何も言わなくても分かります。"],
  bondOk:["{m} と話せてよかったです。","{m} との呼吸、少し合ってきました。","{m} の考えが分かってきました。"],
  bondFail:["{m} とは、まだ噛み合いませんね。","{m} と意見が割れてしまいました。","{m} とは時間がかかりそうです。"],
  // 訓練の手応えへの相づち。**数字は言わない**(→docs/03 §3.30)
  expGreat:["いい練習でしたね！","手応えがあったようで何よりです。","今日は当たりの一日でしたね。"],
  expOk:["一歩前進ですね。","悪くない一日でした。","こつこつ積み上げましょう。"],
  expFail:["ざんねんでした。次に期待しましょう。","こういう日もあります。切り替えましょう。",
           "今日は空振りでしたね。また明日です。"],
  // 覚醒(→docs/03 §3.30)。**2択のどちらかが当たり**で、外しても経験点は残る
  awakeAsk:"監督、何かつかめそうな気がしています。。",
  awakeOk:"ありがとうございます。成長できたきがします。",
  awakeNg:"まだ何かあるようなきがします・・もう少し考えてみます",
  awakeSec:["よかったですね！","おめでとうございます。いい顔をしています。",
            "見違えましたね。声をかけた甲斐がありました。"],
  awakeKeep:["ざんねんでした。次に期待しましょう。","惜しかったですね。またの機会に。",
             "あと少しでしたね。焦らずいきましょう。"],
  // 連携の覚醒(→docs/03 §3.31)。**2人の話**なので、呼ばれた側が相方について語る
  bondAwakeAsk:"監督、{m}とは何か掴めそうな気がします。",
  bondAwakeOk:"通じ合えた気がします。{m}となら、もっといけます。",
  bondAwakeNg:"もう少しだった気がします。{m}ともう一度やってみます。",
  bondAwakeSec:["いい関係になりましたね！","二人の間に何か通いましたね。",
                "見ていて気持ちのいい距離感でした。"],
  bondAwakeKeep:["ざんねん、あと一歩でしたね。","惜しかったです。積み上げは消えていません。",
                 "今日は噛み合いませんでしたね。また試しましょう。"],
};


const HANDS=[
  { id:"train", icon:"💪", label:"強化トレーニング", desc:"選手の★が上がる（最大★5）",            done:"強化トレーニング" },
  { id:"bond",  icon:"🤝", label:"コミュニケーション", desc:"選手同士の連携が上がる（噛み合えば覚醒も）", done:"コミュニケーション" },
  { id:"rest",  icon:"🛌", label:"休養", desc:"全員のメンタル回復。負傷者がいれば治療", done:"休養" },
];
const handById=id=>HANDS.find(h=>h.id===id);

// --- バランスダイヤル ---
// 確率・係数・閾値は必ずここに集約し、ロジック側へ数値を直書きしない(調整点を1か所に保つ)。
const TUNING={
  league:{ clubs:8, rounds:14 },        // 1リーグのクラブ数 / 節数(ホーム&アウェイ・休みなし)
  // 任期 = キャリア1周(→docs/03 §3.2.3)。節で通算し、シーズンとは切り離す。
  //   extendAt … この節にオーナーが去就を告げる(→docs/03 §3.9)
  tenure:{ limit:96, extend:24, hardMax:120, extendAt:80 },
  // 世界の階段(→docs/03 §3.24)。リーグの格 < 部 の順に段差が大きい
  //   tierK … リーグ(国)の格1つぶん / divK … 部1つぶん / rankK … 部内順位1つぶん
  //   fameLg/fameDiv/fameRank … 就任に必要な名声。fameFree はキャリア開始の下駄
  // 部ごとの編成(16人の内訳 → docs/03 §3.25)。**部の段差は段(レアリティ)で表す**ので、
  // clubBias には部の項を持たせない(二重に効かせない)。
  //   div1 は「REG 2 + 残り14」を基準に、WC の枚数をリーグの格と部内順位で決める
  //   wcByTier … tier1(カンピオナート) 〜 tier6(プレミア) の WC 枚数
  //   rankWc   … 部内順位1つぶんの WC 枚数の差(上位ほど多い)
  //   contiWc  … コンチネンタルカップに出てくる「リーグ首位級」の WC 枚数
  //   worldWc  … ワールドクラブ選手権の上乗せ(最強ランク)
  roster:{ div3:{ STD:10, REG:6 },
           div2:{ STD:3, REG:8, SPE:4, WC:1 },
           div1:{ REG:2, rest:14 },
           wcByTier:[2,4,6,8,10,13], rankWc:0.5, contiWc:11, worldWc:3 },
  world:{ tierK:1.2, rankK:1.6,
          fameLg:1400, fameDiv:520, fameRank:70, fameFree:300,
          promote:2, relegate:2 },                           // 上位/下位 何クラブが入れ替わるか
  //   subWindow = 交代直後に「スーパーサブ」が効く時間(分)
  squad:{ starters:11, bench:5, subMax:3, subWindow:15 },
  // スキルの**実効価値**の目標(→docs/08 §8.6④)。価値 = 発動率 × (s−1)。
  // 層ごとにこの値へ揃えることで、グループの広さに関わらず1枚の重みが等しくなる。
  //   band … 許す振れ幅(±)。狭いグループは w/s の刻みが粗いので完全には揃わない
  skillVal:{ origin:0.0231, counter:0.0456, finish:0.0569, band:0.30 },
  // 大会(→docs/03 §3.23)。
  //   rest … 1つ終えてから次に出られるまでに空ける節数。
  //          8種すべてが開くと**開催日が任期の75%を覆い**、リーグが1.7シーズンしか
  //          回らなくなる(実測)。5節あけると 4.4シーズン・大会10回で釣り合う
  cup:{ rest:5 },
  // 体つき(→docs/03 §3.27)。**pow/tec/spd の重みだけ**を組み替える。
  // ポジションの重みが固定だと、同じ枠の選手はみな同じ手を選び、同じ動きになる。
  //   rate  … 素の重みから外れる確率
  //   flat  … そのうち「万能型」(3つ横並び)になる割合。残りは「特化型」
  //   move  … 特化型が**残り2つそれぞれから**特化先へ移す点数
  //
  // **3つの中だけで移す**。重みをいじって配らせると、削ったぶんが atk など別の能力へ
  // 流れて「速くて決定力も高い」純粋な強化になる(実測 得点 2.7 → 7.0)。
  body:{ rate:0.16, flat:0.30, move:3 },
  // 札を1枚引くとき、**汎用の札**(SKILLS_ANY)から引く確率(→docs/08 §8.5)。
  // 均等にすると位置の札が薄まりすぎ、GKのセービングが 33%→20% まで落ちて得点が増える。
  // 汎用は「どんな選手か」であって専門性ではないので、専門の札より出にくくてよい。
  skill:{ any:0.22 },
  // 采配(→docs/03 §3.28)。**指示は必ず表と裏を持つ**(得るものと失うもの)
  //   laneW     … 指示したレーンの選手が起点/受け手に選ばれやすくなる上乗せ
  //   laneSigma … レーンが効く幅(x座標)。狭いとサイドの数人しか関与しなくなる
  //   shiftY    … 攻撃/守備重視で動く縦位置(GKは動かない)
  //   buf       … 攻撃重視のATK / 守備重視のDEF に掛かる倍率
  order:{ laneW:1.20, laneSigma:26, shiftY:9, buf:1.03 },
  // クラブチャット(→docs/03 §3.29)。訓練/交流の手応え
  chat:{ great:0.18, fail:0.22 },
  // スポンサー(→docs/03 §3.40)。term は契約の長さ、pick は出てくる候補の数。
  //   great/fail … 支援の打ち手の手応え(通常は chat の 0.18 / 0.22)
  //   coin       … 段ごとの賞金。streak は段ごとの連勝数
  //   fameFail   … 課題を落としたときに引かれる名声。**名声が減る唯一の経路**
  //   least … 任期の残りがこれ未満なら相談が来ない(罰の無い契約を作らない)
  // 固有スキルの発動条件(→docs/03 §3.41)
  //   late  … この分以降(90分+ロスタイムなので、およそ残り15分)
  //   fresh … スタミナがこの割合以上
  skillCond:{ late:75, fresh:0.70 },
  spon:{ term:24, pick:3, great:0.34, fail:0.12, least:12,
         // coin は1段だけが使う。**会社ごとの coin があればそちらが優先**
         coin:[6000,14000,30000,60000,120000],
         // 4段と5段が同じなのは**わざと**。LEGENDS の重さを動かさずに段を挟んだ
         streak:[3,4,5,6,6],
         fameFail:[100,260,600,900,1200],
         wcInPos:0.30 },                        // ポジション確定スカウトが WC になる率
  // 訓練(→docs/03 §3.30)。**任期のあいだだけの伸び**で、任期が明けるとリセットされる。
  //   ok/great … 手応えごとにもらえる経験点の幅(失敗は0)
  //   need     … 覚醒イベントが起きる経験点
  //   maxStar  … ★の上限。これに達したら覚醒は起きない
  train:{ okLo:1, okHi:3, greatLo:3, greatHi:5, need:10, maxStar:5 },
  // コンディション(→docs/03 §3.32)。**隠しパラメータ**で0〜4の5段。節ごとに動く。
  //   mul  … 段ごとに素の能力へ掛かる倍率(2=普通が等倍)
  //   up/dn … 試合の採点がこれ以上/以下なら1段上下する
  //   shake … 試合のあと、加えて上下する人数(この範囲から抽選)
  //   cpuLo/cpuHi … 相手クラブの段の散らばり。強いクラブほど上に寄る
  //   pull … 揺さぶりが**普通(2)へ戻ろうとする強さ**。0だと端に溜まる
  //   hurtK … ケガの起きやすさ。**守備チャンネルの反則率に掛ける**ので、
  //           荒い手ほど怪我人が出る。非常にごくまれ(1シーズンに1〜2人)に効かせる
  //   healLo/healHi … 治療にかかる節数(この範囲から抽選)
  //   restTo … 休息で引き上げられる上限の段(これ未満の選手が1段よくなる)
  //   gap … 採点で1段動く幅。**チームの中央値からの差**で見る(→docs/03 §3.32)。
  //         絶対値のしきい値(6.5/5.5)では、採点がクラブの強さで丸ごと動くため
  //         強豪は好調に張り付き弱小は不調に張り付いた
  //         (実測 強×弱 +18pp / 弱×強 −71pp)。中央値からの差なら
  //         どの対戦でも上下が 0〜2pp で釣り合う
  cond:{ mul:[0.90,0.97,1.00,1.03,1.06], gap:0.40,
         shakeLo:2, shakeHi:3, pull:0.16, cpuBias:0.055,
         hurtK:0.060, healLo:2, healHi:5, restTo:3 },
  // 連携(→docs/03 §3.31)。**選手2人の組ごと**に積み上がる。任期のあいだだけ。
  //   match … 試合を1つ終えるごと(全員と +base、国籍が同じなら +nation、
  //           コンビネーションのクラブが同じなら +club。最大3)
  //   bond  … 交流の手応えごとに**両者へ**入る
  //   t1..t3 … 2人の関係値の合計(=組の値×2)のしきい値
  //   k1..k3 … そのときパス系の判定に掛かる倍率
  //   t4/k4 … **連携の覚醒**(→docs/03 §3.31)。合計が t4 を超えた組だけが挑める。
  //           成功すると黄金線になり、パスの倍率が k3 から k4 へ上がる
  // **試合だけでは黄金線に届かない**ようにしきい値を引き上げた(→docs/03 §3.31)。
  // 40/80/120/160 の頃は、任期98試合で**いちばん薄い組でも合計392**まで積み上がり、
  // 全120組が最上段に達したうえ黄金の資格まで満たしていた。交流の出番が無い。
  //   縁の無い組(+2/試合) 98試合で196 … t1 だけ。交流でしか先へ行けない
  //   同クラブ(+4/試合)   98試合で392 … 終盤に t3。黄金は交流で +248 必要
  //   同クラブ同国籍(+6)  98試合で588 … t3 は早いが、黄金には届かない
  // 信頼と師弟(→docs/03 §3.39)。**全員0から始まり、下がることもある**。
  //   news … ここを越えると CLUB NEWS に予兆が出る
  //   need … ここを越えると師弟のイベントが起きる(選手ごとに一度だけ)
  //   max  … 師弟を結べる人数。次の任期へ連れていける上限そのもの
  trust:{ news:100, need:120, max:3,
          startXI:1,                                   // スタメンで出た
          bondFail:-1, bondOk:1,  bondGreat:2,         // 交流
          trainFail:-1, trainOk:2, trainGreat:3 },     // 訓練
  // **1回の交流を厚く、しきい値を低く**(2026-08-11)。前は55組もある中で1回12しか
  // 入らず、しきい値が80/200/360だったので、1シーズン交流だけに費やしても
  // ほとんどの組が最下段に届くだけだった(実測: 得失点差 +0.003 = 事実上の無効)。
  // 狙った組を伸ばせば任期の中で最上段まで持っていける幅にしてある。
  // **黄金線のしきい値(t4)だけは動かさない**(→docs/03 §3.31)。任期98試合で
  // いちばん縁の濃い組でも 588 までしか積み上がらないので、640 は「交流でしか
  // 越えられない線」であり続ける。下げると試合を重ねるだけで黄金に届いてしまう。
  // 連携(→docs/03 §3.31 / §3.60)。**効かせる場所は3つ**。
  //   k*    … 競り合い(resolveChannel)に掛ける倍率。段ごと
  //   seekK … **誰に預けるか**(receiverAt)。分かり合った相手を探しに行く
  //   cqK   … **決定機の質**(chanceOf)。渡した側と撃つ側の呼吸
  // 1か所だけだと倍率をいくら上げても頭打ちになる(実測: k3で+0.144、k4でも+0.146)。
  // 掛かる場所を増やすと、同じ段でも効きが伸びる(→§3.60)
  bond:{ match:{ base:1, nation:1, club:1 }, great:40, ok:24, fail:0,
         t1:30, t2:80, t3:160, t4:640,
         k1:1.10, k2:1.20, k3:1.34, k4:1.50,
         seekK:1.60, cqK:0.55 },
  // 相手の見立て(→docs/03 §3.35)。編成込みの総合力の差を言葉に落とすときのしきい値
  //   small … これを超えると「少し上/下」、big … これを超えると「はっきり上/下」
  brief:{ small:2, big:6 },
  // 試合の再生(描画側のみ。**結果には一切影響しない** → docs/07 §7.1)
  ui:{ tickMs:1500, speeds:[1,2,4] },
  // 選手の動き(**演出専用**。判定にも events にも一切影響しない → docs/06 §6.18)
  //   followY/X  ブロックがボールへ寄る強さ(縦/横)
  //   *Follow    ラインごとの寄り方の違い
  //   pushUp     攻めている側が前へ出る量 / dropBack 守っている側が下がる量
  //   stretch    攻めている側の広がり(負=広がる) / compact 守っている側の圧縮
  //   gkOut/Side GKがゴールから出る量 / 左右への追従
  //   wander     全員のゆっくりした揺れ(完全に止めない)
  //   maxDevY/X  **枠から離れられる上限**。無いと全員がボールに吸い寄せられて
  //              陣形が消え、団子になる
  //   lineTop/lineBottom  陣形の 13..87 を画面のどこに詰めるか。
  //     **2チームを同じピッチに並べるため**の圧縮。広げたままだと自軍FWが
  //     相手の最終ラインより深く立ち、全陣形が常時オフサイドの絵になる。
  //   kickTop  再開時(キックオフ/ハーフタイム/得点直後)。**両チームとも自陣に収める**
  play:{ lineTop:24.9, lineBottom:93, kickTop:53,
         followY:0.38, followX:0.26,
         gkFollow:0.15, dfFollow:0.85, mfFollow:1.00, fwFollow:0.55,
         pushUp:4, dropBack:4, stretch:-0.05, compact:0.09,
         maxDevY:13, maxDevX:11,
         gkOut:0.06, gkSide:0.22, wander:1.4, wanderStep:0.7,
         // --- 運動量(→docs/06 §6.18)。**見た目だけ**で、判定には一切効かない ---
         //   age*      年齢の係数。若いほどよく動く
         //   vigorStam スタミナの効き(1 で完全比例。疲れると動きが鈍る)
         //   chase*    ボールに近い選手ほど強く追う(K=強さ / R=届く距離)
         //   space*    攻撃側の前の選手が**マークを外して空きへ動く**(K=強さ / R=見る距離)
         ageYoung:18, ageOld:34, ageLo:0.84, ageHi:1.16,
         vigorStam:0.70, chaseK:0.50, chaseR:26, spaceK:5.5, spaceR:15,
         // カットイン(→docs/06 §6.19)。盛り上がる局面は必ず、繋ぎは抽選で出す
         // 表示時間。演出は「帯→両者→決着語」で約1.0秒かかるので、
         // それに読む間を足した長さにする(短いと認知が追いつかない)
         cutMs:1700, goalMs:2600, kickMs:2000, cutMaxSpeed:2,
         cutJudge:620,   // 決着(勝者が光り敗者が沈む)を出すまでの間
         shotHold:1000,  // 「シュート!」を見せてから結果を出すまでの間
         // PK戦(→docs/03 §3.33)。**本数が多い**(サドンデスで24本まで)ので、
         // 流れの中のシュートより短く見せる。倍速では psoHold ごと縮む
         psoMs:1250, psoHold:650, psoGap:420,
         // シュートの着地点。**ピッチの実寸(CSS の .pt-frame / .pt-goal)に合わせる**。
         // ゴールラインは 2.0%、ゴールの帯は 1.2〜2.2%、ポストの内側は x 43〜57。
         // ここを player 座標(13〜87)で扱うと、ボールがピッチの中で止まって見える。
         goalLine:2.0, goalNet:1.6, goalKeep:4.5, goalMouth:5,
         cutPass:0.22, cutStop:0.20, cutMiss:0.25 },
  // --- スタミナ(→docs/07 §7.10) ---
  // 消耗 = 出場時間 × perMin + 関与回数 × perAct。sta が高いほど緩やか。
  // 攻守どちらのスコアにも eff 経由で掛かる(GKも例外ではない)。
  //   minStam   下限。ここまでしか落ちない
  //   staReduce sta20 のとき消耗が何割減るか
  //   lineFree/linePenalty  守備ラインの綻び(平均消耗が不感帯を超えた分だけ守備が落ちる)
  //   capMul … キャプテンの消耗の倍率。**長くピッチに居られる**(→docs/03 §3.20)
  fatigue:{ perMin:0.0040, perAct:0.0260, staReduce:0.45, minStam:0.30,
            lineFree:0.20, linePenalty:0.85, capMul:0.72 },
  // 枠適性(→docs/03 §3.14)。card-eleven を踏襲した3段。
  //   sub  サブポジションが一致 = 本来の力を出せる
  //   main サブは違うがメイン(大分類)が一致 = とりあえず使えるが本来の力は出ない
  //   none どちらも不一致 = ほぼ機能しない
  fit:{ sub:1.00, main:0.75, none:0.50 },
  // 収入(→docs/03 §3.5)。数値は暫定。
  //   win/draw/lose … 1試合ごと
  //   season … シーズン末の賞金(→docs/03 §3.24)。**昇格に厚く積む**ので、
  //            上がった季はプロスカウト(12,000)に手が届く
  // 施設(→docs/03 §3.5)。**数値はここだけ**。
  //   cost   … Lv.n → Lv.n+1 の費用。0→5 の合計 156,000
  //   nodes  … 完成までの節数(同じく段ごと)。0→5 で 40節
  //   maxLv  … 上限
  //   start  … 就任時の初期レベル = floor((リーグの格−1) × startTier)
  //   train/medHurt/medHeal/scout … 効果の1段あたりの量
  fac:{ cost:[8000,15000,26000,42000,65000], nodes:[4,6,8,10,12], maxLv:5,
        startTier:0.5, train:0.12, medHurt:0.12, medHeal:0.5, scout:0.10 },
  // ユース(→docs/03 §3.57)。**任期に1人、タダで、ただし置いていく**。
  //   nodes … 上がってくる節の候補。任期ごとにどちらか一方
  //   rar   … ユース組織の段(1..5)ごとの段。**最大 WORLD CLASS**
  //   star  … 上がってきた時点の★。もう伸びない代わりに、最初から仕上がっている
  youth:{ nodes:[40,80], rar:["REG","REG","SPE","SPE","WC"], star:5 },
  // 観客収入(→docs/03 §3.5)。**節ごとの安定収入**で、スタジアムと成績で伸びる。
  //   base … 1節あたりの素の額。リーグの money と部で倍率が掛かる
  //   perLv … スタジアム1段あたりの上乗せ / form … 勝率0〜1で掛かる幅
  //   divK … 部の倍率(DIV1/DIV2/DIV3)
  gate:{ base:900, perLv:0.34, form:0.50, divK:[1.35,1.10,0.90] },
  //   goalHit/goalStep … 目標順位を達成したときの一時金と、1つ上回るごとの上乗せ
  //   goalMiss         … 目標に届かなかったときの減俸(1つ下回るごと)
  reward:{ win:900, draw:400, lose:120,
           season:{ base:1500, perRank:350, champ:2000, promote:8000, relegate:0,
             goalHit:2500, goalStep:800, goalMiss:900 } },
  // スカウト(→docs/03 §3.22)。**コインで引く**。1シーズンの稼ぎは
  // 勝ち星しだいで概ね 8,000〜14,000 コインなので、通常なら4〜7回、重点なら2〜3回。
  //   cards … 1回で出る枚数 / floor … 必ず1枚はこの段以上
  //   w     … 段の重み(未指定は RARITY.w をそのまま使う)
  // **1回に1人**(→docs/03 §3.22)。3枚まとめて引いていた頃は、1回開くだけで
  // 陣容が一気に入れ替わり、誰を入れて誰を外すかの判断がまとめて飛んだ。
  // 単価は3枚時代の**ちょうど1/3**なので、同じコインで手に入る人数は変わらない。
  // 見本市(→docs/06 §6.46)。**n 枚を並べ、ms ごとに1枚ずつ入れ替える**
  fair:{ n:4, ms:2600 },
  scout:[
    { id:"open", name:"スカウト", cost:600, cards:1, floor:null, w:null,
      note:"街とアカデミーを広く見て回る。まれに切り札が混じる" },
    { id:"focus", name:"重点スカウト", cost:1600, cards:1, floor:"REG",
      w:{ REG:64, SPE:36 },
      note:"目星を付けた選手に絞る。必ず REGULAR 以上" },
    // **1シーズンの稼ぎを賭ける枠**(→docs/03 §3.26)。SPECIALS 以上が確定で、
    // 12% で WORLD CLASS。解禁条件は付けない
    { id:"pro", name:"プロスカウト", cost:4000, cards:1, floor:"SPE",
      w:{ SPE:88, WC:12 },
      note:"世界中に網を張る。SPECIALS 以上／まれに WORLD CLASS" },
  ],
  // オーナーの評価(→docs/03 §3.9)。**積み上げ式**で 0〜100 を動く。
  //   gap        … これ以上の総合力差があれば「格が違う」と見なす
  //   upset/slip … 格上に勝った / 格下に負けた
  //   lChamp..   … リーグ優勝 / カップ優勝 / カップ初戦敗退 / 昇格
  //   extendNeed … 第80節の延命イベントで契約が伸びる評価
  //   fameK      … **名声はこの倍率で評価に相乗りする**(→docs/03 §3.9)
  //   fameFor    … そのうち名声を生む出来事。**カップは順位ぶんの表を別に持つ**ので
  //                 ここに入れない(入れると優勝で名声が二重に入る)
  eval:{ start:50, max:100, gap:3, upset:4, slip:5,
         lChamp:10, cChamp:8, cOut1:5, promote:6, extendNeed:70,
         fameK:40, fameFor:["upset","lChamp","promote"] },
  // 期待順位: クラブの格と「持ち込んだ編成の強さ」の合成(→docs/03 §3.9)
  expect:{ squadWeight:0.45 },
  // --- 試合エンジン(→docs/03 §3.19 / docs/07-match-engine.md) ---
  // 時計。3分刻みで、ハーフごとにアディショナルタイムが付く。
  match:{ tickMin:3, halfTicks:15, atMax:[2,3] },   // 45分=15ティック / AT 前半0〜2・後半0〜3
  // 支配率(中盤の押し合い)。攻撃権はこの比で抽選する。
  mid:{ tec:0.45, spd:0.30, sta:0.25, mf:1.00, other:0.32 },
  // 判定の閾値: 攻撃側スコア > 守備側スコア × 閾値 で成功(card-eleven から踏襲)
  // 特別采配の効きの倍率(→docs/03 §3.50)。**s と k の「1からの隔たり」を伸ばす**。
  // w(札の選ばれやすさ = 采配の性格)と ordM には掛けない。
  // **シュート側の勾配(→docs/07 §7.22)と対で見ること**。gapPow を下げると
  // 采配が生む能力差も同じだけ潰れるので、ここで戻す
  tactic:{ k:1.45 },
  th:{ shot:1.16, pk:1.00, origin:0.95, block:1.36, rebound:1.00, aerial:1.15 },
  // セットプレー(→docs/07 §7.11)。**守備側が競り合いに勝った瞬間だけ**ファウルが起きる。
  //   foulK              … 守備チャンネルが持つ反則率に一括で掛ける倍率(→§7.12)
  //   foulBlock          … ブロックのあとのファウル率
  //   boxH               … この高さ以上のファウルは PK(それ以外は FK)
  //   fkDirectH/fkDirect … 直接狙える高さと、そのとき直接を選ぶ割合(残りはクロス)
  //   ckOnBlock/ckOnSave … ブロック・セーブがコーナーに逃げる割合
  //   maxSp              … 1回の攻撃で連鎖できるセットプレーの上限(CK→CK の暴走止め)
  //   fkH                … この高さ未満のファウルは蹴らない(カードだけ引いて攻撃終了)
  // PK戦(→docs/03 §3.33)。ノックアウトの引き分けはここで決める。
  //   rounds … 先攻後攻で蹴る本数 / suddenMax … サドンデスの上限(安全網)
  //   h      … 判定に使う位置(通常のPKと同じ)
  pso:{ rounds:5, suddenMax:15 },
  sp:{ foulK:1.00, foulBlock:0.055, boxH:0.92, fkH:0.50,
       pkH:0.97,
       fkDirectH:0.62, fkDirect:0.55, fkCrossH:0.62, restartGain:0.14,
       crossH:0.93, aerialPow:0.65, aerialK:0.85,
       ckOnBlock:0.34, ckOnSave:0.28, maxSp:2,
       yellow:0.42, pkYellow:0.55, red:0.005, pkRed:0.020,
       bookedShy:3.0, minPlayers:8 },
  // シュートの距離減衰(→docs/07 §7.9)。h=1 がゴール前、0 が自陣ゴール前。
  //   deadZone この高さ以下はほぼ入らない / minRange その下限 / rangePow 減衰の効き
  //   gkDef/gkPow/gkTec  GKのセーブの配合(合計1.0)
  //   accBase/accTec/accRange  枠に飛ぶ率 = (accBase + tec/20×accTec) × near^accRange
  //   rebound                  セーブがこぼれる率(そのあと詰める勝負になる)
  // **水準が上がっても得点が膨らまないように**(→docs/07 §7.16)。
  // GKのセービング(def)は OVR80 あたりで 20 に張り付くのに、攻撃側は tec/spd が
  // 伸び続ける。GKの評価を pow/tec 寄りにし、枠内率の tec 依存も浅くしてある。
  //   gapPow … 撃つ側とGKの比をこの累乗で**1に向けて圧縮する**(→docs/07 §7.22)。
  //            1.0 = 圧縮なし(力の差がそのまま決定率の差になる)。
  //            低いほど「格上でも決めきれない」。th.shot と対で調整すること
  //            (圧縮すると全体の決定率も上がるので、閾値で水準を戻す)
  shot:{ gapPow:0.45, deadZone:0.25, minRange:0.04, rangePow:1.00,
         gkDef:0.65, gkPow:0.20, gkTec:0.15,
         finStat:0.35, fkAccBase:0.62,
         accBase:0.30, accTec:0.45, accRange:0.55, rebound:0.30,
         reboundH:0.95, reboundMax:4,
         // GKのフィード(→docs/07 §7.18)。枠外とセーブのあと、**次の攻撃**が
         // 守っていた側のGKから始まる。攻撃の回数は増えない(増やすと得点が膨らむ)
         feed:0.55,    // ゴールキックが味方に繋がる率(→docs/03 §3.61)
         // **飛び出して角度を消す**(→docs/03 §3.62)。GKの死に能力に仕事を与える。
         //   rushRate … 出られるかの判定。**spd**(間に合うか)と距離で決まる
         //   rushK    … 出られたときに枠へ飛ぶ率をどれだけ削るか。**atk**で決まる
         //   rushRef  … 「振り切っている」とみなす能力値。**20で割らない**。
         //              GKは枠の重みの都合で atk が素で5前後、spd が10前後しか無く、
         //              STAT_MAX で割ると範囲の大半を捨てることになる
         rushRate:1.0, rushK:0.34, rushRef:12 },
  // 節の出来事(→docs/03 §3.48)。**10試合に1回くらい**、何かが起きる。
  //   rate  … 起きる確率
  //   bond  … 個人練習で積む連携(組の値)
  //   trust … 問いに当たったとき / 外したときの信頼
  //   badTo … 不信で落ちるコンディションの段
  luck:{ rate:0.10, bond:90, trustHit:10, trustMiss:-3, badTo:1 },
  // トレード(→docs/03 §3.49)。**任期の折り返しと終盤に1度ずつ**。
  //   nodes … 話が来る節(これを過ぎていて、まだその回を済ませていなければ出る)
  //   pick  … 相手から提示される候補の数
  trade:{ nodes:[45,90], pick:3 },
  // 采配を盗む(→docs/03 §3.51)。**その采配で戦ってきた相手とやり合う**と覚える。
  //   win/draw/lose … 1試合あたりの当たり
  //   cup           … カップの決勝級はどの相手も一段賢い(上乗せ)
  learn:{ win:0.25, draw:0.10, lose:0.05, cup:0.10 },
  // 秘書からの連絡(→docs/03 §3.42)。**溜め込みすぎない**。
  // keep … 残す通数。これを超えたら古いものから消えるが、
  //        **受け取っていない贈り物がある連絡は消さない**
  mail:{ keep:30 },
  // 経歴(→docs/03 §3.2.3)。**直近だけ見せる**。長く続けるほど伸びるので、
  // 全部並べると CLUB 画面が経歴だけで埋まる
  career:{ show:20 },
  // エンブレム(→docs/03 §3.54)。**ワールドクラブチャンピオンカップの獲得数**が★になる
  emblem:{ maxStar:3 },
  // メモラビリア(→docs/03 §3.55)。**普段は戦えない編成**との一戦。
  //   star/gold … 相手は常に最強の状態(★上限・全ペア黄金線)
  //   card      … 勝ったときに相手の選手を1人もらえる確率
  //   tactic    … 相手の采配を覚える確率。**勝たなくても引ける**(見て盗む)
  //   winK      … 勝ったときの倍率(負けても引けるが、勝てば厚い)
  mem:{ star:5, gold:true, card:0.08, tactic:0.12, winK:2.5 },
  // 相手監督(→docs/03 §3.56)。tired … これを下回った選手から替える
  coach:{ tired:0.72 },
  // 相手の育ち具合(→docs/03 §3.53)。**段の数値は域内に収め、強さの差は★で出す**。
  // 段のバッジが意味を保ったまま、上位の相手が強くなる。
  //   max      … 選手あたりの★の上限。**プレイヤー側と同じ上限**にそろえる
  //   byDiv    … 部ごとの土台(DIV1 / DIV2 / DIV3)
  //   tierK    … リーグの格ぶん(プレミアとカンピオナートの差)
  //   rankK    … クラブの順位ぶん
  //   cupK     … 大会の格ぶん / roundK … 勝ち上がりぶん
  //   goldAt   … ここに届いた相手は**全ペアが黄金線**になる(→§3.31)
  //   bandK    … 段の**中で**上下に寄せる強さ(1.0 だと上限に張り付いて個体差が消える)
  star:{ max:5, byDiv:[4,2,0], tierK:0.30, rankK:0.30,
         cupK:0.34, roundK:0.30, goldAt:4, bandK:0.35 },
  // 実績の報酬(→docs/03 §3.52)。**初優勝にだけシグネチャが付く**。
  // 一番価値のある WC / LE の実在選手を、棚の目標そのものと結びつける。
  //   cup     … カップの初優勝で配る段(規模で分かれる)
  //   lg1     … リーグ DIV1 制覇(初回)。6リーグぶんあるので、渡り歩く理由になる
  //   lgCoin  … DIV2 / DIV3 制覇(初回)。ここはコイン
  //   again   … 2度目から。**シグネチャは付かず**、棚の回数が増えてこの額だけ乗る
  ach:{
    cup:{ pre:"WC", kings:"WC", super:"WC", holder:"WC",
          univ:"LEG", conti:"LEG", trophy:"LEG", world:"LEG" },
    lg1:"WC",
    lgCoin:{ 2:4000, 3:1500 },
    again:{ WC:2500, LEG:6000, coin:0.5 },
  },
  // カードの売却(→docs/03 §3.46)。**スカウトの元は取れない値**に置く。
  //   base   … 段ごとの下値
  //   perOvr … OVR 1 あたりの上乗せ(from を超えたぶん)
  // 実測: スカウト600 → 期待 242 / 重点1600 → 437 / プロ4000 → 727。
  // ここを上げると「引いて売る」が回り出すので、**必ず引く値段より安く**。
  sell:{ base:{ STD:60, REG:150, SPE:400, WC:1200, LEG:2600 }, perOvr:6, from:40 },
  // 貸与の買い取り(→docs/03 §3.59)。**師弟の約束を結んだ選手だけ**。
  // 売値の何倍で買い取れるか。市場(k=5〜)より安いのは、**既に一緒に戦っている**ぶん
  buy:{ k:3.5 },
  // 移籍市場(→docs/03 §3.53)。**名指しで買える唯一の経路**。
  // 買値は売却カーブ(sell)に段ごとの倍率を掛けて出す。
  //   slots … 毎節並ぶ人数。**節が変わると総入れ替え**(逃したら消える)
  //   k     … 売値の何倍で売られているか。STD〜SPE は5倍。
  //           重点スカウトはコインあたり 3.9倍なので、**確実さと選べることに
  //           25%の割増を払う**という関係になり、スカウトを引く理由が残る
  //   wcK   … WC だけは別格(実測 平均40,000コイン ≒ 34節ぶんの稼ぎ)。
  //           プロスカウト4,000の「12%でWC」と釣り合わせるための値
  //   sigK  … 実在選手(シグネチャ)はさらにその倍。約80,000 ≒ 67節ぶん
  //   wc/sig… 枠ごとに WC が並ぶ確率 / そのうち実在選手になる割合
  // **LEGENDS は並ばない**。実績(→§3.52)と引換券(→§3.42)の取り分として残す
  //   ovrK  … 段の下限からの伸びぶん。**売却カーブは買値には平らすぎる**。
  //           perOvr:6 だと OVR68 と OVR80 の SPECIALS が 2,800 と 3,200 にしかならず、
  //           能力が見えている市場では「一番高いOVRを買うだけ」になる
  //   rar   … WC を引かなかったときの段の内訳
  //   sigMin… 実在選手の下限。倍率だけだと OVR の低い個体が 68,700 まで落ちて
  //           「まれな一枚」に見えなくなるので、ここで底を打つ
  market:{ slots:6, k:3.9, wcK:23, sigK:2, sigMin:80000, ovrK:0.05, wc:0.08, sig:0.15,
           rar:{ SPE:0.34, REG:0.40, STD:0.26 } },
  // キープレイヤー(→docs/03 §3.44)。試合中に1人だけ「軸」に指名できる。
  //   power … 能力に掛かる倍率。**集まりやすさも強さも、これ1つから出る**
  //           (atk が上がれば受け手に選ばれ、def/spd が上がれば1:1に呼ばれる)
  //   skill … スキルの抽選重み。**確定発動はしない**
  //   mark  … 軸に対して相手の守備スコアが上がる割合(代償)
  //   stam  … 軸でいるあいだの消耗の増え方(代償)。**軸を張った時間ぶんだけ残る**
  kp:{ power:1.18, skill:1.35, mark:1.10, stam:1.30, manMark:1.16 },
  // 決定機の質(→docs/07 §7.21)。**シュートの成否を撃った本人だけで決めない**。
  //   chanceK   … アシストの質がシュートスコアに掛かる強さ
  //   chanceMid … 「並のアシスト」の基準(能力の 0..1 換算)。ここで倍率1になる
  //   chanceLo/Hi … 効き幅の上限下限
  // mid が 0.50 ではなく 0.56 なのは**水準合わせ**。倍率の平均が1でも、
  // しきい値を跨ぐ判定では「上振れの得」が「下振れの損」より大きく効くので、
  // そのままだと得点が 2.79 → 3.16 に増えてしまう(実測)。
  chance:{ k:1.80, mid:0.56, lo:0.35, hi:1.65 },
  // 決定機阻止(→docs/07 §7.19)。**守備側にも「1人で決める場面」を作る**。
  // シュートは撃った本人が1人で決めるのに、守備は面(coverOf)で割られるため、
  // 同じOVRでも前線のカードが後ろの5.8倍の価値になっていた(→docs/03 §3.38)。
  //   h    … これより深い位置のシュートだけが対象(=決定機)
  //   defW … 守り手のスコアで def が占める割合(残りは spd = 戻り足)
  //   atkW … 撃ち手のスコアで atk が占める割合(残りは撃ち方の能力)
  //   th   … 守り手のスコアがこれ倍を超えたら間に合う
  lastMan:{ h:0.74, defW:0.70, atkW:0.55, th:2.00 },
  // 各スコアに乗る揺らぎ rr() = min + random×span
  rng:{ min:0.60, span:0.80 },
  // 攻撃1回がシュートまで到達する率(連鎖を実装するまでの暫定の入口)。
  // 起点で稼いだ前進(prog)が高いほど届きやすい: toShot × (progLo + prog×progK)
  // originK は起点の攻撃側スコア全体に掛かる係数(ORIGINS の表は相対値のままにする)
  atk:{ toShot:0.70, homeAdv:1.06, progLo:0.45, progK:1.10, originK:3.34 },
  // 起点のマッチアップ(→docs/07 §7.8)。座標が近い相手ほど対応しやすい。
  //   sigmaH/sigmaX … 高さ/左右のばらつき(大きいほど遠くの選手も関与する)
  //   atkW/defW     … 攻守スコアの「総合力(atk/def)」の比率。**残りはチャンネルと同じ能力**。
  //                   両側を同じ形にしてあるので、調整のとき鏡像で読める。
  //                   atkW を defW より小さくしているのは、atk の役割差が大きく
  //                   (DF 8.0 対 FW 18.5)、大きくすると起点の勾配が潰れるため。
  //   cov*  … 守備の厚み(→§7.14)。ボール周辺の守備者数で守備スコアを底上げする。
  //           covBase を超えた**支援の人数**だけが効く(マーカー本人は勘定に入れない)
  matchup:{ sigmaH:0.22, sigmaX:0.30, atkW:0.25, defW:0.60, markSpd:0.55, markDef:1.20,
            covQ0:0.30, covQ:0.80,
            covH:0.26, covX:0.34, covBase:1.00, covK:0.085 },
  // --- 連鎖(→docs/07 §7.9) ---
  //   maxLinks  1回の攻撃でつなげる上限(これを超えたら撃つ)
  //   shot*     シュートに移行する率: base + 高さ×depth + つないだ数×step
  //   sigmaH/X  受け手を選ぶときの高さ/左右のばらつき
  //   lane*     lane 規則ごとの左右のばらつき
  //   gainJitter 前進量のゆらぎ(±の割合)
  chain:{ maxLinks:4, shotBase:0.02, shotDepth:0.85, shotCurve:3.0, shotStep:0.06,
          shotAtkLo:0.30,   // 撃つ判断に乗る「撃てる選手か」の下限(atk0でこの倍率)
          sigmaH:0.20, sigmaX:0.26, recvAtk:1.60,
          laneTight:8, laneNormal:16, laneWide:34, gainK:1.00, gainJitter:0.5, toJitter:0.12,
          repeatW:0.30,     // 直前と同じチャンネルを選ぶ重み(同じ札の連発を避ける)
          strayFull:0.45, strayFloor:0.15, strayPass:1.20 },  // 枠から離れるほど carry を諦めて渡す
  // --- モメンタム(勢い → docs/07 §7.7) ---
  // -1..+1 の1本のゲージ。+ がホーム優勢。**起点の高さ**を決める。
  //   kickK   キックオフ時: (OVR差 / kickK) を初期値にする
  //   kickCap その初期値の上限(強豪でも一方的に始まらないように)
  //   decay   毎ティック中立へ戻る率(流れは移ろう)
  //   spread  モメンタムが起点の高さを動かす幅
  //   sigma   高さの選好のばらつき(大きいほどランダム寄り)
  //   sigma … 起点の抽選が「モメンタムが決めた高さ」からどれだけ広く拾うか。
  //           0.18 の頃は DMF が起点の半分(13.4/28)を独占し、CBは3.2しか無かった。
  //           0.30 にすると CB 4.6 / DMF 9.3 になり、DMFが主役なのは保ったまま偏りが緩む
  mom:{ kickK:60, kickCap:0.45, decay:0.90, cap:1.0, spread:0.55, sigma:0.30,
        // duelWon/duelLost … 連鎖の1マッチアップごとの増減(勢いの主な動力)
        goal:0.54, shot:0.16, save:0.19, block:0.14, miss:0.08,
        duelWon:0.09, duelLost:0.17 },
  // 暫定リゾルバ(第3段で match-core の本実装に置き換える)
  sim:{ base:1.15, spread:22, homeAdv:0.18, maxGoals:6 },
};
