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
const EMB_CRESTS=["none","star","crown","eagle","lion","horse","helm","ball","tower","sword","bolt"];

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
 * 王冠(→docs/03 §3.54a)。**盾の中と盾の外で同じ形を使う**ので切り出してある。
 * 0..100 の枠に収めてあり、外装側は transform で縮めて載せる。
 *
 * 閉じた王冠(インペリアル)。**塊を作ってから隙間を抜く**のが要で、
 * リボンを何本も描く式だと交点が濁って冠に見えない。
 */
function embCrownPath(ink,edge,sw){
  const st=' fill="'+ink+'" stroke="'+edge+'" stroke-width="'+sw+'" paint-order="stroke"';
  // 隙間は左半分だけ書き、右半分は x を折り返して作る。
  // M と C しか使っていないので、**0から数えて偶数番目の数がx**で通る
  const mirrorX=d=>{ let i=0;
    return d.replace(/-?\d+(?:\.\d+)?/g,n=>((i++)%2===0)?String(100-parseFloat(n)):n); };
  const holeA='M17 43 C12 52 14 63 20 69 C24 72 28 69 27 64'
             +' C24 56 26 47 32 41 C28 34 20 36 17 43 Z';
  const holeB='M35 36 C29 46 31 59 37 67 C41 71 45 68 44 63'
             +' C41 54 42 45 44 34 C41 30 37 32 35 36 Z';
  const arch='M22 74 C4 64 6 33 24 27 C34 23 43 25 46 29 L46 19 L54 19 L54 29'
            +' C57 25 66 23 76 27 C94 33 96 64 78 74 Z';
  return ''
    // **隙間は縁色で塗らず、evenodd で本当に抜く**。塗ってしまうと盾の中では
    // 黒い塊に見え、王冠が裏返って見える
    +'<path fill-rule="evenodd" d="'+arch+' '+holeA+' '+holeB+' '
    +mirrorX(holeA)+' '+mirrorX(holeB)+'"'+st+'/>'
    // 台座。**下辺をたわませる**と金属の輪に見え、真っ直ぐだと箱になる
    +'<path d="M19 68 Q50 76 81 68 L76 89 Q50 94 24 89 Z"'+st+'/>'
    // 宝珠と頂の十字
    +'<circle cx="50" cy="15" r="9"'+st+'/>'
    +'<path d="M47 5 V2 H44 V-2 H47 V-6 H53 V-2 H56 V2 H53 V5 Z"'+st+'/>';
}
function embCrestPath(kind,ink,edge){
  const st=' fill="'+ink+'" stroke="'+edge+'" stroke-width="2.2" paint-order="stroke"';
  const cut=' fill="'+edge+'"';
  switch(kind){
    // 星(マレット)。**5つの尖りを細長く**。太いと漫画の星になる
    case "star":  return '<path d="M50 16 L57.5 41 L84 41 L62.5 56.5 L70.5 82 L50 66.5'
                        +' L29.5 82 L37.5 56.5 L16 41 L42.5 41 Z"'+st+'/>';
    // 王冠。**盾の外の外装と同じ形**を使う(→embCrownPath)。
    // 素の王冠は頂の十字が y=-6 まで伸びるので、盾に入れるときは一回り縮める
    case "crown": return '<g transform="translate(5,8) scale(0.9)">'
                        +embCrownPath(ink,edge,2.4)+'</g>';
    // 鷲(デプロイド)。**翼は面で取り、後縁を段で抉る**。
    // 細い羽根を並べると骨格標本や鳩に見えるので、まず塊を作ってから刻む
    case "eagle": return (function(){
      // 左翼。前縁は肩から先へ一息に、後縁は4段の切り込みで羽を表す
      const L='M44 28 Q25 15 4 20 L15 29 L3 33 L19 41 L9 46 L26 50 L19 57'
             +' L36 53 L34 63 L45 47 Z';
      const R='M56 28 Q75 15 96 20 L85 29 L97 33 L81 41 L91 46 L74 50 L81 57'
             +' L64 53 L66 63 L55 47 Z';
      let tail="";
      for(let i=-2;i<=2;i++){
        const L2=(i===0)?30:27-Math.abs(i)*4;
        tail+='<path d="M'+(50-5).toFixed(1)+' 58 L'+(50+Math.sin(i*0.36)*L2).toFixed(1)+' '
             +(58+Math.cos(i*0.36)*L2).toFixed(1)+' L'+(50+5).toFixed(1)+' 58 Z"'+st+'/>';
      }
      return '<path d="'+L+'"'+st+'/><path d="'+R+'"'+st+'/>'+tail
        // 胴。首から尾まで一本の塊にして頭が浮かないようにする
        +'<path d="M50 14 L61 24 L60 44 L57 62 L43 62 L40 44 L39 24 Z"'+st+'/>'
        +'<path d="M46 34 L50 44 L54 34 Z"'+cut+'/>'
        // 頭と嘴(左を向く)
        +'<circle cx="50" cy="18" r="8"'+st+'/>'
        +'<path d="M43 15 L30 13 L43 24 Z"'+st+'/>'
        +'<circle cx="53" cy="15" r="2"'+cut+'/>';
    })();
    // 獅子。**一方向へなびく鬣**＋**横顔**。放射状に均等な棘を並べると
    // 太陽の光線になってしまうので、根元から先までを同じ向きに捻って流す
    case "lion":  return (function(){
      const cx=54, cy=52, rb=15, sweep=0.62, n=13;
      const P=(ang,r)=>[(cx+Math.cos(ang)*r).toFixed(1),(cy+Math.sin(ang)*r).toFixed(1)];
      let mane="";
      for(let i=0;i<n;i++){
        const ang=(i/n)*Math.PI*2;
        const rt=[36,30,34][i%3];
        const b1=P(ang-0.24,rb), b2=P(ang+0.24,rb), tp=P(ang+sweep,rt);
        const c1=P(ang-0.06+sweep*0.45,(rb+rt)*0.60);
        const c2=P(ang+0.34+sweep*0.45,(rb+rt)*0.52);
        mane+='<path d="M'+b1[0]+' '+b1[1]+' Q'+c1[0]+' '+c1[1]+' '+tp[0]+' '+tp[1]
             +' Q'+c2[0]+' '+c2[1]+' '+b2[0]+' '+b2[1]+' Z"'+st+'/>';
      }
      return mane
        // 束の根元が透けないよう中心を埋める
        +'<circle cx="'+cx+'" cy="'+cy+'" r="17"'+st+'/>'
        // 横顔(左向き)。額→鼻筋→口先→顎→頬
        +'<path d="M42 26 L30 30 L21 38 L14 49 L17 59 L26 65 L38 66 L50 60'
        +' L54 46 L51 33 Z"'+st+'/>'
        +'<path d="M30 40 L40 43 L39 46 L29 44 Z"'+cut+'/>'
        +'<path d="M15 47 L21 45 L20 51 Z"'+cut+'/>'
        +'<path d="M17 55 L30 57 L30 60 L18 58 Z"'+cut+'/>'
        +'<path d="M44 30 Q50 44 44 62 L48 62 Q54 44 48 30 Z"'+cut+'/>';
    })();
    // 馬。**長い鼻筋と反った首**が特徴。耳を2本立てただけでは犬になる
    case "horse": return '<path d="M20 62 L26 46 L34 36 L42 30 L44 18 L52 28'
                        +' L58 16 L62 30 L70 40 L76 56 L80 76 L74 88 L60 88 L58 74'
                        +' L50 62 L38 62 L30 70 L22 72 Z"'+st+'/>'
                        +'<path d="M52 28 L64 26 L60 34 Z"'+cut+'/>'
                        +'<path d="M60 36 L72 36 L66 44 Z"'+cut+'/>'
                        +'<path d="M66 46 L78 50 L70 56 Z"'+cut+'/>'
                        +'<circle cx="40" cy="44" r="2.6"'+cut+'/>'
                        +'<path d="M24 58 L30 56 L28 62 Z"'+cut+'/>';
    // 騎士の兜(グレートヘルム)。**天面を平らに切る**のが決め手。
    // 上を丸めると盾や卵に見え、羽根飾りを足すと葉や蜂に化けたので飾りは持たせない
    case "helm":  return ""
      // 本体。平天面 → まっすぐな側面 → 顎で少しすぼめる
      +'<path d="M30 14 H70 L75 26 V54 Q75 72 62 82 L50 88 L38 82'
      +' Q25 72 25 54 V26 Z"'+st+'/>'
      // 目のスリット(細い横一文字)
      +'<path d="M26 38 H74 V46 H26 Z"'+cut+'/>'
      // 鼻梁の補強帯。スリットを跨いで縦に通す
      +'<path d="M45 16 H55 V60 H45 Z"'+st+'/>'
      // 通気孔
      +'<circle cx="34" cy="55" r="2.6"'+cut+'/><circle cx="40" cy="60" r="2.6"'+cut+'/>'
      +'<circle cx="34" cy="65" r="2.6"'+cut+'/><circle cx="41" cy="70" r="2.6"'+cut+'/>'
      +'<circle cx="66" cy="55" r="2.6"'+cut+'/><circle cx="60" cy="60" r="2.6"'+cut+'/>'
      +'<circle cx="66" cy="65" r="2.6"'+cut+'/><circle cx="59" cy="70" r="2.6"'+cut+'/>';
    // サッカーボール。**五角形と接する六角を抜く**。丸だけだと風船に見える
    case "ball":  return '<circle cx="50" cy="50" r="26"'+st+'/>'
                        +'<path d="M50 34 L61 42 L57 55 L43 55 L39 42 Z"'+cut+'/>'
                        +'<path d="M50 24 L44 32 L56 32 Z"'+cut+'/>'
                        +'<path d="M27 44 L36 40 L33 50 Z"'+cut+'/>'
                        +'<path d="M73 44 L67 50 L64 40 Z"'+cut+'/>'
                        +'<path d="M36 72 L41 62 L48 68 Z"'+cut+'/>'
                        +'<path d="M64 72 L52 68 L59 62 Z"'+cut+'/>';
    // 塔(城)。**狭間を刻み、窓を抜く**
    case "tower": return '<path d="M30 80 V40 H26 V28 H34 V34 H42 V28 H50 V34 H58 V28 H66 V34'
                        +' H74 V28 H74 V40 H70 V80 Z"'+st+'/>'
                        +'<path d="M44 56 H56 V80 H44 Z"'+cut+'/>'
                        +'<circle cx="38" cy="50" r="3"'+cut+'/><circle cx="62" cy="50" r="3"'+cut+'/>';
    // 剣。**十字の護拳**を付けると紋章らしい
    case "sword": return '<path d="M50 12 L56 24 V56 H44 V24 Z"'+st+'/>'
                        +'<path d="M28 56 H72 V64 H28 Z"'+st+'/>'
                        +'<path d="M46 64 H54 V78 H46 Z"'+st+'/>'
                        +'<path d="M40 78 H60 V86 H40 Z"'+st+'/>';
    // 稲妻。**折れを鋭く**
    case "bolt":  return '<path d="M58 14 L30 56 H46 L40 86 L70 42 H54 Z"'+st+'/>';
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
  const crown='<g transform="translate(24,-52) scale(0.52)">'
    +embCrownPath(gold,dark,4)+'</g>';
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
    // 盾の外は**同じ形を縮めて載せる**。別に描くと2つの王冠が食い違う
    case "crown": return '<g transform="translate(21,-55) scale(0.58)">'
                        +embCrownPath(gold,dark,3.6)+'</g>';
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
  const d={
    shape:EMB_SHAPES[h%EMB_SHAPES.length],
    field:EMB_FIELDS[(h>>>5)%EMB_FIELDS.length],
    // **既定は文字**。紋章は3回に1回くらい出る(全部が紋章だと名前が読めない)
    crest:((h>>>9)%3===0)?EMB_CRESTS[1+((h>>>11)%(EMB_CRESTS.length-1))]:"none",
    // 外装も3回に1回くらい。**全部に王冠を載せると格が語れなくなる**
    orn:((h>>>15)%3===0)?EMB_ORNS[1+((h>>>17)%(EMB_ORNS.length-1))]:"none",
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
      : '<text x="50" y="65" text-anchor="middle" font-family="Georgia,\'Times New Roman\',serif"'
        +' font-weight="700" font-size="40" letter-spacing="-2"'
        +' fill="'+ink+'" stroke="'+b+'" stroke-width="5" paint-order="stroke">'
        +esc(d.text)+'</text>')
    // 王冠とリボンは**盾の前**(重なっても手前に出す)
    +(orn==="crown"?embOrnPath("crown",gold,dark)
      :orn==="ribbon"?embOrnPath("ribbon",gold,dark)
      :orn==="wreath"?embOrnPath("crown",gold,dark)
        +embOrnPath("ribbon",gold,dark):"")
    +starRow
  +'</svg>';
}
