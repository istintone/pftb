// ================= クラブのエンブレム(→docs/03 §3.54) =================
// **絵を1枚も持たずに描く**。クラブは 144 + カップの架空名 40 の 184 個あり、
// 汎用のパターン画像を数枚用意しても「15クラブが同じ絵柄」になって個性が減る。
// 形 × 地の柄 × 紋章 × 色相 の組み合わせなら、全部に別の顔を配れて index.html も太らない。
//
// **クラブIDから決まる**(世界のたねと同じ流儀)。クラブを足せばエンブレムも生える。
// 自分のクラブだけは CLUB 画面で好きに組み替えられる(→S.club.emblem)。

const EMB_SHAPES=["shield","round","pointed","banner"];
const EMB_FIELDS=["solid","stripe","half","quarter","sash","hoop","chevron"];
// 紋章。**文字の代わりに置ける**(→docs/03 §3.54)。どれも 100x100 の中で完結させる
const EMB_CRESTS=["none","star","crown","wing","ball","tower","laurel","bolt"];

// 盾の輪郭。clip と縁取りで同じパスを使う
const EMB_PATH={
  shield: "M50 4 L92 18 V52 Q92 84 50 96 Q8 84 8 52 V18 Z",
  round:  "M50 4 A46 46 0 1 1 49.9 4 Z",
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
  const hue=i>=0?((i*137.5+20)%360):(hashStr("hue:"+clubId)%360);
  const h2=hashStr("emb2:"+clubId);
  const hue2=(hue+((h2%2)?150:40))%360;
  const a="oklch(0.62 0.16 "+hue.toFixed(1)+")";
  const b="oklch(0.34 0.10 "+hue2.toFixed(1)+")";
  const ink="oklch(0.96 0.03 "+hue.toFixed(1)+")";
  const rim="oklch(0.92 0.05 "+hue.toFixed(1)+")";
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
