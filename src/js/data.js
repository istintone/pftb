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

// --- 能力 ---
// WCCF に由来し、上限は各20。OVR は6つの**合計**なので最大120になる。
// card-eleven と同じ6軸にすることで、試合ロジックを card-eleven の考え方の上で
// 差別化できるようにしてある(→docs/03 §3.13)。
const STAT_KEYS=["atk","def","pow","tec","spd","sta"];
const STAT_LABEL={ atk:"ATK", def:"DEF", pow:"POW", tec:"TEC", spd:"SPD", sta:"STA" };
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
const RARITY={
  STD: { label:"STANDARD",    abbr:"ST", ovr:[54,72],   skills:1, w:62, real:false, bg:"std", holo:null,
         note:"控え。クラブにはいるがレギュラーではない" },
  REG: { label:"REGULAR",     abbr:"RG", ovr:[68,86],   skills:2, w:30, real:false, bg:"reg", holo:null,
         note:"スタメン。クラブのメイン選手" },
  SPE: { label:"SPECIALS",    abbr:"SP", ovr:[82,98],   skills:3, w:8,  real:false, bg:"reg", holo:"sheen",
         note:"切り札。REGULAR と同じ地だが光る" },
  WC:  { label:"WORLD CLASS", abbr:"WC", ovr:[96,110],  skills:3, w:0,  real:true,  bg:"wc",  holo:"rainbow",
         note:"実在の現役選手。シルバー(Chrome)地に虹ホロ" },
  LEG: { label:"LEGENDS",     abbr:"LE", ovr:[100,116], skills:4, w:0,  real:true,  bg:"leg", holo:"gold",
         note:"実在の過去の名選手。黒地に金縁" },
};
/** 背景画像の種類。SPECIALS が REGULAR を共有するので5段でも4枚で足りる。 */
const CARD_BGS=[...new Set(Object.values(RARITY).map(r=>r.bg))];
const RAR_KEYS=Object.keys(RARITY);
// パックから出る段(実在選手の段は別経路で入手する)
const RAR_DROPS=RAR_KEYS.filter(k=>RARITY[k].w>0);

// --- スキル(ポジション別のプール。効果は第4段で実装する) ---
const SKILLS={
  GK:["セービング","反射神経","飛び出し判断","PKストップ","ハイボール処理"],
  DF:["対人守備","カバーリング","空中戦","ロングパス","オーバーラップ","クロス","スピード","タックル"],
  MF:["スルーパス","視野の広さ","キープ力","ボール奪取","ロングシュート","ドリブル","展開力","運動量"],
  FW:["決定力","ポストプレー","オフザボール","ドリブル突破","カットイン","フィニッシュ","スピード","空中戦"],
};

// --- フォーメーション ---
// 各枠は [細分ポジション, ピッチ上の位置(%)]。DECK画面の配置と編成の妥当性判定に使う。
const FORMATIONS={
  "4-4-2":[["GK",50,87],["LSB",14,72],["CB",38,76],["CB",62,76],["RSB",86,72],
           ["LMF",14,48],["CMF",38,52],["CMF",62,52],["RMF",86,48],["CF",38,18],["ST",62,18]],
  "4-3-3":[["GK",50,87],["LSB",14,72],["CB",38,76],["CB",62,76],["RSB",86,72],
           ["DMF",50,58],["CMF",26,46],["CMF",74,46],["LWG",14,20],["CF",50,14],["RWG",86,20]],
};
const DEFAULT_FORM="4-4-2";

// --- 打ち手(各節に1つ選ぶ。→docs/03 §3.2.3) ---
// WCCF を踏襲した3種。**効果の詳細は D16 で決める**ため、ここでは選択肢の定義だけを持つ。
// 1手 = 1エントリなので、後から足すのも効果を実装するのもこの表を触ればよい。
const HANDS=[
  { id:"train", icon:"💪", label:"訓練", desc:"選手の★が上がる（最大★5）",            done:"訓練" },
  { id:"bond",  icon:"🤝", label:"交流", desc:"選手同士の連携が上がる（最大3段階）",  done:"交流" },
  { id:"rest",  icon:"🛌", label:"休息", desc:"全員のメンタル回復。負傷者がいれば治療", done:"休息" },
];
const handById=id=>HANDS.find(h=>h.id===id);

// --- バランスダイヤル ---
// 確率・係数・閾値は必ずここに集約し、ロジック側へ数値を直書きしない(調整点を1か所に保つ)。
const TUNING={
  league:{ clubs:8, rounds:14 },        // 1リーグのクラブ数 / 節数(ホーム&アウェイ・休みなし)
  // 任期 = キャリア1周(→docs/03 §3.2.3)。節で通算し、シーズンとは切り離す。
  tenure:{ limit:96, extend:24, hardMax:120, extendRank:3 }, // extendRank位以内で延命
  squad:{ starters:11, bench:5 },
  // 枠適性(→docs/03 §3.14)。card-eleven を踏襲した3段。
  //   sub  サブポジションが一致 = 本来の力を出せる
  //   main サブは違うがメイン(大分類)が一致 = とりあえず使えるが本来の力は出ない
  //   none どちらも不一致 = ほぼ機能しない
  fit:{ sub:1.00, main:0.85, none:0.70 },
  // 収入(→docs/03 §3.5)。数値は暫定。
  reward:{ win:900, draw:400, lose:120, rankBase:2500, titleBonus:6000 },
  // 会長の評価。期待順位との差(上回るとプラス)で毎節動く。
  eval:{ start:50, max:100, perRank:6, floorDismiss:15 },
  // 期待順位: クラブの格と「持ち込んだ編成の強さ」の合成(→docs/03 §3.9)
  expect:{ squadWeight:0.45 },
  // 暫定リゾルバ(第3段で match-core の本実装に置き換える)
  sim:{ base:1.15, spread:22, homeAdv:0.18, maxGoals:6 },
};
