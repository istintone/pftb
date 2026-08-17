// ================= クラブのエンブレム(→docs/03 §3.54) =================
// **絵を1枚も持たずに描く**。クラブは 144 + カップの架空名 40 の 184 個あり、
// 汎用のパターン画像を数枚用意しても「15クラブが同じ絵柄」になって個性が減る。
// 形 × 地の柄 × 紋章 × 色相 の組み合わせなら、全部に別の顔を配れて index.html も太らない。
//
// **クラブIDから決まる**(世界のたねと同じ流儀)。クラブを足せばエンブレムも生える。
// 自分のクラブだけは CLUB 画面で好きに組み替えられる(→S.club.emblem)。

const EMB_SHAPES=["shield","round","oval","pointed","banner"];
const EMB_FIELDS=["solid","stripe","half","quarter","sash","hoop","chevron","cross","saltire"];
// 紋章。**文字の代わりに置ける**(→docs/03 §3.54)。どれも 100x100 の中で完結させる
const EMB_CRESTS=["none","star","crown","wing","bird","wolf","helm","ball","tower","laurel","bolt"];

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

/** 紋章の中身。**色は呼び出し側が渡す**(地の柄の上に載るので明るい側で描く)。 */
function embCrestPath(kind,ink,edge){
  const st=' fill="'+ink+'" stroke="'+edge+'" stroke-width="2" paint-order="stroke"';
  switch(kind){
    case "star":  return '<path d="M50 22 L58 43 L81 43 L62 57 L69 79 L50 65 L31 79 L38 57 L19 43 L42 43 Z"'+st+'/>';
    case "crown": return '<path d="M22 66 L26 34 L38 48 L50 28 L62 48 L74 34 L78 66 Z"'+st+'/>'
                        +'<rect x="22" y="68" width="56" height="7" rx="2"'+st+'/>';
    case "wing":  return '<path d="M20 60 Q34 40 50 44 Q40 50 38 58 Q52 48 66 50 Q54 58 50 66 Q66 58 80 62 Q60 76 44 74 Q28 72 20 60 Z"'+st+'/>';
    case "ball":  return '<circle cx="50" cy="52" r="22"'+st+'/>'
                        +'<path d="M50 38 L61 46 L57 59 L43 59 L39 46 Z" fill="'+edge+'"/>';
    case "tower": return '<path d="M34 76 V40 H30 V30 H38 V36 H44 V30 H56 V36 H62 V30 H70 V40 H66 V76 Z"'+st+'/>';
    case "laurel":return '<path d="M50 30 Q30 44 32 74 Q46 70 50 52 Q54 70 68 74 Q70 44 50 30 Z"'+st+'/>';
    case "bolt":  return '<path d="M56 24 L34 58 H48 L42 82 L66 46 H52 Z"'+st+'/>';
    // 鳥(翼を広げた猛禽)。頭・胴・左右の翼・尾を1本のパスで
    case "bird":  return '<path d="M50 20 Q56 20 56 26 Q56 30 53 32 L58 40'
                        +' L84 30 L70 46 L82 50 L62 52 L58 62 L54 82 L46 82 L42 62 L38 52'
                        +' L18 50 L30 46 L16 30 L42 40 L47 32 Q44 30 44 26 Q44 20 50 20 Z"'+st+'/>';
    // オオカミ(横顔ではなく正面)。**耳を尖らせる**と犬と見分けが付く
    case "wolf":  return '<path d="M26 28 L36 48 Q50 42 64 48 L74 28 L68 50'
                        +' Q76 62 68 72 Q60 82 50 82 Q40 82 32 72 Q24 62 32 50 Z"'+st+'/>'
                        +'<circle cx="42" cy="58" r="3.4" fill="'+edge+'"/>'
                        +'<circle cx="58" cy="58" r="3.4" fill="'+edge+'"/>'
                        +'<path d="M50 66 L45 72 H55 Z" fill="'+edge+'"/>';
    // 騎士の兜(グレートヘルム)。**目のスリット**が無いと壺に見える
    case "helm":  return '<path d="M32 30 Q50 20 68 30 V62 Q68 78 50 82 Q32 78 32 62 Z"'+st+'/>'
                        +'<rect x="34" y="46" width="32" height="7" rx="2" fill="'+edge+'"/>'
                        +'<rect x="47" y="56" width="6" height="18" rx="2" fill="'+edge+'"/>'
                        +'<rect x="37" y="58" width="5" height="12" rx="2" fill="'+edge+'"/>'
                        +'<rect x="58" y="58" width="5" height="12" rx="2" fill="'+edge+'"/>';
    default:      return "";
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
  const d={
    shape:EMB_SHAPES[h%EMB_SHAPES.length],
    field:EMB_FIELDS[(h>>>5)%EMB_FIELDS.length],
    // **既定は文字**。紋章は3回に1回くらい出る(全部が紋章だと名前が読めない)
    crest:((h>>>9)%3===0)?EMB_CRESTS[1+((h>>>11)%(EMB_CRESTS.length-1))]:"none",
    text:embMonogram(name),
  };
  return mine?{ ...d, ...mine, text:mine.text||d.text }:d;
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
  // ★は盾の上。**盾を縮めず、上に足す**ので、★が付いた瞬間に紋章が小さくならない
  const top=stars?18:0, vb="0 "+(-top)+" 100 "+(100+top);
  const starRow=!stars?"":'<g>'+Array.from({length:stars},(_,k)=>{
      const x=50+(k-(stars-1)/2)*20;
      return '<path transform="translate('+x+',-9) scale(0.34)" '
        +'d="M0 -22 L6.5 -7 L23 -7 L10 3 L15 19 L0 9 L-15 19 L-10 3 L-23 -7 L-6.5 -7 Z" '
        +'fill="oklch(0.88 0.16 92)" stroke="oklch(0.42 0.10 80)" stroke-width="4" '
        +'paint-order="stroke"/>';
    }).join("")+'</g>';
  return '<svg class="emb-svg" viewBox="'+vb+'" width="'+size+'" height="'+size+'" '
    +'role="img" aria-label="'+esc(name||"")+'">'
    +'<defs><clipPath id="'+cid+'"><path d="'+path+'"/></clipPath></defs>'
    +'<g clip-path="url(#'+cid+')"><rect x="0" y="0" width="100" height="100" fill="'+a+'"/>'
    +embFieldPath(d.field,b)+'</g>'
    +'<path d="'+path+'" fill="none" stroke="'+rim+'" stroke-width="4"/>'
    +(d.crest&&d.crest!=="none"
      ? embCrestPath(d.crest,ink,b)
      : '<text x="50" y="65" text-anchor="middle" font-family="Georgia,\'Times New Roman\',serif"'
        +' font-weight="700" font-size="40" letter-spacing="-2"'
        +' fill="'+ink+'" stroke="'+b+'" stroke-width="5" paint-order="stroke">'
        +esc(d.text)+'</text>')
    +starRow
  +'</svg>';
}
