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
    return "ピッチの11枠に選手を並べます。"
      +"<br>枠をタップすると入れ替える選手を選べます。一覧は<b>適性の高い順</b>で、"
      +"行をタップすると入れ替え、<b>左端の「›」</b>でその選手の詳細が開きます。"
      +"<br><b>丸の中</b>は<b>適性を掛けた実効値</b>です（素のOVRではありません）。"
      +"<b>枠線の色</b>がレアリティ、<b>地色</b>がクラブカラー。"
      +"<br>素のOVRは枠をタップした先の一覧と、カードの詳細で確認できます。"
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

// --- フォーメーション(card-eleven から踏襲 → docs/03 §3.16) ---
// 各枠は [細分ポジション, ピッチ上の位置(%)]。DECK画面の配置と枠適性の判定に使う。
// **y は 13〜87 に収める**。87を超えると名前帯がゴールラインの外へ出る
// (card-eleven とはピッチの縦横比が違うので、座標をそのままは使えない)。
const FORMATIONS={
  "4-4-2":[["GK",50,87],["LSB",18,72],["CB",38,73],["CB",62,73],["RSB",82,72],["LMF",16,48],["CMF",38,50],
           ["CMF",62,50],["RMF",84,48],["ST",50,27],["CF",50,13]],
  "4-3-3":[["GK",50,87],["LSB",18,72],["CB",38,73],["CB",62,73],["RSB",82,72],["CMF",30,48],["DMF",50,58],
           ["CMF",70,48],["LWG",18,15],["CF",50,13],["RWG",82,15]],
  "3-5-2":[["GK",50,87],["CB",26,73],["CB",50,74],["CB",74,73],["LMF",12,48],["CMF",30,47],["DMF",50,58],
           ["CMF",70,47],["RMF",88,48],["ST",50,27],["CF",50,13]],
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
const ORIGINS={
  GK: [{id:"gkLong",  label:"ロングキック",   stat:"pow", risk:0.40, gain:0.55, to:0.60, kind:"pass",  lane:"any"},
       {id:"gkQuick", label:"速攻のスロー",   stat:"spd", risk:0.66, gain:0.30, kind:"pass",  lane:"out"},
       {id:"gkShort", label:"短い繋ぎ",       stat:"tec", risk:0.80, gain:0.08, kind:"pass",  lane:"same"}],
  CB: [{id:"cbCarry", label:"持ち上がり",     stat:"spd", risk:0.62, gain:0.28, kind:"carry", lane:"same"},
       {id:"cbVert",  label:"縦パス",         stat:"tec", risk:0.58, gain:0.38, kind:"pass",  lane:"same"},
       {id:"cbFeed",  label:"ロングフィード", stat:"pow", risk:0.38, gain:0.60, to:0.76, kind:"pass",  lane:"any"}],
  LSB:[{id:"sbOver",  label:"オーバーラップ", stat:"spd", risk:0.60, gain:0.40, kind:"carry", lane:"out"},
       {id:"sbInner", label:"インナーラップ", stat:"tec", risk:0.64, gain:0.32, kind:"carry", lane:"in"},
       {id:"sbEarly", label:"早いクロス",     stat:"pow", risk:0.44, gain:0.55, to:0.88, kind:"pass",  lane:"box"}],
  RSB:[{id:"sbOver",  label:"オーバーラップ", stat:"spd", risk:0.60, gain:0.40, kind:"carry", lane:"out"},
       {id:"sbInner", label:"インナーラップ", stat:"tec", risk:0.64, gain:0.32, kind:"carry", lane:"in"},
       {id:"sbEarly", label:"早いクロス",     stat:"pow", risk:0.44, gain:0.55, to:0.88, kind:"pass",  lane:"box"}],
  DMF:[{id:"dmSpray", label:"散らし",         stat:"tec", risk:0.78, gain:0.15, kind:"pass",  lane:"any"},
       {id:"dmDrive", label:"持ち出し",       stat:"spd", risk:0.60, gain:0.35, kind:"carry", lane:"same"},
       {id:"dmSwitch",label:"サイドチェンジ", stat:"pow", risk:0.52, gain:0.45, kind:"pass",  lane:"switch"}],
  CMF:[{id:"cmThru",  label:"スルーパス",     stat:"tec", risk:0.50, gain:0.55, to:0.82, kind:"pass",  lane:"same"},
       {id:"cmCarry", label:"持ち出し",       stat:"spd", risk:0.62, gain:0.35, kind:"carry", lane:"same"},
       {id:"cmOpen",  label:"展開",           stat:"pow", risk:0.72, gain:0.22, kind:"pass",  lane:"out"}],
  OMF:[{id:"omTurnUp",label:"前向きの持ち出し", stat:"tec", risk:0.66, gain:0.38, kind:"carry", lane:"same"},
       {id:"omTurn",  label:"反転ドリブル",   stat:"spd", risk:0.52, gain:0.50, kind:"carry", lane:"in"},
       {id:"omMid",   label:"ミドルシュート",   stat:"atk", risk:0.44, gain:0.62, kind:"shot",  lane:"same"}],
  LMF:[{id:"wmUp",    label:"サイドの駆け上がり", stat:"spd", risk:0.62, gain:0.38, kind:"carry", lane:"out"},
       {id:"wmIn",    label:"絞り込み",       stat:"tec", risk:0.64, gain:0.34, kind:"carry", lane:"in"},
       {id:"wmCross", label:"クロス",         stat:"pow", risk:0.46, gain:0.55, to:0.90, kind:"pass",  lane:"box"}],
  RMF:[{id:"wmUp",    label:"サイドの駆け上がり", stat:"spd", risk:0.62, gain:0.38, kind:"carry", lane:"out"},
       {id:"wmIn",    label:"絞り込み",       stat:"tec", risk:0.64, gain:0.34, kind:"carry", lane:"in"},
       {id:"wmCross", label:"クロス",         stat:"pow", risk:0.46, gain:0.55, to:0.90, kind:"pass",  lane:"box"}],
  CF: [{id:"cfPress",label:"前線からのプレス",stat:"def", risk:0.52, gain:0.55, kind:"carry", lane:"same"},
       {id:"cfTurn", label:"反転からの持ち上がり",stat:"tec",risk:0.66, gain:0.30, kind:"carry", lane:"in"},
       {id:"cfRun",   label:"裏抜け",     stat:"spd", risk:0.42, gain:0.62, kind:"carry", lane:"same"}],
  ST: [{id:"stBehind",label:"背後への抜け出し", stat:"spd", risk:0.44, gain:0.60, kind:"carry", lane:"same"},
       {id:"stLoose", label:"こぼれ球への詰め",stat:"atk",risk:0.60, gain:0.38, kind:"carry", lane:"box"},
       {id:"stStrike",label:"ダイレクトシュート",   stat:"pow", risk:0.40, gain:0.66, kind:"shot",  lane:"same"}],
  LWG:[{id:"wgLine",  label:"縦の突破",       stat:"spd", risk:0.52, gain:0.50, kind:"carry", lane:"out"},
       {id:"wgCut",   label:"カットイン",     stat:"tec", risk:0.56, gain:0.46, kind:"carry", lane:"in"},
       {id:"wgCross", label:"早いクロス",     stat:"pow", risk:0.48, gain:0.54, to:0.90, kind:"pass",  lane:"box"}],
  RWG:[{id:"wgLine",  label:"縦の突破",       stat:"spd", risk:0.52, gain:0.50, kind:"carry", lane:"out"},
       {id:"wgCut",   label:"カットイン",     stat:"tec", risk:0.56, gain:0.46, kind:"carry", lane:"in"},
       {id:"wgCross", label:"早いクロス",     stat:"pow", risk:0.48, gain:0.54, to:0.90, kind:"pass",  lane:"box"}],
};

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
  squad:{ starters:11, bench:5, subMax:3 },   // subMax = 1試合の交代枠
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
         // カットイン(→docs/06 §6.19)。盛り上がる局面は必ず、繋ぎは抽選で出す
         // 表示時間。演出は「帯→両者→決着語」で約1.0秒かかるので、
         // それに読む間を足した長さにする(短いと認知が追いつかない)
         cutMs:1700, goalMs:2600, kickMs:2000, cutMaxSpeed:2,
         cutJudge:620,   // 決着(勝者が光り敗者が沈む)を出すまでの間
         shotHold:1000,  // 「シュート!」を見せてから結果を出すまでの間
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
  fatigue:{ perMin:0.0040, perAct:0.0260, staReduce:0.45, minStam:0.30,
            lineFree:0.20, linePenalty:0.85 },
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
  // --- 試合エンジン(→docs/03 §3.19 / docs/07-match-engine.md) ---
  // 時計。3分刻みで、ハーフごとにアディショナルタイムが付く。
  match:{ tickMin:3, halfTicks:15, atMax:[2,3] },   // 45分=15ティック / AT 前半0〜2・後半0〜3
  // 支配率(中盤の押し合い)。攻撃権はこの比で抽選する。
  mid:{ tec:0.45, spd:0.30, sta:0.25, mf:1.00, other:0.32 },
  // 判定の閾値: 攻撃側スコア > 守備側スコア × 閾値 で成功(card-eleven から踏襲)
  th:{ shot:0.86, origin:1.00, block:1.36, rebound:1.00 },
  // シュートの距離減衰(→docs/07 §7.9)。h=1 がゴール前、0 が自陣ゴール前。
  //   deadZone この高さ以下はほぼ入らない / minRange その下限 / rangePow 減衰の効き
  //   gkDef/gkPow/gkTec  GKのセーブの配合(合計1.0)
  //   accBase/accTec/accRange  枠に飛ぶ率 = (accBase + tec/20×accTec) × near^accRange
  //   rebound                  セーブがこぼれる率(そのあと詰める勝負になる)
  shot:{ deadZone:0.25, minRange:0.04, rangePow:1.00,
         gkDef:0.65, gkPow:0.20, gkTec:0.15,
         accBase:0.30, accTec:0.45, accRange:0.55, rebound:0.30,
         reboundH:0.95, reboundMax:4 },  // 詰める位置(ゴール前) / 連続の上限(安全網)
  // 各スコアに乗る揺らぎ rr() = min + random×span
  rng:{ min:0.60, span:0.80 },
  // 攻撃1回がシュートまで到達する率(連鎖を実装するまでの暫定の入口)。
  // 起点で稼いだ前進(prog)が高いほど届きやすい: toShot × (progLo + prog×progK)
  // originK は起点の攻撃側スコア全体に掛かる係数(ORIGINS の表は相対値のままにする)
  atk:{ toShot:0.70, homeAdv:1.06, progLo:0.45, progK:1.10, originK:3.30 },
  // 起点のマッチアップ(→docs/07 §7.8)。座標が近い相手ほど対応しやすい。
  //   sigmaH/sigmaX … 高さ/左右のばらつき(大きいほど遠くの選手も関与する)
  //   atkW/defW     … 攻守スコアの「総合力(atk/def)」の比率。**残りはチャンネルと同じ能力**。
  //                   両側を同じ形にしてあるので、調整のとき鏡像で読める。
  //                   atkW を defW より小さくしているのは、atk の役割差が大きく
  //                   (DF 8.0 対 FW 18.5)、大きくすると起点の勾配が潰れるため。
  matchup:{ sigmaH:0.22, sigmaX:0.30, atkW:0.25, defW:0.75 },
  // --- 連鎖(→docs/07 §7.9) ---
  //   maxLinks  1回の攻撃でつなげる上限(これを超えたら撃つ)
  //   shot*     シュートに移行する率: base + 高さ×depth + つないだ数×step
  //   sigmaH/X  受け手を選ぶときの高さ/左右のばらつき
  //   lane*     lane 規則ごとの左右のばらつき
  //   gainJitter 前進量のゆらぎ(±の割合)
  chain:{ maxLinks:4, shotBase:0.02, shotDepth:0.85, shotCurve:3.0, shotStep:0.06,
          shotAtkLo:0.30,   // 撃つ判断に乗る「撃てる選手か」の下限(atk0でこの倍率)
          sigmaH:0.20, sigmaX:0.26,
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
  mom:{ kickK:60, kickCap:0.45, decay:0.90, cap:1.0, spread:0.55, sigma:0.18,
        // duelWon/duelLost … 連鎖の1マッチアップごとの増減(勢いの主な動力)
        goal:0.54, shot:0.16, save:0.19, block:0.14, miss:0.08,
        duelWon:0.09, duelLost:0.17 },
  // 暫定リゾルバ(第3段で match-core の本実装に置き換える)
  sim:{ base:1.15, spread:22, homeAdv:0.18, maxGoals:6 },
};
