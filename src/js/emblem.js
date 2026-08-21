// ================= クラブのエンブレム(→docs/03 §3.54) =================
// **絵を1枚も持たずに描く**。クラブは 144 + カップの架空名 40 の 184 個あり、
// 汎用のパターン画像を数枚用意しても「15クラブが同じ絵柄」になって個性が減る。
// 形 × 地の柄 × 紋章 × 色相 の組み合わせなら、全部に別の顔を配れて index.html も太らない。
//
// **クラブIDから決まる**(世界のたねと同じ流儀)。クラブを足せばエンブレムも生える。
// 自分のクラブだけは CLUB 画面で好きに組み替えられる(→S.club.emblem)。

const EMB_SHAPES=["shield","round","oval","pointed","banner"];
const EMB_FIELDS=["solid","stripe","half","quarter","sash","hoop","chevron","cross","saltire"];
// 紋章。**文字の代わりに置ける**(→docs/03 §3.54)。どれも 100x100 の中で完結させる。
// 中身は**描いた意匠を輪郭追跡してパスにしたもの**(→§3.54b / EMB_ART)。
// 星だけは直線と角度で決まるので手で持っている。
//
// 剣・稲妻・塔・ボールは**外した**(→§3.54c)。幾何で組んだ形は、輪郭で語る意匠と
// 並ぶと絵の密度が違いすぎて浮く。星は単純すぎるので逆に浮かない。
const EMB_CRESTS=["none","star","crown","eagle","lion","horse","helm",
                  "dragon","fleur","cannon","griffin","wyvern","athena"];
// 文字の並べ方(→§3.54c)。**2文字をどう置くか**で、紋章を持たないクラブにも個性が出る
const EMB_LAYS=["row","col","diag"];

/**
 * 選べる色(→docs/03 §3.54)。**色相だけ持つ**ので、明るさと彩度は
 * 既にある決まり(→docs/06 §6.13)がそのまま効く。
 * ホーム=地の色 / アウェイ=柄の色。
 */
const EMB_HUES=[
  // --- サッカーで実際によく使われる色 ---
  { id:"red",     hex:"#E11B22", name:"レッド" },
  { id:"crimson", hex:"#A5122B", name:"クリムゾン" },
  { id:"maroon",  hex:"#6B1F2E", name:"マルーン" },
  { id:"orange",  hex:"#F2751A", name:"オレンジ" },
  { id:"gold",    hex:"#F2B713", name:"ゴールド" },
  { id:"green",   hex:"#128A3E", name:"グリーン" },
  { id:"forest",  hex:"#0B5027", name:"フォレスト" },
  { id:"sky",     hex:"#4FB3E8", name:"スカイ" },
  { id:"royal",   hex:"#1B4FD8", name:"ロイヤル" },
  { id:"navy",    hex:"#172B54", name:"ネイビー" },
  { id:"purple",  hex:"#6B2FA0", name:"パープル" },
  { id:"black",   hex:"#1A1A1E", name:"ブラック" },
  { id:"white",   hex:"#F2F2EF", name:"ホワイト" },
  // --- インクカラー(いただいた見本そのまま) ---
  // **推測で作らない**。指定された hex をそのまま置く
  { id:"ink-violet",  hex:"#761AFF", name:"インクバイオレット" },
  { id:"ink-indigo",  hex:"#6E1BFF", name:"インクインディゴ" },
  { id:"ink-purple",  hex:"#AA1BFF", name:"インクパープル" },
  { id:"ink-blue",    hex:"#4422FF", name:"インクブルー" },
  { id:"ink-cyan",    hex:"#1BFAFF", name:"インクシアン" },
  { id:"ink-mint",    hex:"#23FFB5", name:"インクミント" },
  { id:"ink-green",   hex:"#23FF17", name:"インクグリーン" },
  { id:"ink-lemon",   hex:"#F8FF26", name:"インクレモン" },
  { id:"ink-yellow",  hex:"#FFF021", name:"インクイエロー" },
  { id:"ink-orange",  hex:"#FFB530", name:"インクオレンジ" },
  { id:"ink-magenta", hex:"#F215FF", name:"インクマゼンタ" },
  { id:"ink-pink",    hex:"#FF21B2", name:"インクピンク" },
  { id:"ink-rose",    hex:"#FF1F91", name:"インクローズ" },
];
/**
 * その色の明るさ(0..1)。**字を白にするか黒にするか**を決めるのに使う。
 * インクカラーはレモンのように非常に明るいものがあり、白字だと消える。
 */
function embLum(hex){
  const v=String(hex||"").replace("#","");
  if(v.length<6)return 0.5;
  const r=parseInt(v.slice(0,2),16)/255, g=parseInt(v.slice(2,4),16)/255,
        b=parseInt(v.slice(4,6),16)/255;
  return 0.2126*r+0.7152*g+0.0722*b;      // sRGB の相対輝度(ざっくり)
}
/** 少し暗くした色(縁や字の縁取りに使う)。 */
function embShade(hex,k){
  const v=String(hex||"").replace("#","");
  if(v.length<6)return hex;
  const f=x=>Math.max(0,Math.min(255,Math.round(parseInt(x,16)*k)));
  const h=n=>n.toString(16).padStart(2,"0");
  return "#"+h(f(v.slice(0,2)))+h(f(v.slice(2,4)))+h(f(v.slice(4,6)));
}
const embHueById=id=>EMB_HUES.find(x=>x.id===id)||null;

// 盾の輪郭。clip と縁取りで同じパスを使う
const EMB_PATH={
  shield: "M50 4 L92 18 V52 Q92 84 50 96 Q8 84 8 52 V18 Z",
  round:  "M50 4 A46 46 0 1 1 49.9 4 Z",
  // 縦長の楕円。丸より紋章が縦に伸びるので、鳥や兜が収まりやすい
  oval:   "M50 2 A31 48 0 1 1 49.9 2 Z",
  pointed:"M50 3 L93 20 V50 Q93 82 50 97 Q7 82 7 50 V20 Z",
  banner: "M12 6 H88 V70 Q88 84 50 96 Q12 84 12 70 Z",
};

/**
 * クラブ名から読み取る顔(→docs/03 §3.54d)。**名前が既に答えを持っている。**
 *
 * クラブ名は実在クラブの愛称をもとにしていて、**色と生き物の語が入っている**。
 * 「ミラノ・ロッソネーリ」は赤と黒、「レシフェ・レオン」は獅子、
 * 「ロンドン・ガナーズ」は大砲。ここに乱数を当てる理由がない。
 *
 *   [語, ホーム, アウェイ, 紋章]  … アウェイと紋章は省略可
 *
 * 紋章の欄は3通り。**意匠名**なら出す、**空文字**なら何も出さない(その語は
 * 紋章に無い生き物を名乗っている)、**省略**ならハッシュに任せる。
 *
 * **上から順に見て、最初に当たったものを使う。** 複合語を先に置くこと
 * (`ロッソネーリ` を `ロッソ` より先に見ないと、黒が落ちる)。
 */
const EMB_WORDS=[
  // --- 2色を名乗るもの。**まとめて言い切っている**ので最優先 ---
  ["ビアンコネーリ","white","black"],   ["ロッソネーリ","red","black"],
  ["ネラッズーリ","royal","black"],     ["ジャッロロッシ","crimson","gold"],
  ["ジャッロブル","gold","royal"],      ["ロッソブル","red","royal"],
  ["ロザネロ","ink-pink","black"],      ["アランチョネロ","orange","black"],
  ["シュヴァルツゲルプ","gold","black"],["グリューンヴァイス","green","white"],
  ["ルージュブラン","red","white"],     ["ルージュノワール","red","black"],
  ["マリーヌエブラン","navy","white"],  ["シエルエマリーヌ","sky","navy"],
  ["ブランキビオレタ","white","purple"],["ロヒブランコス","red","white"],
  ["フランヒベルデス","white","green"], ["ブラウグラナ","maroon","royal"],
  ["ルブロネグロ","red","black"],       ["フーブロネグロ","red","black"],
  ["スカイブルーズ","sky","white"],     ["ブラックキャッツ","black","red",""],
  // --- 生き物・意匠を名乗るもの。**紋章はここで決まる** ---
  ["ガナーズ","red","white","cannon"],
  ["グリフォーニ","red","navy","griffin"],
  ["アドラー","black","red","eagle"],       ["エーグロン","red","black","eagle"],
  ["ライオンズ","crimson","white","lion"],  ["レオネス","red","white","lion"],
  ["レーヴェン","gold","royal","lion"],     ["レオン","red","black","lion"],
  ["カヴァルッチ","white","black","horse"], ["フォーレン","white","green","horse"],
  ["リコルヌ","white","royal","horse"],
  ["ローテトイフェル","red","white","dragon"],
  ["オリンピアン","sky","white","athena"],  ["オリンピスタ","white","black","athena"],
  ["レアレス","royal","white","crown"],     ["ヴィオラ","purple","white","fleur"],
  // --- 色の語。**綴りの長いほうを先に** ---
  ["ブランコス","white","royal"],  ["ブランキ","white","royal"],
  ["ホワイツ","white","royal"],    ["ヴァイス","white","red"],
  ["ブラン","white","royal"],
  ["マグパイズ","black","white",""],  ["シュヴァルツ","black","gold"],
  ["ノワール","black","white"],    ["ネグロ","black","white"],
  ["チマォン","black","white"],    ["カルボネーロ","black","gold"],
  ["ガロ","black","white",""],        ["スコイスト","black","white"],
  ["レッズ","red","white"],        ["ローテン","red","white"],
  ["ローテ","red","white"],        ["ルージュ","red","white"],
  ["ロヒ","red","white"],          ["コロラド","red","white"],
  ["ベルメジョネス","red","black"],["ロッソ","red","white"],
  ["コップ","red","white"],        ["ブレイズ","red","white"],
  ["セインツ","red","white"],      ["ポッターズ","red","white",""],
  ["グラナータ","maroon","white"], ["グルナ","maroon","white"],
  ["ヴィランズ","maroon","sky"],
  ["ジャッロ","gold","royal"],     ["アマリージョス","gold","royal"],
  ["カナリーズ","gold","green",""],   ["カナリーニ","gold","royal",""],
  ["カナリ","gold","green",""],       ["スブマリノ","gold","royal",""],
  ["アティグレス","gold","black",""], ["ボンボネーラ","royal","gold"],
  ["カナージャ","royal","gold"],
  ["タイガース","orange","black",""], ["メルル","orange","black",""],
  ["ヴェルダン","green","white"],  ["ヴェール","green","white"],
  ["ベルデ","green","white"],      ["ベティコス","green","white"],
  ["エスメラウジーノ","green","white"], ["アスカレロス","green","white"],
  ["フッゲライ","green","white"],  ["ラシンギスタス","white","green"],
  ["カリファレス","white","green"],
  ["フォレスターズ","forest","white"],  ["パイルグリムズ","forest","white"],
  ["スカイ","sky","white"],        ["セレステス","sky","white"],
  ["チェレスティ","sky","white"],  ["パルテノペイ","sky","white"],
  ["シーガルズ","sky","white",""],
  ["マリーヌ","navy","white"],     ["キャピタル","navy","red"],
  ["スパーズ","white","navy"],     ["ドーグ","red","navy",""],
  ["ヴィオレ","purple","white"],
  ["ブルーズ","royal","white"],    ["アッズッリ","royal","white"],
  ["ブル","royal","white"],
  // --- 色を名乗ってはいないが、由来のはっきりするもの ---
  ["コルチョネロス","red","white"],  ["ネルビオン","white","red"],
  ["ナサリエス","red","white"],      ["ピメントネロス","red","white"],
  ["チェ","white","orange"],         ["マニョス","white","royal"],
  ["マンチェゴス","white","royal"],  ["チチャレロス","royal","white"],
  ["アスレホス","royal","white"],    ["カルバジョネス","royal","white"],
  ["フォクシーズ","royal","white",""],  ["ホーネッツ","gold","black",""],
  ["ローヴァーズ","royal","white"],  ["トラクターズ","royal","white",""],
  ["オロビチ","royal","black"],      ["フリウラーニ","white","black"],
  ["イゾラーニ","crimson","royal"],  ["ガッレッティ","white","red"],
  ["デルフィーニ","royal","white",""],  ["クロチャーティ","white","royal"],
  ["ロンディネッレ","royal","white",""],
  ["ヴェルクセルフ","red","black"],  ["クナッペン","royal","white"],
  ["ガイスボック","white","red",""],    ["ハウプトシュテッター","royal","white"],
  ["アルトマイスター","crimson","white"], ["ウンアプシュタイクバー","royal","white"],
  ["ライン","red","white"],          ["エルプフローレンツ","gold","black"],
  ["オストゼー","royal","white"],    ["アルミネン","royal","white"],
  ["ルールポット","red","white"],
  ["ゴーヌ","white","royal"],        ["サンエオール","red","white"],
  ["アルザシアン","royal","white"],  ["パイヨラン","royal","orange"],
  ["アイジェオワ","white","royal"],  ["ピラート","red","white",""],
  ["ムタルディエ","red","white",""],    ["ドーファン","royal","white",""],
  ["ミジョナリオス","white","red"],  ["ペイシェ","white","black",""],
  ["トリコロール","red","royal"],    ["コエーリョ","royal","white",""],
  ["レプロ","red","black"],          ["エスカラーダ","royal","red"],
  ["ヴォゾン","royal","red"],        ["アルボレータ","white","royal"],
  ["クレマ","white","crimson"],
];
/** 名前に入っている語。**最初に当たったもの**を返す(無ければ null)。 */
const embWordOf=name=>EMB_WORDS.find(w=>String(name||"").includes(w[0]))||null;
/**
 * 語を持たないクラブの色(→§3.54d)。**サッカーで実際に使う13色から引く**。
 * インクカラーまで混ぜると、CPUのクラブが蛍光色だらけになってサッカーに見えない。
 */
const EMB_CLASSIC=["red","crimson","maroon","orange","gold","green","forest",
                   "sky","royal","navy","purple","black","white"];
/** 地の色に対して**読める相方**。明るい地には暗い柄、暗い地には白を返す。 */
const embMate=id=>{
  const H=embHueById(id);
  if(!H)return "white";
  return embLum(H.hex)>=0.55?"navy":"white";
};

/**
 * カタカナ → ラテン文字(→docs/03 §3.54)。**頭の1音だけ**を引く。
 * クラブ名は日本語なので、そのまま盾に入れるとカタカナが窮屈に収まる。
 * 実在クラブの紋章にならって、**2文字のモノグラム**にする。
 */
const EMB_ROMA={
  ア:"A",イ:"I",ウ:"U",エ:"E",オ:"O",
  カ:"K",キ:"K",ク:"K",ケ:"K",コ:"K",ガ:"G",ギ:"G",グ:"G",ゲ:"G",ゴ:"G",
  サ:"S",シ:"S",ス:"S",セ:"S",ソ:"S",ザ:"Z",ジ:"J",ズ:"Z",ゼ:"Z",ゾ:"Z",
  タ:"T",チ:"C",ツ:"T",テ:"T",ト:"T",ダ:"D",ヂ:"D",ヅ:"D",デ:"D",ド:"D",
  ナ:"N",ニ:"N",ヌ:"N",ネ:"N",ノ:"N",
  ハ:"H",ヒ:"H",フ:"F",ヘ:"H",ホ:"H",バ:"B",ビ:"B",ブ:"B",ベ:"B",ボ:"B",
  パ:"P",ピ:"P",プ:"P",ペ:"P",ポ:"P",
  マ:"M",ミ:"M",ム:"M",メ:"M",モ:"M",
  ヤ:"Y",ユ:"Y",ヨ:"Y",
  ラ:"R",リ:"R",ル:"R",レ:"R",ロ:"R",
  ワ:"W",ヲ:"O",ン:"N",ヴ:"V",
};
/** 1文字ぶんのラテン。引けない字(長音・小書きなど)は null。 */
const embLetter=ch=>EMB_ROMA[ch]||null;
/**
 * 音節ぶんのローマ字(→docs/03 §3.54e)。EMB_ROMA は1文字＝1子音なので
 * 「バルサローナ」が BRS になり読めない。**綴りとして読める略号**を出すには
 * 音節ごとのローマ字が要る(ba+ru+sa → barusa → BAR)。
 */
const EMB_SYL={
  ア:"a",イ:"i",ウ:"u",エ:"e",オ:"o",
  カ:"ka",キ:"ki",ク:"ku",ケ:"ke",コ:"ko",ガ:"ga",ギ:"gi",グ:"gu",ゲ:"ge",ゴ:"go",
  サ:"sa",シ:"shi",ス:"su",セ:"se",ソ:"so",ザ:"za",ジ:"ji",ズ:"zu",ゼ:"ze",ゾ:"zo",
  タ:"ta",チ:"chi",ツ:"tsu",テ:"te",ト:"to",ダ:"da",ヂ:"ji",ヅ:"zu",デ:"de",ド:"do",
  ナ:"na",ニ:"ni",ヌ:"nu",ネ:"ne",ノ:"no",
  ハ:"ha",ヒ:"hi",フ:"fu",ヘ:"he",ホ:"ho",バ:"ba",ビ:"bi",ブ:"bu",ベ:"be",ボ:"bo",
  パ:"pa",ピ:"pi",プ:"pu",ペ:"pe",ポ:"po",
  マ:"ma",ミ:"mi",ム:"mu",メ:"me",モ:"mo",
  ヤ:"ya",ユ:"yu",ヨ:"yo",
  ラ:"ra",リ:"ri",ル:"ru",レ:"re",ロ:"ro",
  ワ:"wa",ヲ:"o",ン:"n",ヴ:"v",
};
// 小書き。**直前の音節の母音を差し替える**(キ+ャ → kya)
const EMB_SMALL={ ャ:"ya",ュ:"yu",ョ:"yo",ァ:"a",ィ:"i",ゥ:"u",ェ:"e",ォ:"o" };
/** カタカナの語を綴りに開く。長音(ー)と促音(ッ)は落とす。 */
function embRomaji(word){
  let out="";
  for(const ch of String(word||"")){
    const sm=EMB_SMALL[ch];
    if(sm){                                          // 拗音・外来音は前の音とくっつける
      out=out.replace(/[aiueo]$/,"")+sm;
      continue;
    }
    const sy=EMB_SYL[ch];
    if(sy){ out+=sy; continue; }
    if(/[A-Za-z]/.test(ch))out+=ch.toLowerCase();    // ラテン名がそのまま来た場合
    // ー(長音)・ッ(促音)・その他は落とす
  }
  return out;
}
/**
 * クラブの**3文字の略号**(→docs/03 §3.54e)。頭の語を綴りに開いて頭3文字を採る。
 * 「バルサローナ・ブラウグラナ」→ BAR ／「マドリード・ブランコス」→ MAD。
 *
 * ヘッダーの左は紋章＋この略号だけにする。正式名称(最大120px)を置くと
 * **画面の見出しが右へ押し出されて中央に来ない**(→docs/06)。
 * 同じ都市のクラブは同じ略号になりうるが、ヘッダーに出るのは自分のクラブだけなので
 * ここでは重ならないことより**読めること**を採る。
 */
function clubAbbr(name){
  const head=String(name||"").split(/[・\s]+/).filter(Boolean)[0]||"";
  const r=embRomaji(head).toUpperCase();
  if(r.length>=3)return r.slice(0,3);
  // 3文字に満たない短い語は、次の語から足す(「シティ・…」など)
  const all=embRomaji(String(name||"").replace(/[・\s]+/g,"")).toUpperCase();
  return (all.slice(0,3)||embMonogram(name)).padEnd(3,"C").slice(0,3);
}
/**
 * クラブ名のモノグラム。**「・」で区切られた語の頭**を1文字ずつ拾う。
 * 「マンチェスター・レッズ」→ MR。語が1つなら頭の2音から2文字取る。
 */
function embMonogram(name){
  const parts=String(name||"").split(/[・\s]+/).filter(Boolean);
  const out=[];
  for(const w of parts){
    for(const ch of w){ const c=embLetter(ch); if(c){ out.push(c); break; } }
    if(out.length>=2)break;
  }
  if(out.length<2&&parts.length){
    // 語が1つしかない。頭の2音から取る(「ロドリ」→ RD)
    for(const ch of parts[0]){ const c=embLetter(ch); if(c&&out.length<2)out.push(c); }
  }
  if(!out.length){                                   // ラテン名がそのまま来た場合
    const s=String(name||"").replace(/[^A-Za-z]/g,"");
    return (s.slice(0,2)||"FC").toUpperCase();
  }
  return out.slice(0,2).join("");
}

/**
 * 紋章(→docs/03 §3.54)。**紋章学の意匠に寄せる**。
 *
 * 丸みのある塊で描くと、どうしても可愛らしく子供っぽくなる。実在の紋章は
 *   ・輪郭が**角ばっていて、切り込みが深い**(羽・鬣・王冠の刻み)
 *   ・**内側の抜き**で立体を出す(目・口・面の割り)
 *   ・盾いっぱいに大きく置く
 * の3点で「本物らしさ」が決まる。曲線を減らし、直線と鋭角で組み直してある。
 */
/**
 * モノグラムの並べ方(→docs/03 §3.54c)。**横・縦・斜めの3通り**。
 * 紋章を持たないクラブは3分の2あるので、文字の置き方だけで顔が変わると効きが大きい。
 *
 * 縦と斜めは**1文字ずつ置く**。`<text>` に改行は無く、`textLength` で潰すと字が歪む。
 */
function embTextPath(lay,text,ink,edge){
  const t=String(text||"");
  const font=' font-family="Georgia,&apos;Times New Roman&apos;,serif" font-weight="700"'
    +' text-anchor="middle" fill="'+ink+'" stroke="'+edge+'"'
    +' stroke-width="5" paint-order="stroke"';
  const one=(ch,x,y,sz,rot)=>'<text x="'+x+'" y="'+y+'" font-size="'+sz+'"'
    +(rot?' transform="rotate('+rot+' '+x+' '+y+')"':"")+font+'>'+esc(ch)+'</text>';
  if(lay==="col")
    // 縦積み。**字を少し小さく**しないと、盾のすぼまりに肩が当たる
    return one(t[0]||"",50,45,34)+one(t[1]||"",50,81,34);
  if(lay==="diag")
    // 斜め。**たすき(sash)と同じ向き**に流すので、地の柄と喧嘩しない
    return one(t[0]||"",34,44,34,-30)+one(t[1]||"",66,74,34,-30);
  return '<text x="50" y="65" font-size="40" letter-spacing="-2"'+font+'>'+esc(t)+'</text>';
}
function embCrestPath(kind,ink,edge){
  const st=' fill="'+ink+'" stroke="'+edge+'" stroke-width="2.2" paint-order="stroke"';
  const cut=' fill="'+edge+'"';
  // **描いた意匠が先**(→docs/03 §3.54b)。生き物や兜のように輪郭で語る形は、
  // 手で座標を置くと必ずどこか可愛くなる。輪郭追跡したパスをそのまま使う。
  // ベクターなので**クラブの2色がそのまま乗る**。穴は evenodd に任せる
  const art=(typeof EMB_ART!=="undefined")&&EMB_ART[kind];
  if(art)return '<path fill-rule="evenodd" d="'+art+'"'+st+'/>';
  // ここから下は**幾何で組んだほうが綺麗なもの**。星や剣は直線と角度で決まるので、
  // 描いた絵を追跡するとかえって辺が揺れる
  switch(kind){
    // 星(マレット)。**5つの尖りを細長く**。太いと漫画の星になる
    case "star":  return '<path d="M50 16 L57.5 41 L84 41 L62.5 56.5 L70.5 82 L50 66.5'
                        +' L29.5 82 L37.5 56.5 L16 41 L42.5 41 Z"'+st+'/>';
    default:      return "";
  }
}
/**
 * 外装(→docs/03 §3.54)。**盾の外**に付ける。
 * 盾の中の紋章とは役割が違い、こちらは「格」を語る飾り。
 * 盾を縮めず、viewBox を外へ広げて描くので、付けても中身は小さくならない。
 */
const EMB_ORNS=["none","crown","laurel","ribbon","wreath"];
/** その外装がはみ出す量(上・下)。viewBox を広げるのに使う。 */
function embOrnPad(kind){
  switch(kind){
    case "crown":  return { t:58, b:0,  x:4 };
    case "ribbon": return { t:0,  b:30, x:12 };
    case "wreath": return { t:52, b:30, x:27 };
    default:       return { t:0,  b:0,  x:0 };
  }
}
function embOrnPath(kind,gold,dark){
  const st=' fill="'+gold+'" stroke="'+dark+'" stroke-width="2.2" paint-order="stroke"';
  const crown='<g transform="translate(15,-62) scale(0.7)">'
    +'<path fill-rule="evenodd" d="'+EMB_ART.crown+'" fill="'+gold+'"'
    +' stroke="'+dark+'" stroke-width="3.2" paint-order="stroke"/></g>';
  // 月桂樹。**葉を1枚ずつ置く**(束で描くと草の塊になる)
  const leaf=(cx,cy,rot,sc)=>'<path transform="translate('+cx+','+cy+') rotate('+rot+') scale('+sc+')"'
    +' d="M0 0 C6 -5 14 -4 17 2 C12 8 4 7 0 0 Z"'+st+'/>';
  /**
   * 月桂樹の枝。**中心(50,52)・半径44の円弧を素直になぞる**。
   * 以前は「縦線を中央でくぼませる」式で置いていたが、それは真ん中が一番内側に
   * 入る砂時計の形で、円のラインにならなかった。
   *
   * 葉の向きは**接線と外向き法線の中間**。φ を上からの角度とすると
   * 接線 = φ-180、法線 = φ-90 なので、葉 = φ-135 で出る。
   */
  const bough=side=>{
    const CX=50, CY=52, R=44, A0=32, A1=166, N=10;
    const rad=d=>d*Math.PI/180;
    const P=phi=>[CX+side*R*Math.sin(rad(phi)), CY-R*Math.cos(rad(phi))];
    let stem="M";
    for(let i=0;i<=16;i++){
      const q=P(A0+(A1-A0)*i/16);
      stem+=(i?" L":"")+q[0].toFixed(1)+" "+q[1].toFixed(1);
    }
    let g='<path d="'+stem+'" fill="none" stroke="'+gold+'" stroke-width="4.4"'
         +' stroke-linecap="round"/>'
         +'<path d="'+stem+'" fill="none" stroke="'+dark+'" stroke-width="1.4"'
         +' stroke-linecap="round"/>';
    for(let i=0;i<N;i++){
      const t=i/(N-1), phi=A0+(A1-A0)*t, q=P(phi);
      const sc=0.94-Math.abs(t-0.5)*0.42;
      const r0=phi-135;                       // 外側(大きい葉)
      // 左側は鏡像。葉のもとの形が +x を向いているので 180 から引く
      g+=leaf(q[0],q[1], side>0?r0:(180-r0), sc);
      g+=leaf(q[0],q[1], side>0?(r0-30):(210-r0), sc*0.7);
    }
    return g;
  };
  switch(kind){
    // **盾の中と同じ意匠を縮めて載せる**(→docs/03 §3.54b)。
    // 別に描くと、紋章の王冠と外装の王冠が食い違う
    case "crown": return '<g transform="translate(10,-70) scale(0.8)">'
                        +'<path fill-rule="evenodd" d="'+EMB_ART.crown+'" fill="'+gold+'"'
                        +' stroke="'+dark+'" stroke-width="3" paint-order="stroke"/></g>';
    case "laurel": return bough(-1)+bough(1);
    case "ribbon": return ""
      // 折り返した端(奥に回る面)。**先に暗い面を敷く**と紙が巻いて見える
      +'<path d="M4 96 L22 100 L22 116 L12 122 L16 112 L2 110 Z" fill="'+dark+'"/>'
      +'<path d="M96 96 L78 100 L78 116 L88 122 L84 112 L98 110 Z" fill="'+dark+'"/>'
      // 本体。中央がたわむ帯
      +'<path d="M22 98 Q50 112 78 98 L78 116 Q50 130 22 116 Z"'+st+'/>'
      +'<path d="M22 98 V116" stroke="'+dark+'" stroke-width="2" fill="none"/>'
      +'<path d="M78 98 V116" stroke="'+dark+'" stroke-width="2" fill="none"/>';
    case "wreath": return bough(-1)+bough(1)+crown
      +'<path d="M10 98 L26 102 L26 116 L16 122 L20 112 L8 110 Z" fill="'+dark+'"/>'
      +'<path d="M90 98 L74 102 L74 116 L84 122 L80 112 L92 110 Z" fill="'+dark+'"/>'
      +'<path d="M26 100 Q50 112 74 100 L74 116 Q50 128 26 116 Z"'+st+'/>';
    default:       return "";
  }
}
/** 地の柄。2色目(b)で描く。 */
function embFieldPath(kind,b){
  switch(kind){
    case "stripe": return [22,44,66].map(x=>'<rect x="'+x+'" y="0" width="11" height="100" fill="'+b+'"/>').join("");
    case "half":   return '<rect x="50" y="0" width="50" height="100" fill="'+b+'"/>';
    case "quarter":return '<rect x="50" y="0" width="50" height="50" fill="'+b+'"/>'
                         +'<rect x="0" y="50" width="50" height="50" fill="'+b+'"/>';
    case "sash":   return '<path d="M0 78 L78 0 H100 L0 100 Z" fill="'+b+'"/>';
    case "hoop":   return '<rect x="0" y="30" width="100" height="16" fill="'+b+'"/>'
                         +'<rect x="0" y="60" width="100" height="16" fill="'+b+'"/>';
    case "chevron":return '<path d="M0 42 L50 14 L100 42 V62 L50 34 L0 62 Z" fill="'+b+'"/>';
    // 十字。**縦を少し細く**しないと、盾の中で横棒だけが目立つ
    case "cross":  return '<rect x="39" y="0" width="22" height="100" fill="'+b+'"/>'
                         +'<rect x="0" y="36" width="100" height="22" fill="'+b+'"/>';
    // ななめ十字(セント・アンドリュー)。盾の外まで伸ばして端で断つ
    case "saltire":return '<path d="M-10 6 L6 -10 L110 94 L94 110 Z" fill="'+b+'"/>'
                         +'<path d="M94 -10 L110 6 L6 110 L-10 94 Z" fill="'+b+'"/>';
    default:       return "";
  }
}

/**
 * そのクラブの意匠(→docs/03 §3.54)。**IDから決まる**ので毎回同じ顔になる。
 * 自分のクラブに `S.club.emblem` があればそれを優先する(CLUB画面で組み替えた形)。
 */
function embDesign(clubId,name){
  const mine=(typeof S!=="undefined"&&S&&S.club&&S.club.id===clubId&&S.club.emblem)||null;
  // **符号なしでずらす**。hashStr は 32bit いっぱいを返すので、`>>` だと
  // 負になって配列の外(undefined)を引く。実際に地の柄が消えた
  const h=hashStr("emb:"+clubId);
  const w=embWordOf(name);                           // 名前が名乗っている顔(→§3.54d)
  const d={
    shape:EMB_SHAPES[h%EMB_SHAPES.length],
    field:EMB_FIELDS[(h>>>5)%EMB_FIELDS.length],
    // **既定は文字**。紋章は3回に1回くらい出る(全部が紋章だと名前が読めない)。
    // ただし**名前が紋章を名乗っていれば必ずそれを出す**(→§3.54d)
    // 紋章は3段階(→§3.54d)。
    //   語が意匠を名乗る    → それを出す(レオン → 獅子)
    //   語が別の生き物を名乗る → **何も出さない**("" 印。カナリーズに獅子は付けない)
    //   どちらでもない      → 3回に1回くらいハッシュで出す
    crest:(w&&w[3])?w[3]
      :(w&&w[3]==="")?"none"
      :((h>>>9)%3===0)?EMB_CRESTS[1+((h>>>11)%(EMB_CRESTS.length-1))]:"none",
    // 外装も3回に1回くらい。**全部に王冠を載せると格が語れなくなる**
    orn:((h>>>15)%3===0)?EMB_ORNS[1+((h>>>17)%(EMB_ORNS.length-1))]:"none",
    // 文字の並べ方(→§3.54c)。横・縦・斜めの3通り
    lay:EMB_LAYS[(h>>>21)%EMB_LAYS.length],
    text:embMonogram(name),
    // **色も名前から引く**(→§3.54d)。名乗っていなければサッカーで使う13色から、
    // クラブIDで決まる1色を当てる(並び順ではないので、クラブを足してもずれない)
    home:(w&&w[1])||EMB_CLASSIC[(h>>>25)%EMB_CLASSIC.length],
  };
  d.away=(w&&w[2])||embMate(d.home);
  const out=mine?{ ...d, ...mine, text:mine.text||d.text }:d;
  // **一覧から消えた指定は既定へ戻す**(→§3.54c)。紋章を廃止したとき、
  // 昔の保存が指したままだと、紋章も文字も出ない空の盾になる
  if(!EMB_CRESTS.includes(out.crest))out.crest=d.crest;
  if(!EMB_ORNS.includes(out.orn))out.orn=d.orn;
  if(!EMB_LAYS.includes(out.lay))out.lay=d.lay;
  return out;
}

/**
 * ★(→docs/03 §3.54)。**ワールドクラブチャンピオンカップを獲った数**。
 * 3つで打ち止め。エンブレムの上に載る。
 */
function embStars(clubId){
  if(typeof S==="undefined"||!S||!S.player)return 0;
  if(!S.club||S.club.id!==clubId)return 0;          // 自分のクラブにだけ載る
  const t=(S.player.trophies||[]).find(x=>x.id==="world");
  return t?Math.min(TUNING.emblem.maxStar,t.n||1):0;
}

/**
 * エンブレムのSVG。**画像を持たない**ので、どの大きさでも輪郭が出る。
 *   size … 一辺のピクセル
 *   opts.stars … ★を出すか(既定は出す)
 * 色は clubHue と同じ色相から取る(→docs/06 §6.13 の色の決まりに合わせる)。
 */
function embSvg(clubId,name,size,opts){
  const o=opts||{};
  const d=embDesign(clubId,name);
  const i=CLUBS.findIndex(c=>c.id===clubId);
  const h2=hashStr("emb2:"+clubId);
  // **選んだ色があればそれを使う**(ホーム=地 / アウェイ=柄 →docs/03 §3.54)
  const ph=embHueById(d.home), pa=embHueById(d.away);
  const hue=ph?ph.h:(i>=0?((i*137.5+20)%360):(hashStr("hue:"+clubId)%360));
  const hue2=pa?pa.h:(hue+((h2%2)?150:40))%360;
  // 選んだ色は hex をそのまま使い、選んでいなければ色相から作る
  const a=ph?ph.hex:"oklch(0.72 0.22 "+hue.toFixed(1)+")";
  const b=pa?pa.hex:"oklch(0.38 0.14 "+hue2.toFixed(1)+")";
  // **地が明るいときは字を暗く**。レモンや白の上に白字を置くと消える
  const la=ph?embLum(ph.hex):0.62;
  const ink=la>=0.62?"#1A1A1E":"#FFFFFF";
  const rim=ph?embShade(ph.hex,la>=0.62?0.55:1.35):"oklch(0.93 0.06 "+hue.toFixed(1)+")";
  const path=EMB_PATH[d.shape]||EMB_PATH.shield;
  // **idはクラブごとに変える**。同じ画面に2つ出したとき clipPath がぶつかる
  const cid="ec"+String(clubId).replace(/[^A-Za-z0-9]/g,"")+(o.tag||"");
  const stars=o.stars===false?0:embStars(clubId);
  // ★も外装も**盾の外へ足す**。盾を縮めないので、付いた瞬間に中身が小さくならない
  const orn=(d.orn&&d.orn!=="none")?d.orn:null;
  const op=embOrnPad(orn);
  const top=(stars?18:0)+op.t, bot=op.b, side=op.x;
  const vb=(-side)+" "+(-top)+" "+(100+side*2)+" "+(100+top+bot);
  const gold="oklch(0.82 0.14 88)", dark="oklch(0.34 0.08 78)";
  const starRow=!stars?"":'<g>'+Array.from({length:stars},(_,k)=>{
      const x=50+(k-(stars-1)/2)*20;
      return '<path class="emb-star" transform="translate('+x+',-9) scale(0.34)" '
        +'d="M0 -22 L6.5 -7 L23 -7 L10 3 L15 19 L0 9 L-15 19 L-10 3 L-23 -7 L-6.5 -7 Z" '
        +'fill="oklch(0.88 0.16 92)" stroke="oklch(0.42 0.10 80)" stroke-width="4" '
        +'paint-order="stroke"/>';
    }).join("")+'</g>';
  return '<svg class="emb-svg" viewBox="'+vb+'" width="'+size+'" height="'+size+'" '
    +'role="img" aria-label="'+esc(name||"")+'">'
    +'<defs><clipPath id="'+cid+'"><path d="'+path+'"/></clipPath></defs>'
    // 月桂冠は**盾の後ろ**に回す(前に出すと盾の柄が隠れる)
    +(orn==="laurel"||orn==="wreath"?embOrnPath(orn==="wreath"?"laurel":"laurel",gold,dark):"")
    +'<g clip-path="url(#'+cid+')"><rect x="0" y="0" width="100" height="100" fill="'+a+'"/>'
    +embFieldPath(d.field,b)+'</g>'
    +'<path d="'+path+'" fill="none" stroke="'+rim+'" stroke-width="4"/>'
    +(d.crest&&d.crest!=="none"
      ? embCrestPath(d.crest,ink,b)
      : embTextPath(d.lay,d.text,ink,b))
    // 王冠とリボンは**盾の前**(重なっても手前に出す)
    +(orn==="crown"?embOrnPath("crown",gold,dark)
      :orn==="ribbon"?embOrnPath("ribbon",gold,dark)
      :orn==="wreath"?embOrnPath("crown",gold,dark)
        +embOrnPath("ribbon",gold,dark):"")
    +starRow
  +'</svg>';
}
