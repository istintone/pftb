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
  offer:"名声で届く範囲のクラブだけが声をかけてきます。"
    +"格の高いクラブほど期待順位が厳しく、下回ると解任が近づきます。"
    +"まずは無理のないクラブで実績を作り、名声を上げてから上を目指すのが定石です。",
  contract:"記入した監督名がそのまま署名になります。"
    +"契約は1シーズンで、シーズン末に続投か解任かが決まります。"
    +"任期そのものは96節(最大120節)で、シーズンとは切り離して数えます。",
  home:"監督が持っているデバイスです。"
    +"<br><b>秘書</b>は次に何をすればよいかを教えてくれます。"
    +"<br><b>CLUB NEWS</b>はクラブの今を映します。順位表を開かなくても状況が分かります。"
    +"<br>試合は SEASON から始めます。ここは進行の操作盤ではありません。",
  cards:()=>"集めた選手カードの一覧です。"
    +"<br><b>★</b> が自分のカードで、クラブを移っても連れて行けます。"
    +"★の無いカードはクラブからの貸与で、退任するとそのクラブに残ります。"
    +"<br>右上の数字は <b>OVR</b> = 6能力の合計(最大"+OVR_MAX+")です。",
  deck:()=>{
    const F=TUNING.fit;
    return "ピッチをタップして11人を並べます。"
      +"<br><b>丸の中</b>は<b>適性を掛けた実効値</b>です（素のOVRではありません）。"
      +"<b>枠線の色</b>がレアリティ、<b>地色</b>がクラブカラー。"
      +"<br>素のOVRは枠をタップした先の一覧と、カードの詳細で確認できます。"
      +"ベンチは枠に入っていないので素のOVRを出しています。"
      +"<br><br><b>枠適性</b> — 枠のポジション名の濃さが、その枠への適性を表します。"
      +"合っているほどはっきり読めます。"
      +'<div class="fit-legend">'
      +[["a","サブ一致",F.sub],["b","メインのみ",F.main],["c","不一致",F.none]]
        .map(([t,label,v])=>'<span class="fit-chip"><i class="sl-pos fit-'+t+'">POS</i>'
          +label+" "+Math.round(v*100)+"%</span>").join("")
      +"</div>"
      +"サブポジションが一致していれば本来の力が出ます。"
      +"メインだけ合っている選手はとりあえず使えますが力を出し切れず、"
      +"どちらも違う選手はほぼ機能しません。"
      +"<br>上の総合力は<b>配置込み</b>の値です。適性で目減りした分は「適性ロス」に出ます。";
  },
  season:()=>"任期"+TUNING.tenure.limit+"節のカレンダーです。上から下へ進みます。"
    +"<br>1つの節は<b>打ち手 → 大会 → 試合</b>の順に決めます。打ち手を選ぶまで試合には進めません。"
    +"<br>下の<b>任期の記録</b>は打った手とその結果です。クラブを移っても1本で続きます。"
    +"<br>上限に達しても進行中の大会は最後まで戦います。"
    +"決着した時点で延命(+"+TUNING.tenure.extend+"節)か任期終了かが決まります。",
  schedule:"参照用の日程表です。ここからは試合を始められません。"
    +"<br>リーグの日程は節に固定していません。カップ戦が割り込むためで、"
    +"リーグを選んだ節に次の1試合を消化します。",
  standings:"リーグの順位表です。"
    +"<br>会長の期待順位を下回り続けると評価が下がり、解任が近づきます。"
    +"期待順位はクラブの格と、就任時に持ち込んだ編成の強さから決まります。",
  clubhouse:"監督個人の資産を置く場所です。名声とトロフィーはクラブを移っても失われません。"
    +"<br><b>名声</b>が次にどのクラブから声がかかるかを決めます。",
  gallery:"各レアリティの見本です。<b>所持カードではありません</b>。タップで詳細が開きます。"
    +"<br>WORLD CLASS と LEGENDS は実在選手をモチーフにする段のためパックからは出ません。"
    +"トロフィーや実績など別の経路で配ります。",
  gacha:"コインかチケットを払ってカードを引きます。"
    +"<br>コインは施設投資とも取り合いになります。今を取るか先を取るかの判断です。",
  secretary:"秘書からの連絡です。次の一手の案内と、新しく使えるようになった機能を伝えます。",
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
  fit:{ sub:1.00, main:0.75, none:0.50 },
  // 収入(→docs/03 §3.5)。数値は暫定。
  reward:{ win:900, draw:400, lose:120, rankBase:2500, titleBonus:6000 },
  // 会長の評価。期待順位との差(上回るとプラス)で毎節動く。
  eval:{ start:50, max:100, perRank:6, floorDismiss:15 },
  // 期待順位: クラブの格と「持ち込んだ編成の強さ」の合成(→docs/03 §3.9)
  expect:{ squadWeight:0.45 },
  // 暫定リゾルバ(第3段で match-core の本実装に置き換える)
  sim:{ base:1.15, spread:22, homeAdv:0.18, maxGoals:6 },
};
