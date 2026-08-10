// ================= 画面と共通UI =================
// 画面は #scr-<id> を .on で1つだけ表示する。画面を増やすときは
//   1) index.html の #appBody に <div id="scr-xxx" class="screen"> を足す
//   2) SCREENS に1エントリ足す(ヘッダー・タブ・戻るの出し方はここで決まる)
// の2手順で済むようにしてある。

const $=id=>document.getElementById(id);
const esc=s=>String(s).replace(/[&<>"]/g,c=>({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;" }[c]));

/**
 * 画面レジストリ。
 *   title   ヘッダー中央に出す英字ラベル(uppercase)
 *   tab     この画面がタブ直下であることを示すタブID(タブバーの5画面のみ)
 *   under   タブ直下ではないが、どのタブの配下かを示す(そのタブを点灯したままにする)
 *   chrome  "full"=ヘッダー+タブ / "back"=ヘッダー(戻る)+タブ / "bare"=どちらも無し
 *   render  表示時に呼ぶ描画関数(任意)
 */
const SCREENS={
  title:     { chrome:"bare" },
  contract:  { chrome:"bare" },
  offer:     { title:"OFFERS",    chrome:"back",  render:()=>renderOffers() },
  board:     { title:"OWNER",     chrome:"back",  render:()=>renderBoard() },
  chat:      { title:"CLUB",      under:"season", chrome:"back", render:()=>renderChat() },
  home:      { title:"HOME",      tab:"home",      chrome:"full", render:()=>renderHome() },
  cards:     { title:"CARDS",     tab:"cards",     chrome:"full", render:()=>renderCards() },
  deck:      { title:"DECK",      tab:"deck",      chrome:"full", render:()=>renderDeck() },
  season:    { title:"SEASON",    tab:"season",    chrome:"full", render:()=>renderSeason() },
  clubhouse: { title:"CLUB",      tab:"clubhouse", chrome:"full", render:()=>renderClubhouse() },
  schedule:  { title:"FIXTURES",  under:"season",  chrome:"back", render:()=>renderSchedule() },
  standings: { title:"STANDINGS", under:"season",  chrome:"back", render:()=>renderStandings() },
  foe:       { title:"OPPONENT",  under:"season",  chrome:"back", render:()=>renderFoe() },
  gallery:   { title:"GALLERY",   under:"clubhouse", chrome:"back", render:()=>renderGallery() },
  gacha:     { title:"SCOUT",     under:"home",    chrome:"back", render:()=>renderScout() },
  // 受信箱は**チャットとして読む**(→docs/03 §3.43)。上が古く、下が最新。
  // 開いたら一番下(=いま言われていること)まで送る
  secretary: { title:"SECRETARY", under:"home",    chrome:"back", render:()=>renderMail(),
               after:()=>{ $("appBody").scrollTop=$("appBody").scrollHeight; } },
  match:     { title:"MATCH",     chrome:"bare" },
  result:    { title:"RESULT",    chrome:"bare",   render:()=>renderResult() },
  career:    { title:"CAREER",    chrome:"bare",   render:()=>renderCareerEnd() },
};

let _scr="title";      // 現在の画面
const _back=[];        // 戻り先スタック("back"の画面から戻るときに使う)

function show(id,opts){
  const def=SCREENS[id]; if(!def)return;
  if(opts&&opts.push&&_scr!==id)_back.push(_scr);
  if(def.tab)_back.length=0;                       // タブ直下に来たら戻り履歴は畳む
  _scr=id;

  document.querySelectorAll(".screen").forEach(el=>el.classList.remove("on"));
  const el=$("scr-"+id); if(el)el.classList.add("on");

  const bare=def.chrome==="bare", back=def.chrome==="back";
  $("appHead").classList.toggle("off",bare);
  $("tabs").classList.toggle("off",bare);
  $("hdBack").classList.toggle("off",!back);
  $("hdClub").classList.toggle("off",back);
  $("hdTitle").textContent=def.title||"";
  const lit=def.tab||def.under;   // 配下の画面にいる間も親タブは点灯したままにする
  document.querySelectorAll("#tabs button").forEach(b=>b.classList.toggle("on",b.dataset.s===lit));

  // ヘルプは HELP に項目がある画面にだけ出す(→docs/06 §6.16)。
  // 画面が変わったら必ず閉じる(前の画面の説明が残らないように)。
  closeHelp();
  $("helpTab").classList.toggle("off",helpFor(id)==null);
  // 契約と日程はSEASONの中身なので、SEASONにいる間だけ柱に生やす(→docs/06 §6.16)
  closeSide();
  $("contractTab").classList.toggle("off",id!=="season");
  $("compTab").classList.toggle("off",id!=="season");
  // 交代タブは**試合中だけ**。他の画面に出しても押せることが無い
  $("subTab").classList.toggle("off",id!=="match");
  $("ordTab").classList.toggle("off",id!=="match");
  if(id!=="match"){ closeSub(); closeOrd(); }

  if(def.render)def.render();
  $("appBody").scrollTop=0;
  if(def.after)def.after();      // 描画後の後処理(現在節へスクロール等)

  // **開いた画面を覚える**(→docs/03 §3.43)。次の案内はこれをきっかけに届く。
  // 節が進むのを待たないので、CARDS を開いた瞬間に DECK の案内が入る。
  // 就任前(タイトル・オファー・契約書)は数えない
  if(S&&S.club&&S.player&&def.tab&&seeNow(id))save();
}
/** ヘルプの開閉。中身は開くたびに作り直す(TUNINGの値を参照する項目があるため)。 */
function openHelp(){
  const html=helpFor(_scr); if(html==null)return;
  $("helpTitle").textContent=(SCREENS[_scr].title||"HELP")+" — この画面について";
  $("helpBody").innerHTML=html;
  $("helpDrawer").classList.add("on");
  $("helpDrawer").setAttribute("aria-hidden","false");
}
function closeHelp(){
  $("helpDrawer").classList.remove("on");
  $("helpDrawer").setAttribute("aria-hidden","true");
}
const helpOpen=()=>$("helpDrawer").classList.contains("on");
/**
 * 右端の柱から開く引き出し(→docs/06 §6.16)。契約と日程は同じ引き出しを使い分ける。
 * **中身は renderSeason が書いたものをそのまま出す**ので、ここでは見せ方だけを切り替える。
 */
let _side=null;
function openSide(kind){
  _side=kind;
  // **大会は8つあり、出ていない大会も条件つきで並ぶ**(→docs/03 §3.23)ので
  // 「エントリー中の大会」では中身と合わない
  $("sideTitle").textContent=kind==="contract"?"契約":"大会と参加条件";
  $("seasonBox").hidden=kind!=="contract";
  $("seasonComps").hidden=kind!=="comp";
  $("sideDrawer").classList.add("on");
  $("sideDrawer").setAttribute("aria-hidden","false");
}
function closeSide(){
  _side=null;
  $("sideDrawer").classList.remove("on");
  $("sideDrawer").setAttribute("aria-hidden","true");
}
const sideOpen=()=>$("sideDrawer").classList.contains("on");
function goBack(){ show(_back.pop()||"home"); }

let _toastTimer=null;
function toast(msg){
  const t=$("toast"); if(!t)return;
  t.textContent=msg; t.style.display="block";
  if(_toastTimer)clearTimeout(_toastTimer);
  _toastTimer=setTimeout(()=>{t.style.display="none";},2600);
}

// ヘッダーの共通表示(クラブ名・エンブレム・コイン)を現在のセーブ状態に同期する。
function headUI(){
  const name=S.club?clubById(S.club.id).name:"—";
  $("hdClubName").textContent=name;
  $("hdEmblem").textContent=(name.trim()[0]||"P").toUpperCase();
  $("hdCoin").textContent=fmtNum(S.club?S.club.coins:0);
}

// ---------- 共通の小部品 ----------
/** カードに付けるクラス: レア度 + ホロ表現(ホロはCSSで載せる → docs/06 §6.13)。 */
function rarClass(c){
  const r=RARITY[c.rarity];
  return "r-"+c.rarity.toLowerCase()+(r.holo?" holo-"+r.holo:"");
}
/** ✦粒子。ホロのある段だけ、上位ほど多く散らす(card-eleven の演出に倣う)。 */
function sparks(c){
  const h=RARITY[c.rarity].holo;
  if(!h)return "";
  const n=h==="sheen"?2:3;
  let out="";
  for(let i=1;i<=n;i++)out+='<i class="spark s'+i+'">✦</i>';
  return out;
}
/**
 * 選手カード1枚(→docs/06 §6.12)。デザインモックの構成に準拠:
 *   枠と発光 = レア度 / 絵柄 = クラブカラーの斜めストライプ /
 *   左上 = レア度ラベル / 右上 = OVR / 下 = 名前・ポジション・クラブ
 * ★ は「自分のカード」の印(クラブからの貸与と見分ける → §3.4 D13)。
 */
function cardTile(c){
  if(!c)return '<div class="pcard empty">空き</div>';
  return '<div class="pcard '+rarClass(c)+'" data-card="'+c.id+'"'+cardBgStyle(c)+'>'
    +cardFace(c)+'</div>';
}
/**
 * カードの中身。**背景は画像、枠と文字はすべてCSS/HTML**(→docs/06 §6.13)。
 *   クレスト(左上) … レアリティの2文字略称。正式名称は枠に入らない
 *   OVR(右上)      … 6能力の合計
 *   能力欄(右・下ぞろえ) … 6行。20に達した行は金
 *   名前帯(下)     … 名前 / サブポジション・クラブ
 */
function cardFace(c){
  return '<span class="pc-crest">'+RARITY[c.rarity].abbr+'</span>'
    +'<span class="pc-ovr">'+c.ovr+'</span>'
    // OVR の下にポジション。**サブが他にもあれば下段に「+」**だけ添える(数は詳細で見る)
    +'<div class="pc-pos"><b>'+primarySub(c)+'</b>'
      +(c.subs.length>1?'<i>+</i>':'')+'</div>'
    +gradeWord(c)
    +'<div class="pc-art">'+playerArt(c)+'</div>'
    +sparks(c)   // 粒子はカード面全体に散らす(絵の中に閉じ込めない)
    +'<div class="pc-stats">'+STAT_KEYS.map(k=>
      '<div'+(c[k]>=STAT_MAX?' class="mx"':'')+'><span>'+STAT_LABEL[k]+'</span>'
      +'<b>'+c[k]+'</b></div>').join("")+'</div>'
    +'<div class="pc-name">'
      // **印を付けるのは借りている側**(→docs/06 §6.13)。
      // 最終的にほとんどが自分のカードになるので、自分側に印を付けても意味を持たない
      +'<b>'+esc(shortName(c))+'<i class="awk">'+starOf(c)+'</i>'+loanTag(c)+'</b>'
      // ポジションは OVR の下へ移したので、名前帯は**クラブだけ**
      +'<span>'+esc(c.club||"—")+'</span>'
    +'</div>';
}
// ---------- スキルの効果を言葉にする(→docs/03 §3.21) ----------
// 表(SKILL_FX)から**自動で1行を組み立てる**。手書きの説明を別に持つと、
// 効果を変えたときに片方だけ古くなる。
const SK_WHAT={
  pass:"パス", carry:"持ち運び", passTec:"技巧的なパス", long:"一発の縦パス",
  cross:"クロス", wide:"散らし", cut:"中への切れ込み", carryOut:"サイドの上がり",
  press:"激しい寄せ", close:"ゴール前のシュート", far:"遠めのシュート",
  spd:"速さで勝負する手", tec:"技術で勝負する手", set:"直接狙うセットプレー", all:"",
};
const SK_SOLO={
  gk:"枠内のシュートを止めやすい", noRebound:"こぼれ球にしにくい",
  longStop:"相手の一発の縦パスを摘む", pkGk:"PKを止めやすい",
  aerial:"空中戦に強い", cover:"味方の守備を厚くする", stam:"スタミナの減りが緩やか",
  vision:"良い受け手を見つけやすい", recv:"味方から預けられやすい",
  start:"起点になりやすい", onTarget:"シュートが枠に飛びやすい",
  pkKick:"PKを決めやすい", rebound:"こぼれ球に詰めやすい",
  // **掛かり先を足したら必ずここにも書く**。書き忘れると吹き出しが空になる
  // (careertest が「説明の無い掛かり先」を落とす)
  offTarget:"相手のシュートが枠を外れやすい", marshal:"味方の寄せを厚くする",
  mid:"中盤の押し合いに強い", block:"シュートに身体を入れやすい",
  clean:"ファウルもケガも起こしにくい", tough:"ケガをしにくい",
  captaincy:"腕章を巻くと勢いに乗りやすい", mood:"チームが勢いに乗りやすい",
  spDeliver:"セットプレーの球が良い", joker:"交代直後はボールが集まる",
  iron:"調子の good/bad に振り回されない",
  psoGk:"PK戦で止めやすい", comeback:"負けているときに勢いが乗りやすい",
};
/**
 * スキルの効果を**タップで浮かせる**(→docs/03 §3.21)。
 * 常に添えると説明が4行並んで、肝心の「何を持っているか」が読めなくなる。
 * 吹き出しは `.skills` の中に絶対配置し、**枠からはみ出さないよう左右を丸める**。
 */
function bindSkillPop(skills){
  const wrap=$("cardModalBody").querySelector(".skills");
  const pop=$("skPop"); if(!wrap||!pop)return;
  const hide=()=>{ pop.hidden=true; pop.dataset.i="";
    wrap.querySelectorAll(".skill").forEach(e=>e.classList.remove("on")); };
  wrap.querySelectorAll("[data-sk]").forEach(el=>{
    el.onclick=e=>{
      e.stopPropagation();
      const i=el.dataset.sk;
      if(!pop.hidden&&pop.dataset.i===i){ hide(); return; }   // 同じ札で閉じる
      hide();
      el.classList.add("on");
      pop.textContent=skillNote(skills[+i]);
      pop.dataset.i=i; pop.hidden=false;
      // 位置はチップの真下。左右は枠の内側に収める(端の札でも切れない)
      pop.style.left="0px";
      const w=wrap.getBoundingClientRect(), r=el.getBoundingClientRect();
      const pw=pop.offsetWidth;
      const x=clamp(r.left-w.left+r.width/2-pw/2,0,Math.max(0,w.width-pw));
      pop.style.top=(r.bottom-w.top+7)+"px";
      pop.style.left=x+"px";
      pop.style.setProperty("--arrow",(r.left-w.left+r.width/2-x)+"px");
    };
  });
  $("cardModalBody").addEventListener("click",hide);
  hide();
}
function skillNote(name){
  const fx0=SKILL_FX[name]; if(!fx0)return "";
  // **固有スキルは1枚で複数の効果**(→docs/03 §3.41)。全部つなげて出す
  if(fx0.fx)return fx0.fx.map(e=>noteOf(e)).filter(Boolean).join("／");
  return noteOf(fx0);
}
function noteOf(fx){
  // k を持つ札は SK_SOLO に文が要る。無ければ掛かり先の名前をそのまま出して、
  // **空の吹き出しにはしない**(気付かないまま出荷されるのを防ぐ)
  const solo=fx.k!=null?(SK_SOLO[fx.at]||fx.at):"";
  if(!fx.grp)return solo;
  const what=SK_WHAT[fx.grp]||"";
  const at=fx.at2||fx.at;
  const act=at==="origin"?"を仕掛け":at==="finish"?"を選び":"で守り";
  const body=what?(what+(fx.w?act+"、成功しやすい":"が成功しやすい")):"すべての判定に強い";
  // **条件は先に言う**(→docs/03 §3.41)。いつ効くのかが分からないと使い道が読めない
  const when=fx.when?("【"+(SK_WHEN_WHAT[fx.when]||fx.when)+"】"):"";
  return when+(solo?solo+"／"+body:body);
}

/**
 * 借りているカードの印(→docs/06 §6.13)。**印を付けるのは借りている側**。
 * 最終的にはほとんどが自分のカードになるので、自分側に印を付けても意味を持たない。
 */
const loanTag=c=>isLoaned(c)?'<i class="loan">(CLUBS)</i>':"";
/** 覚醒の★(→docs/03 §3.30)。名前の右に付く。任期が明ければ消える。 */
const starOf=c=>{ const n=trainStar(c.id); return n?"★".repeat(n):""; };

/**
 * 段の名前を右側に縦に流す**半透明のデザイン文字**(→docs/06 §6.13)。
 * ホロを持つ段(SPECIALS / WORLD CLASS / LEGENDS)だけに出して、特別感を作る。
 * 空白は詰める(WORLDCLASS)。字間を空けた1語の方が意匠として締まる。
 */
function gradeWord(c){
  const r=RARITY[c.rarity];
  if(!r.holo)return "";
  return '<span class="pc-grade">'+r.label.replace(/\s+/g,"")+'</span>';
}
/**
 * 選手のイラスト。カードでは**プレイ絵(play)**を使う(→player-art-prompt.md)。
 * 画像を持たないカード(自動生成の選手)はプレースホルダのままにする。
 */
function playerArt(c,kind){
  const art=artKeyOf(c);
  const src=art&&artOf(art+"_"+(kind||"play"));
  return src?'<img class="pc-img" src="'+src+'" alt="">'
            :'<span class="pc-ph">PLAYER</span>';
}
/** レアリティに対応する背景画像を CSS 変数で渡す(画像が未配置でも地色で成立する)。 */
function cardBgStyle(c){
  const key=RARITY[c.rarity].bg;
  const src=(window.ASSETS&&window.ASSETS.carddesign||{})["card-bg-"+key];
  return src?' style="--face:url('+src+')"':'';
}
const clubName=id=>clubById(id)?clubById(id).name:id;

// ---------- HOME(監督のデバイス → docs/06 §6.8) ----------
function renderHome(){
  const W=S.world;
  // 2枚タイル(→docs/06 §6.8)。試合の次に触る2つを並べ、**状態を添える**
  const start=squadCards().slice(0,TUNING.squad.starters);
  $("tileScoutSub").textContent=fmtNum(S.club?S.club.coins:0)+" コイン";
  $("tileDeckSub").textContent="総合力 "+squadPowerAt(squadCards(),S.form);
  const md="SEASON "+W.season+" · MATCHDAY "
    +String(Math.min(W.matchday,W.fixtures.length)).padStart(2,"0");

  const f=myFixture();
  const ev=pendingOwner();
  if(ev){
    // **オーナーの呼び出しは1つの入口**(→docs/03 §3.9)。開幕・総括・去就のどれであれ、
    // HOME から同じタイルで向かう。重なったときの順番は pendingOwner が持つ
    const t=OWNER_EV[ev];
    $("homeNext").innerHTML='<div class="nx own" id="nxTile" role="button" tabindex="0">'
      +'<div class="nx-md">OWNER</div>'
      +'<div class="nx-tag">'+esc(t.tag)+'</div>'
      +'<div class="nx-hype">'+esc(t.line)+'</div>'
      +'<div class="nx-go">&gt; '+esc(t.go)+'</div>'
    +'</div>';
    $("nxTile").onclick=openOwner;
  }else if(f){
    // 試合そのものはスケジュール画面(=クラブ進行の起点)から始める。
    // HOME は「監督のデバイス」であって、進行の操作盤ではない(→docs/06 §6.8)。
    // **ボタンは置かず、タイルごとタップ**して日程へ送る。
    const h=hypeOf(f);
    $("homeNext").innerHTML='<div class="nx" id="nxTile" role="button" tabindex="0">'
      +'<div class="nx-md">'+md+'</div>'
      +'<div class="nx-tag">'+esc(h.tag)+'</div>'
      +'<div class="nx-hype">'+h.line.map(esc).join("<br>")+'</div>'
      // **VSを中心に左右を釣り合わせる**(→docs/06 §6.8)
      +'<div class="nx-vs"><b>'+esc(clubName(S.club.id))+'</b>'
        +'<span>VS</span><b>'+esc(clubName(f.opp))+'</b></div>'
      +'<div class="nx-sub">'+(f.home?"HOME":"AWAY")+' ／ 第'+W.matchday+'節</div>'
      // **スポンサーの名前を看板のように置く**(→docs/06 §6.25)。契約中だけ出る
      +sponBoard()
      // **ボタンは置かない**。タイルごとリンクなので、行き先を右下に一言添えるだけ
      +'<div class="nx-go">&gt; See Schedule</div>'
    +'</div>';
    $("nxTile").onclick=()=>show("season");
  }
  // 秘書: **連絡が来ていればその最新**、無ければ次の一手の案内(→docs/03 §3.42)。
  // どちらでもタップで受信箱へ行けるようにして、入口を1つにする
  const mm=mailLatest(), un=mailUnread();
  const def=mm?mailById(mm.id):null;
  // **顔もここに出す**(→docs/06 §6.27)。丸はチャットと同じ部品を使う。
  // 未読の印は**丸の肩に付ける**(通知の印はアイコンに付くもの)
  $("homeSec").innerHTML='<div class="sec-row sec-go'+(un?" unread":"")+'" id="homeSecGo">'
    +'<div class="sec-face">'+chatAvatar("sec")
      +(un?'<i class="sec-dot">'+un+'</i>':"")+'</div>'
    +'<div class="bubble">'+esc(def?def.text:secretaryLine())
      +(def?'<span class="sec-more">受信箱を開く ›</span>':"")+'</div>'
  +'</div>';
  $("homeSecGo").onclick=()=>show("secretary",{push:1});
  // CLUB NEWS: クラブの今(一時的なコンディションの表示でもある)
  $("homeNews").innerHTML=clubNews().map(n=>'<div class="news">'+n+'</div>').join("");
}
/**
 * 試合の煽り(→docs/06 §6.8)。**状況から1つ選ぶ**。
 * 上から順に見て最初に当たったものを使う。同じ節なら毎回同じ文になる
 * (煽りが毎描画で入れ替わると、読み物ではなく雑音になる)。
 */
function hypeOf(f){
  const W=S.world, n=W.fixtures.length, md=Math.min(W.matchday,n);
  const tbl=W.table, teams=Object.keys(tbl).length;
  const me=rankOf(tbl,S.club.id), you=rankOf(tbl,f.opp);
  const gMe=clubById(S.club.id).grade, gYou=clubById(f.opp).grade;
  // 数節こなすまで順位は当てにならない。それまではクラブの格で見る
  const byRank=md>=4;
  const band=Math.max(2,Math.round(teams*0.25));
  const hi=r=>r<=band, lo=r=>r>teams-band;

  let id;
  if(md===1)                                       id="opening";
  else if(md===n)                                  id="final";
  else if(md>=n-2&&byRank&&lo(me))                 id="survival";
  else if(byRank&&hi(me)&&hi(you))                 id="summit";
  else if(byRank?you<me-2:gYou>=gMe+3)             id="giant";
  else if(byRank?you>me+2:gYou<=gMe-3)             id="favorite";
  else if(Math.abs(gMe-gYou)<=1)                   id="rival";
  else                                             id=md>n*0.7?"late":"generic";

  const h=HYPE[id];
  return { id, tag:h.tag, line:h.lines[hashStr(S.club.id+":"+W.season+":"+md)%h.lines.length] };
}

function secretaryLine(){
  if(pendingOwner())return "監督、オーナーがお待ちです。";
  if(S.world.matchday===1)return "監督、就任おめでとうございます。まずは編成を確認してから初戦に臨みましょう。";
  const r=rankOf(S.world.table,S.club.id);
  if(r<=S.club.expect)return "現在"+r+"位。期待を上回っています、この調子で。";
  return "現在"+r+"位。オーナーの目標は"+S.club.expect+"位です。巻き返しましょう。";
}
/**
 * 秘書からの連絡(→docs/03 §3.42)。**クラブチャットと同じ吹き出し**で並べる。
 * 開いた時点で既読にする(未読の印は HOME にだけ残す意味が無い)。
 */
function renderMail(){
  // **古い順に積む**。連絡はやりとりの記録なので、チャットと同じで上から下へ読む
  // (HOME のひとことだけは mailLatest() = 一番新しいものを映す)
  const list=mailList().slice().reverse();
  $("mailAv").innerHTML=chatAvatar("sec","ch-av-in");
  $("mailSub").textContent=list.length?list.length+"件の連絡":"連絡はありません";
  $("mailLog").innerHTML=list.length?list.map(m=>{
    const d=mailById(m.id); if(!d)return "";
    const gift=d.gift&&d.gift.ticket?ticketById(d.gift.ticket):null;
    // **案内は行き先まで連れていく**(→docs/03 §3.43)。読んで終わりにさせない
    const go=d.go&&SCREENS[d.go]?d.go:null;
    return '<div class="ch-row"><div class="ch-b ml-b">'
      +'<span class="ch-nm">秘書　'+(d.tut?"はじめかた "+d.tut+"/"+TUT_ALL:"第"+m.at+"節")
        +(m.read?"":'　<i class="ml-new">NEW</i>')+'</span>'
      // **件名を出す**。溜まった連絡をあとから辿るとき、本文だけでは探せない
      +'<b class="ml-ti">'+esc(d.title)+'</b>'
      +esc(d.text)
      +(go?'<div class="ml-go"><button class="btn ml-jump" data-go="'+esc(go)+'">'
        +esc(SCREENS[go].title||go)+' をひらく ›</button></div>':"")
      +(gift?'<div class="ml-gift">'
        +'<b>'+esc(gift.name)+'</b>'
        +(m.got?'<span class="ml-done">受け取り済み</span>'
          :'<button class="btn ml-take" data-mail="'+esc(m.id)+'">受け取る</button>')
        +'</div>':"")
    +'</div></div>';
  }).join(""):'<div class="lg">まだ何も届いていません。</div>';
  $("mailLog").querySelectorAll("[data-go]").forEach(el=>{
    el.onclick=()=>show(el.dataset.go);
  });
  $("mailLog").querySelectorAll("[data-mail]").forEach(el=>{
    el.onclick=async()=>{
      const g=mailTake(el.dataset.mail);
      if(!g)return;
      await save(); headUI(); renderMail();
      toast(ticketById(g.ticket).name+" を受け取りました");
    };
  });
  // 開いたら既読。**HOME の未読の印はここで消える**
  list.forEach(m=>mailRead(m.id));
  save();
}
/**
 * 次戦タイルの下に出すスポンサーの看板(→docs/06 §6.25)。
 * **契約中だけ**。ピッチ脇の広告板と同じで、居るときにだけ静かに映り込む。
 */
function sponBoard(){
  const sp=sponsor();
  if(!sp)return "";
  return '<div class="nx-spon"><i>OFFICIAL PARTNER</i>'
    +'<b>'+esc(sponsorById(sp.id).name)+'</b></div>';
}
function clubNews(){
  const r=rankOf(S.world.table,S.club.id), t=S.world.table[S.club.id];
  const lg=leagueById(clubById(S.club.id).league);
  // 治療中の選手は**まっさきに**知らせる(→docs/03 §3.32)。休息を促す唯一の手掛かり
  const hurt=hurtList().map(h=>{
    const c=cardById(h.id);
    return '<b class="news-x">'+esc(shortName(c))+'</b> は現在治療中　回復まで <b>'
      +h.left+'節</b>';
  });
  // 施設(→docs/03 §3.5)。**完成した節はまっさきに知らせる**(1節しか出ない)。
  // 建設中は残り節数だけを出す — 何節後に効き始めるかが分かればよい
  const fac=[];
  if(S.club.built){
    const f=facById(S.club.built.id);
    fac.push('<b class="news-up">'+f.label+'</b> が完成　<b>Lv.'+S.club.built.lv+'</b> になりました');
  }
  const b=S.club.build;
  if(b){
    const f=facById(b.id);
    fac.push(esc(f.label)+' を <b>Lv.'+b.to+'</b> へ建設中　完成まで <b>'+b.left+'節</b>');
  }
  // 師弟の予兆(→docs/03 §3.39)。**相談が来る前に名前を出す**ので、
  // 「誰との関係が育っているか」がここで分かる
  const talk=trustNews().map(id=>
    '<b class="news-up">'+esc(shortName(cardById(id)))+'</b> からブリーフィングで相談があるそうです');
  // スポンサー(→docs/03 §3.40)。**課題と残り節を毎節出す**。期限が見えないと動けない
  const spon=[];
  {
    const sp=sponsor();
    if(sp&&sp.hit&&!sp.paid)
      spon.push('<b class="news-up">'+esc(sponsorById(sp.id).name)+'</b> の課題を達成　報酬が届いています');
    else if(sp)
      spon.push(esc(sponsorById(sp.id).name)+'：'+esc(sponGoalText(sp))
        +'　残り <b>'+Math.max(0,sp.until-S.career.node)+'節</b>');
    else if(sponPending())
      spon.push('<b class="news-up">スポンサー</b> の相談が来ています');
  }
  return fac.slice(0,1).concat(spon,talk,hurt,fac.slice(1),[
    "今季の目標は<b>"+S.club.expect+"位以内</b>。現在 <b>"+r+"位</b>（"+t.w+"勝"+t.d+"分"+t.l+"敗）",
    lg.name+"は<b>"+lg.style+"</b>のチームが多い。",
    "チーム熟練度 <span class='num'>"+fmtNum(S.club.exp)+"</span> ／ オーナーの評価 "+evalLabel(S.club.eval),
  ]);
}
// オーナーの評価の言い方(→docs/03 §3.9)。**延命ライン(70)を跨ぐところで言葉が変わる**ので、
// 「良好」なら契約が伸びる、と読めるようにしてある。
const evalLabel=v=>v>=TUNING.eval.extendNeed?"良好":v>=45?"普通":v>=20?"不満":"危機的";

// ---------- CARDS(コレクション) ----------
let _cardFilter="ALL";
function renderCards(){
  const all=availableCards(), own=S.player.coll.length;
  $("cardsFilter").innerHTML=["ALL"].concat(POS).map(p=>
    '<button class="chip'+(p===_cardFilter?" on":"")+'" data-f="'+p+'">'+p+'</button>').join("");
  $("cardsFilter").querySelectorAll("button").forEach(b=>{
    b.onclick=()=>{ _cardFilter=b.dataset.f; renderCards(); };
  });
  const list=all.filter(c=>_cardFilter==="ALL"||c.pos===_cardFilter).sort((a,b)=>b.ovr-a.ovr);
  $("cardsCount").innerHTML="所持カード "+list.length+" / "+all.length
    +"　<span class=\"loan\">(CLUBS)</span> クラブからの貸与 "+(all.length-own)+" 枚";
  $("cardsGrid").innerHTML=list.length?list.map(cardTile).join("")
    :'<div class="stub"><b>該当するカードがありません</b><span>パックは第4段で実装します</span></div>';
  wireCardTiles($("cardsGrid"));
}
function wireCardTiles(root){
  root.querySelectorAll("[data-card]").forEach(el=>{
    el.onclick=()=>openCard(Number(el.dataset.card));
  });
}
// ---------- GALLERY(カード見本) ----------
// LEGENDS は実在選手の段でパックからは出ず、WORLD CLASS もプロスカウト(→§3.26)から
// まれに出るだけ。通常のプレーでは見る手段が乏しいので、見本を並べる(→docs/03 §3.13)。
let _gallery=null;
function galleryCards(){
  if(_gallery)return _gallery;
  const rng=mulberry32(20260801);          // 固定シード = 毎回同じ見本
  const saveUid=uid; uid=9000000;          // 見本のIDは所持カードとぶつけない
  // 自動生成の段は見本を作り、実在選手の段は定義済みのカードがあればそれを見せる
  const sigs=signatureCards();
  _gallery=RAR_KEYS.map(k=>{
    const real=sigs.find(s=>s.rarity===k);
    return real||makeCard(rng,rnd(["GK","DF","MF","FW"]),
      { rarity:k, club:CLUBS[0].name, nation:"esp" });
  });
  uid=saveUid;
  return _gallery;
}
function renderGallery(){
  // 説明はヘルプタブへ寄せる(→docs/06 §6.16)。ここには見本そのものだけを置く。
  const list=galleryCards();
  $("galleryGrid").innerHTML=list.map(cardTile).join("");
  $("galleryGrid").querySelectorAll("[data-card]").forEach((el,i)=>{
    el.onclick=()=>openCard(list[i]);
  });
  $("galleryLegend").innerHTML='<div class="card" style="margin-top:14px">'
    +'<div class="sect-t">レアリティ</div>'
    +RAR_KEYS.map(k=>{
      const r=RARITY[k];
      return '<div class="kv"><span><b class="gl-abbr r-'+k.toLowerCase()+'">'+r.abbr+'</b> '
        +r.label+'</span><b>'+(r.w?r.w+"%":"パック対象外")+'</b></div>'
        +'<div class="lg" style="margin:-2px 0 6px">'+esc(r.note)+'</div>';
    }).join("")
    +'</div>';
}

// ---------- 枠に入れる選手を選ぶ(→docs/06 §6.15) ----------
let _slotIx=-1;      // いま編集している枠(0..10=先発 / 11..15=控え)

/** 編成の枠の呼び名。先発は細分ポジション、控えは「控えN」。 */
function squadSlotLabel(ix){
  const N=TUNING.squad.starters;
  return ix<N?FORMATIONS[S.form][ix][0]:"控え"+(ix-N+1);
}

/**
 * 枠に置いたときの**実効値**(OVR × 適性)と、その見せ方。
 * 目減りしている段だけ色を付け、**数字そのもので損失が分かる**ようにする
 * (→docs/06 §6.15)。100% = 素のまま / 75% = 黄 / 50% = 赤。
 */
const effOvr=(c,sub)=>Math.round(c.ovr*slotFit(c,sub));
const effClass=(c,sub)=>({ a:"", b:" v-warn", c:" v-bad" })[fitTier(c,sub)];
/**
 * 枠のピッカー。**適性 × OVR の高い順**に並べる(=そのまま推奨順になる)。
 * 既に他の枠にいる選手を選ぶと、その枠と**入れ替える**(同じ選手が二重に並ばない)。
 */
function openSlot(ix){
  // 11〜15 は控えの枠。枠のポジションを持たないので**適性は掛からない**
  // (誰の代役にもなりうるため)。並びは素のOVR順(→docs/03 §3.17)。
  const sub=ix<TUNING.squad.starters?FORMATIONS[S.form][ix][0]:null;
  _slotIx=ix;
  const cur=cardById(S.squad[ix]);
  const list=availableCards().slice().sort((a,b)=>
    sub?slotFit(b,sub)*b.ovr-slotFit(a,sub)*a.ovr:b.ovr-a.ovr);

  $("slotModalBody").innerHTML=
    '<button class="close-btn" id="slotClose" aria-label="閉じる">×</button>'
    +'<h3>'+(sub?sub+" の枠":squadSlotLabel(ix))+'</h3>'
    +'<div class="lg" style="margin-bottom:10px">'
      +(sub?"適性の高い順に並んでいます。":"控えは枠を持たないので OVR 順です。")
      +(cur?'　いまは <b>'+esc(shortName(cur))+'</b>':'　いまは空きです')+'</div>'
    +(cur?'<button class="btn ghost" id="slotClear" style="margin-bottom:10px">'
        +'空きにする</button>':'')
    +'<div class="picks">'+list.map(c=>{
        const at=S.squad.indexOf(c.id);          // 既に入っている枠(-1 なら控え)
        return '<div class="pick'+(c.id===S.squad[ix]?" on":"")+'" data-pick="'+c.id+'">'
          // 左端の「›」だけは**入れ替えずに詳細を開く**。行そのものは入れ替え。
          +'<button class="pk-i" data-info="'+c.id+'" aria-label="詳細">›</button>'
          +'<div class="pk-ovr'+(sub?effClass(c,sub):"")+'">'
            +(sub?effOvr(c,sub):c.ovr)+'</div>'
          +'<div class="pk-b"><b>'+esc(c.name)+'<i class="awk">'+starOf(c)+'</i>'+loanTag(c)+'</b>'
            +'<span>'+c.subs.join(" / ")+'</span></div>'
          +'<div class="pk-r">'
            +(at>=0&&at!==ix?'<span class="pk-at">'+squadSlotLabel(at)+'</span>':'')+'</div>'
        +'</div>';
      }).join("")+'</div>';

  $("slotClose").onclick=closeSlot;
  if(cur)$("slotClear").onclick=()=>setSlot(ix,null);
  $("slotModalBody").querySelectorAll("[data-pick]").forEach(el=>{
    el.onclick=()=>setSlot(ix,Number(el.dataset.pick));
  });
  // 詳細はピッカーを**開いたまま**上に重ねる(閉じると並びを見失うため)。
  $("slotModalBody").querySelectorAll("[data-info]").forEach(el=>{
    el.onclick=e=>{ e.stopPropagation(); openCard(Number(el.dataset.info)); };
  });
  $("slotModal").classList.add("on");
}
const closeSlot=()=>{ $("slotModal").classList.remove("on"); _slotIx=-1; };

/** 枠に選手を入れる。他の枠にいた選手なら**その枠と入れ替える**。 */
function setSlot(ix,cardId){
  // **編成から外しても連携は消えない**(→docs/03 §3.31)。値は凍結され、戻せば続きから使える。
  // 外した時点で捨てていた頃は、ケガや不調で一時的に外すだけで積み上げが飛び、
  // 確認ダイアログを出しても「外せない」という圧にしかならなかった。
  if(cardId!=null){
    const at=S.squad.indexOf(cardId);
    if(at>=0&&at!==ix)S.squad[at]=S.squad[ix];   // 入れ替え(空きが出ない)
  }
  S.squad[ix]=cardId;
  save(); closeSlot(); renderDeck();
}

// ---------- キャプテン(→docs/03 §3.20) ----------
// 腕章を巻いた選手は**スタミナの減りが緩く、長くピッチに居られる**。
// 誰に巻くかがそのまま交代計画になるので、編成画面で決められるようにする。
const CAP_W=c=>c.ovr+(c.age-18)*1.5;      // エンジンの pickCaptain と同じ式
function autoCaptain(start){
  const list=start.filter(Boolean);
  if(!list.length)return null;
  return list.reduce((b,c)=>CAP_W(c)>CAP_W(b)?c:b,list[0]);
}
function openCaptain(){
  const start=squadCards().slice(0,TUNING.squad.starters).filter(Boolean);
  const list=start.slice().sort((a,b)=>CAP_W(b)-CAP_W(a));
  const cur=S.captain, auto=autoCaptain(start);
  $("slotModalBody").innerHTML=
    '<button class="close-btn" id="slotClose" aria-label="閉じる">×</button>'
    +'<h3>キャプテン</h3>'
    +'<div class="lg" style="margin-bottom:10px">腕章を巻いた選手は<b>スタミナの減りが'
      +Math.round((1-TUNING.fatigue.capMul)*100)+"% 緩やか</b>になり、長くピッチに居られます。"
      +"総合力と経験で並んでいます。指名しなければ <b>"+(auto?esc(shortName(auto)):"—")
      +"</b> が務めます。</div>"
    +(cur?'<button class="btn ghost" id="slotClear" style="margin-bottom:10px">'
        +'指名を外す（自動に戻す）</button>':'')
    +'<div class="picks">'+list.map(c=>
        '<div class="pick'+(c.id===cur?" on":"")+'" data-pick="'+c.id+'">'
        +'<button class="pk-i" data-info="'+c.id+'" aria-label="詳細">›</button>'
        +'<div class="pk-ovr">'+c.ovr+'</div>'
        +'<div class="pk-b"><b>'+esc(c.name)+'</b><span>'+primarySub(c)+' · '+c.age+'歳</span></div>'
        +'<div class="pk-r">'+(auto&&c.id===auto.id?'<span class="pk-at">自動</span>':'')+'</div>'
      +'</div>').join("")+'</div>';
  $("slotClose").onclick=closeSlot;
  if(cur)$("slotClear").onclick=()=>setCaptain(null);
  $("slotModalBody").querySelectorAll("[data-pick]").forEach(el=>{
    el.onclick=()=>setCaptain(Number(el.dataset.pick));
  });
  $("slotModalBody").querySelectorAll("[data-info]").forEach(el=>{
    el.onclick=e=>{ e.stopPropagation(); openCard(Number(el.dataset.info)); };
  });
  $("slotModal").classList.add("on");
}
function setCaptain(cardId){ S.captain=cardId; save(); closeSlot(); renderDeck(); }

// ---------- セットプレー担当(→docs/06 §6.15 / docs/07 §7.11) ----------
// 蹴る種類ごとに見る能力が違う。**指名は先発にしか効かない**(蹴る人が居ないため)。
const SP_KINDS=[["pk","PK","ペナルティキック"],["fk","FK","フリーキック"],
                ["ck","CK","コーナーキック"]];
const SP_WEIGHT={ pk:c=>c.atk*1.2+c.tec, fk:c=>c.tec*1.2+c.atk*0.8, ck:c=>c.pow+c.atk*0.6 };
/** 指名が無いときに蹴る選手。**エンジンの spKicker と同じ式**で選ぶ。 */
function autoKicker(start,kind){
  const out=start.filter(c=>c&&primarySub(c)!=="GK");
  if(!out.length)return null;
  const w=SP_WEIGHT[kind];
  return out.reduce((b,c)=>w(c)>w(b)?c:b,out[0]);
}
function openKicker(kind){
  const start=squadCards().slice(0,TUNING.squad.starters).filter(Boolean);
  const w=SP_WEIGHT[kind];
  const list=start.filter(c=>primarySub(c)!=="GK").sort((a,b)=>w(b)-w(a));
  const cur=S.kickers[kind];
  const auto=autoKicker(start,kind);
  const note={ pk:"決定力と技術で決まる", fk:"技術が主役。直接狙うか蹴り込むかは位置しだい",
    ck:"力が主役。競り合う相手ではなく、蹴る球の質" }[kind];
  $("slotModalBody").innerHTML=
    '<button class="close-btn" id="slotClose" aria-label="閉じる">×</button>'
    +'<h3>'+kind.toUpperCase()+' を蹴る選手</h3>'
    +'<div class="lg" style="margin-bottom:10px">'+note
      +'　指名しなければ <b>'+(auto?esc(shortName(auto)):"—")+'</b> が蹴ります。</div>'
    +(cur?'<button class="btn ghost" id="slotClear" style="margin-bottom:10px">'
        +'指名を外す（自動に戻す）</button>':'')
    +'<div class="picks">'+list.map(c=>
        '<div class="pick'+(c.id===cur?" on":"")+'" data-pick="'+c.id+'">'
        +'<button class="pk-i" data-info="'+c.id+'" aria-label="詳細">›</button>'
        +'<div class="pk-ovr">'+Math.round(w(c))+'</div>'
        +'<div class="pk-b"><b>'+esc(c.name)+'</b><span>'+c.subs.join(" / ")+'</span></div>'
        +'<div class="pk-r">'+(c.id===auto.id?'<span class="pk-at">自動</span>':'')+'</div>'
      +'</div>').join("")+'</div>';
  $("slotClose").onclick=closeSlot;
  if(cur)$("slotClear").onclick=()=>setKicker(kind,null);
  $("slotModalBody").querySelectorAll("[data-pick]").forEach(el=>{
    el.onclick=()=>setKicker(kind,Number(el.dataset.pick));
  });
  $("slotModalBody").querySelectorAll("[data-info]").forEach(el=>{
    el.onclick=e=>{ e.stopPropagation(); openCard(Number(el.dataset.info)); };
  });
  $("slotModal").classList.add("on");
}
function setKicker(kind,cardId){
  S.kickers[kind]=cardId;
  save(); closeSlot(); renderDeck();
}

// ---------- 陣形を選ぶ(→docs/06 §6.15) ----------
/** 枠の内訳(GKを除いた大分類ごとの数)。"4-4-2" のような呼び名の裏付けになる。 */
function formShape(form){
  const n={ DF:0, MF:0, FW:0 };
  FORMATIONS[form].forEach(([sub])=>{ const g=subGroup(sub); if(n[g]!=null)n[g]++; });
  return n;
}
/**
 * 陣形のピッカー。**いまの11人をその陣形へ並べ直したときの総合力**を各行に出す。
 * 陣形は好みではなく「手持ちがどの形に噛み合うか」で選ぶものなので、
 * 選ぶ前に結果が見えないと判断できない。
 */
function openForm(){
  const keys=Object.keys(FORMATIONS);
  const rows=keys.map(f=>{
    const ids=refitSquad(f);
    return { f, pw:squadPowerAt(ids.map(cardById),f),
      off:FORMATIONS[f].filter(([sub],i)=>{
        const c=cardById(ids[i]); return c&&fitTier(c,sub)!=="a";
      }).length };
  });
  const best=Math.max(...rows.map(r=>r.pw));

  $("formModalBody").innerHTML=
    '<button class="close-btn" id="formClose" aria-label="閉じる">×</button>'
    +'<h3>陣形</h3>'
    +'<div class="lg" style="margin-bottom:10px">'
      +'いまの11人をその形に並べ直したときの総合力です。選手は入れ替わりません。</div>'
    +'<div class="picks">'+rows.map(r=>{
        const n=formShape(r.f);
        // **数字に色は付けない**。黄と赤は「枠適性で目減りしている」印として
        // 使っているので、ここで別の意味に流用すると読み違える(→docs/06 §6.15)。
        // 最も高い形にだけバッジを出す。
        return '<div class="pick'+(r.f===S.form?" on":"")+'" data-form="'+esc(r.f)+'">'
          +'<div class="pk-ovr">'+r.pw+'</div>'
          +'<div class="pk-b"><b>'+esc(r.f)+(r.f===S.form?'　<i class="own">使用中</i>':'')+'</b>'
            +'<span>DF '+n.DF+' / MF '+n.MF+' / FW '+n.FW
            +(r.off?'　枠に合わない '+r.off+'人':'')+'</span></div>'
          +'<div class="pk-r">'+(r.pw===best?'<span class="pk-best">最適</span>':'')+'</div>'
        +'</div>';
      }).join("")+'</div>';

  $("formClose").onclick=closeForm;
  $("formModalBody").querySelectorAll("[data-form]").forEach(el=>{
    el.onclick=()=>setForm(el.dataset.form);
  });
  $("formModal").classList.add("on");
}
const closeForm=()=>$("formModal").classList.remove("on");
/** 陣形を変える。**選手は入れ替えず**、同じ11人を新しい枠へ並べ直す。 */
function setForm(f){
  if(!FORMATIONS[f])return;
  S.form=f; S.squad=refitSquad();
  save(); closeForm(); renderDeck();
  toast("陣形を "+f+" に変更（同じ11人を並べ直しました）");
}

/** カード詳細(→docs/06 §6.12)。IDでもカードそのものでも開ける(見本は所持していないため)。 */
function openCard(x,opts){
  const c=(x&&typeof x==="object")?x:cardById(x); if(!c)return;
  const foe=opts&&opts.club;                     // 相手の下見(→docs/03 §3.34)
  const nation=nationById(c.nation);
  // **シートにホロは掛けない**(→docs/06 §6.13)。段の色は縁と光だけで示す。
  // ホロを全面に掛けると、WORLD CLASS の虹が能力バーや文字の上を流れて読めない。
  // カードそのもの(下の .cm-card)は今までどおりホロを持つ。
  $("cardModalBody").className="cm-sheet r-"+c.rarity.toLowerCase();
  $("cardModalBody").innerHTML=
    '<button class="cm-x" id="cardModalClose" aria-label="閉じる">×</button>'
    // 上半分は一覧と同じカードそのもの(同じ部品を大きく見せる)
    +'<div class="pcard cm-card '+rarClass(c)+'"'+cardBgStyle(c)+'>'+cardFace(c)+'</div>'
    +'<div class="cm-b">'
      +'<div class="cm-name">'+esc(c.name)+'</div>'
      +'<div class="cm-sub">'+c.pos+' · '+esc(c.club||"—")+' · '+esc(nation?nation.name:(c.nat||c.nation))
        // **体つき**(→docs/03 §3.27)。素の重みの選手には何も付かない
        +(c.body?' · <b class="cm-body">'+esc(c.body)+'</b>':'')+'</div>'
      +'<div class="cm-facts">'
        +'<div><span>年齢</span><b>'+c.age+'歳</b></div>'
        +'<div><span>得意ポジション</span><b>'+c.subs.join(" / ")+'</b></div>'
        // 信頼(→docs/03 §3.39)。**師弟になれば任期をまたいで連れていける**ので、
        // どこまで育っているかが見えないと、育てる理由が見えない
        +'<div><span>信頼</span><b>'+(isMentor(c.id)
          ?'<i class="cm-mt">師弟</i>'
          :trustOf(c.id)+' / '+TUNING.trust.need)+'</b></div>'
      +'</div>'
      +'<div class="cm-k">ABILITY <span class="cm-cap">/ '+STAT_MAX+'</span></div>'
      // 訓練の経験点(→docs/03 §3.30)は**バーそのものを左から緑に塗って**見せる。
      // ぜんぶ緑になった=経験点が満ちた=覚醒できる。説明文はいらない。
      // 覚醒した回数は★で、**バーに重ねて**左から並べる(★のために桁を空けない)。
      +'<div class="bars">'+STAT_KEYS.map(k=>{
        const ex=trainExp(c.id,k), need=TUNING.train.need, up=trainUp(c.id,k);
        return '<div class="bar"><span>'+STAT_LABEL[k]+'</span>'
        +'<div class="trw">'
          +'<div class="tr'+(ex>=need?' rdy':'')+'">'
            +'<i style="width:'+Math.round(c[k]/STAT_MAX*100)+'%"></i>'
            +(ex?'<u style="width:'+Math.min(100,Math.round(ex/need*100))+'%"></u>':"")
          +'</div>'
          +(up?'<s>'+"★".repeat(up)+'</s>':"")
        +'</div>'
        +'<b>'+c[k]+'</b></div>';
      }).join("")+'</div>'
      +'<div class="cm-k">SKILLS</div>'
      // 効果は**タップで浮かせる**(→docs/03 §3.21)。常に添えると説明が4行並んで、
      // 肝心の「何を持っているか」が読み取れなくなる
      // **固有スキルは金縁**(→docs/03 §3.41)。並びの中で一目で分かるようにする
      +'<div class="skills">'+c.skills.map((s,i)=>'<span class="skill'
        +((SKILL_FX[s]&&SKILL_FX[s].sig)?" sig":"")+'" data-sk="'+i+'">'
        +esc(s)+'</span>').join("")
        +'<div class="skill-pop" id="skPop" hidden></div></div>'
      +'<div class="cm-k">COMBINATION</div>'
      +'<div class="cm-combo">'+esc(c.club||"—")+'</div>'
      +'<div class="cm-k">PROFILE</div>'
      +'<div class="cm-bio">'+esc(bioOf(c))+'</div>'
      +'<div class="cm-own">'+(foe
        ? esc(foe)+" の選手 — 対戦相手として出てきます"
        : isLoaned(c)
        ? "<span class=\"loan\">(CLUBS)</span> クラブからの貸与 — 退任するとこのクラブに残ります"
        : "自分のカード — 移籍しても連れて行けます")+'</div>'
    +'</div>';
  bindSkillPop(c.skills);
  $("cardModalClose").onclick=closeCard;
  $("cardModal").classList.add("on");
}
const closeCard=()=>$("cardModal").classList.remove("on");
/** PROFILE の紹介文。カードの属性から組み立てる(専用のテキストは持たない)。 */
function bioOf(c){
  const n=nationById(c.nation), best=STAT_KEYS.reduce((a,k)=>c[k]>c[a]?k:a,STAT_KEYS[0]);
  const age=c.age<=21?"若手":c.age>=31?"ベテラン":"円熟期";
  const multi=c.subs.length>1?"、"+c.subs.join("と")+"をこなす":"";
  return (n?n.name:c.nation)+"出身の"+c.age+"歳"+multi+"。"
    +age+"の"+primarySub(c)+"で、"+STAT_LABEL[best]+"に長ける。";
}

// ---------- DECK(編成) ----------
/** 選手の地色と枠色。地 = クラブカラー / 枠 = レアリティ(→docs/06 §6.15)。 */
function kitStyle(c){
  return ' style="--kit:'+clubColor(S.club?S.club.id:"")
    +';--kit-ink:'+clubInk(S.club?S.club.id:"")+';--rar:var(--rar-'
    +c.rarity.toLowerCase()+')"';
}
/** プレー絵(→docs/03 §3.19)。無ければ null。 */
const playArt=c=>{
  const art=c&&artKeyOf(c);
  return (art&&artOf(art+"_play"))||null;
};
/**
 * 編成画面に置く選手の姿(→docs/06 §6.15)。**丸の代わりに立ち絵**を出す。
 * 足元にチームカラーの影を敷いて、ピッチ上の見え方(→§6.17)と揃える。
 */
function figHtml(c,cls,extra,cond){
  const src=playArt(c);
  // コンディションは**選手の後ろから放射状に光る**(→docs/03 §3.32)。
  // 印を並べるより、盤面を見渡したときに「誰が来ているか」が一目で分かる。
  const v=(c&&cond!=null)?clamp(cond,COND_HURT,COND_MAX):null;
  return '<div class="fig '+cls+(v!=null?" cd-"+v:"")+'"'+(c?kitStyle(c):"")+'>'
    +(v?'<i class="fig-aura"></i>':'')          // ケガ(0)は光らない。立ち絵が沈む
    +'<i class="fig-sh"></i>'
    +(src?'<img src="'+src+'" alt="">':'<i class="fig-dot"></i>')
    +(extra||"")
  +'</div>';
}
/** 覚醒の★(→docs/03 §3.30)。名前の下に置く。 */
// **★が上限まで並んだら金**(→docs/03 §3.30)。黄金の連携線(→§3.31)と同じ色で、
// 「もう伸びしろが無い = 仕上がった」を盤面の上で一目で分かるようにする。
const starRow=c=>{ const n=c?trainStar(c.id):0;
  return n?'<div class="fig-star'+(n>=TUNING.train.maxStar?" full":"")+'">'
    +"★".repeat(n)+'</div>':""; };
// コンディション(→docs/03 §3.32)は**オーラ**で見せる。**自チームの編成でだけ**。
// 相手の下見(→§3.34)では出さない — こちらが知りようのない情報だから。
//
// **ケガだけは印を残す。** 光らないことは「良くない」までしか伝えず、
// 「試合に出せない」という重さが出ない。印は**立ち絵の左**、OVRと同じ高さ・大きさ
// (名前に重ねると読めず、右上に並べると実効値を押しのける)。
const COND_NAME=["治療中","不調","普通","好調","絶好調"];
const condOn=(c,on)=>(c&&on)?clamp(condOf(c.id),COND_HURT,COND_MAX):null;
const hurtMark=v=>v===COND_HURT?'<i class="cnd" title="'+COND_NAME[0]+'">✚</i>':"";
// ---------- 編成の見た目(自チームと相手で共有 → docs/03 §3.34) ----------
// **自チームと相手を同じ形で見せる。** 違うのは触れるかどうかだけで、ピッチも控えも
// CAPもセットプレーも同じ部品から作る。片方だけ直して見た目が食い違うのを防ぐ。

/** ピッチの11人。位置は FORMATIONS が持つ % をそのまま使う。 */
function pitchHtml(cards,form,opts){
  const on=!!(opts&&opts.cond);
  return FORMATIONS[form].map(([sub,x,y],i)=>{
    const c=cards[i], v=condOn(c,on);
    return '<div class="slot'+(c?"":" empty")+(v===COND_HURT?" hurt":"")
      +'" style="left:'+x+'%;top:'+y+'%"'
      +' data-slot="'+i+'"'+(c?' data-card="'+c.id+'"':'')+'>'
      +'<div class="sl-pos'+(c?" fit-"+fitTier(c,sub):"")+'">'+sub+'</div>'
      // **立ち絵の右上に実効値**を出す。素のOVRを出すと、50%の選手のほうが
      // 大きく見えて「置き間違いのほうが強い」という逆の読みになる。
      +figHtml(c,"sl-fig",
        '<b class="sl-ovr'+(c?effClass(c,sub):"")+'">'+(c?effOvr(c,sub):"+")+'</b>'
        +hurtMark(v),v)
      +'<div class="sl-name">'+(c?esc(shortName(c)):"空き")+'</div>'
      +starRow(c)
    +'</div>';
  }).join("");
}
/** 控え。枠のポジションを持たないので適性は掛からず、素のOVRを出す(→docs/03 §3.17)。 */
function benchHtml(cards,opts){
  const cond=!!(opts&&opts.cond);
  const N=TUNING.squad.starters;
  return Array.from({length:TUNING.squad.bench},(_,k)=>{
    const c=cards[N+k];
    return '<div class="bn'+(c?"":" empty")+(condOn(c,cond)===COND_HURT?" hurt":"")
      +'" data-slot="'+(N+k)+'"'+(c?kitStyle(c):"")+'>'
      +figHtml(c,"bn-fig",hurtMark(condOn(c,cond)),condOn(c,cond))
      +'<div class="bn-ovr">'+(c?c.ovr:"+")+'</div>'
      +'<div class="bn-name">'+(c?esc(shortName(c)):"空き")+'</div>'
      +starRow(c)
      +'<div class="bn-pos">'+(c?primarySub(c):"控え"+(k+1))+'</div></div>';
  }).join("");
}
/**
 * CAP と セットプレーの共通タイル(→docs/06 §6.15)。同じ「1人を指名する枠」なので
 * 形をそろえる。相手の下見では指名できないので、行き先の `›` を出さない。
 */
function ptileHtml(c,cls,band,sub,go,attr){
  return '<div class="ptile '+cls+'"'+(attr||"")+(c?kitStyle(c):"")+'>'
    +figHtml(c,"cap-fig")+'<div class="cap-band">'+band+'</div>'
    +'<div class="cap-b"><div class="cap-nm">'
      +(c?esc(c.name)+'<i class="awk">'+starOf(c)+'</i>':"—")+'</div>'
      +'<div class="cap-sub">'+sub+'</div></div>'
    +(go?'<div class="cap-go">›</div>':"")
  +'</div>';
}

function renderDeck(){
  const slots=FORMATIONS[S.form], cards=squadCards();
  const start=cards.slice(0,TUNING.squad.starters);
  // 総合力は**配置込み**で出す。この画面で決めるのは「誰をどこに置くか」なので、
  // 適性を無視した平均を見せても判断材料にならない(→docs/06 §6.15)。
  const raw=squadPower(start), fit=squadPowerAt(cards,S.form);
  $("deckPower").textContent=fit;
  $("deckCoach").textContent=S.coach?("監督 "+S.coach):"監督";
  $("deckForm").textContent="陣形: "+S.form
    +(fit<raw?"　適性ロス −"+(raw-fit):"");

  // ピッチ上の11人。枠のポジション名の濃さが、そのまま**その枠への適性**を表す。
  $("deckSlots").innerHTML=pitchHtml(cards,S.form,{ cond:true });
  // 連携の線(→docs/03 §3.31)。**しきい値を超えた組だけ**を白い線で結ぶ。
  // 太さが段。誰と誰が噛み合っているかを、盤面の上でそのまま見せる(WCCF踏襲)。
  {
    const N=TUNING.squad.starters, ln=[];
    for(let i=0;i<N;i++)for(let j=i+1;j<N;j++){
      const a=cards[i], b=cards[j];
      if(!a||!b)continue;
      const t=bondTier(bondSum(a.id,b.id),bondIsGold(a.id,b.id));
      if(t)ln.push('<line x1="'+slots[i][1]+'" y1="'+slots[i][2]+'"'
        +' x2="'+slots[j][1]+'" y2="'+slots[j][2]+'" class="lk t'+t+'"/>');
    }
    $("deckLinks").innerHTML=ln.join("");
  }
  // 枠をタップしたら**その枠に入れる選手を選ぶ**。カード詳細はピッカーの中から開く。
  $("deckSlots").querySelectorAll(".slot").forEach(el=>{
    el.onclick=()=>openSlot(Number(el.dataset.slot));
  });


  // 控え(交代要員)。先発と同じく**枠**なので、タップして差し替えられる。
  $("deckBench").innerHTML=benchHtml(cards,{ cond:true });
  $("deckBench").querySelectorAll(".bn").forEach(el=>{
    el.onclick=()=>openSlot(Number(el.dataset.slot));
  });

  // キャプテン(→docs/03 §3.20)。**指名しなければ総合力と経験で自動選出**。
  {
    const named=cardById(S.captain);
    const on=named&&start.some(c=>c&&c.id===named.id);   // 先発に居ないと務まらない
    const c=on?named:autoCaptain(start);
    $("deckCaptain").innerHTML=ptileHtml(c,"cap"+(on?"":" auto"),"CAP",
      (on?"指名":"自動")+"　スタミナの減りが "
      +Math.round((1-TUNING.fatigue.capMul)*100)+"% 緩やか",true);
    const el=$("deckCaptain").querySelector(".cap");
    if(el)el.onclick=openCaptain;
  }

  // セットプレー担当(→docs/07 §7.11)。**指名しなければ能力で自動選出**なので、
  // 空欄のままでも成立する。誰が蹴るのかは常に見えている必要があるため、
  // 自動のときも実際に蹴る選手の名前を出す。
  $("deckKickers").innerHTML=SP_KINDS.map(([k,label,note])=>{
    const named=cardById(S.kickers&&S.kickers[k]);
    const on=named&&start.some(c=>c&&c.id===named.id);   // 先発に居ないと蹴れない
    const c=on?named:autoKicker(start,k);
    // **キャプテンと同じタイル**にそろえる(→docs/06 §6.15)。
    // 同じ「1人を指名する枠」なのに形が違うと、別の機能に見える
    return ptileHtml(c,"kk"+(on?"":" auto"),label,
      (on?"指名":"自動")+'　'+note,true,' data-kick="'+k+'"');
  }).join("");
  $("deckKickers").querySelectorAll("[data-kick]").forEach(el=>{
    el.onclick=()=>openKicker(el.dataset.kick);
  });

  // 注記は**状態だけ**を出す。読み方の説明はヘルプタブへ寄せる(→docs/06 §6.16)。
  const loaned=start.filter(c=>c&&isLoaned(c)).length;
  const off=slots.filter(([sub],i)=>cards[i]&&fitTier(cards[i],sub)!=="a").length;
  $("deckNote").innerHTML="クラブからの貸与 <b>"+loaned+"人</b>"
    +"　／　枠に合っていない選手 <b>"+off+"人</b>";
}
// ---------- 相手の下見(→docs/03 §3.34) ----------
// **対戦表から相手の編成をそのまま覗ける。** 自分の編成画面と同じ形で見せるのは、
// 打つ手が双方向だから — 相手の並びを読んで采配や交代を決められるようにする。
// 触れるのは選手のカード詳細だけで、並べ替えはできない。
let _foe=null;                 // { kind:"club"|"cup", … } 見ている相手
let _foeCards=[];              // 描画したカードの実体(相手のIDでは cardById が引けない)
/**
 * 相手の見立て(→docs/03 §3.35)。**秘書は数字を読み上げない。**
 * 口にするのは「並び」「注目選手」「戦力差」の3つだけで、能力値は下見の画面で見てもらう。
 * 数字を喋らせると、会話ではなくスカウティングレポートの読み上げになる。
 */
function foeBrief(side){
  const start=(side.cards||[]).slice(0,TUNING.squad.starters).filter(Boolean);
  if(!start.length)return null;
  const key=start.reduce((b,c)=>c.ovr>b.ovr?c:b,start[0]);
  // その選手の**らしさ** = いちばん高い能力。これも言葉に落とす(→data.js STAT_TRAIT)
  const tk=STAT_KEYS.reduce((b,k)=>key[k]>key[b]?k:b,STAT_KEYS[0]);
  // 戦力差は**編成込み**で比べる。素の平均だと枠の噛み合いが落ちて、
  // 実際に戦った感触とずれる(→docs/06 §6.15)
  const d=squadPowerAt(squadCards(),S.form)-squadPowerAt(side.cards,side.form);
  const G=TUNING.brief;
  return { f:side.form, p:key.pos, n:shortName(key), t:STAT_TRAIT[tk],
    gap:d>=G.big?"up2":d>=G.small?"up":d<=-G.big?"dn2":d<=-G.small?"dn":"even" };
}
/** 対戦表から相手を開く。spec は renderFoe がそのまま解釈する。 */
function openFoe(spec){ _foe=spec; show("foe",{push:1}); }
/** 対戦表の行に下見のリンクを掛ける。自クラブの行は対象外(自分は編成画面で見る)。 */
function wireFoeLinks(root){
  root.querySelectorAll("[data-club]").forEach(el=>{
    const id=el.dataset.club;
    if(id===S.club.id)return;
    el.onclick=()=>openFoe({ kind:"club", clubId:id });
  });
}
function renderFoe(){
  const f=_foe; if(!f)return;
  // リーグの相手はクラブそのもの、カップの相手は**その回戦の枠**(→docs/03 §3.23)
  const side=f.kind==="cup"
    ? cupSide(cupById(f.cup),f.round,f.slot)
    : cpuSquad(f.clubId);
  const name=f.kind==="cup"?side.name:clubName(f.clubId);
  const coach=f.kind==="cup"
    ? coachName("cup:"+f.cup+":"+S.world.season+":"+S.career.cup.node0+":"+f.slot)
    : coachName("club:"+f.clubId);
  const cards=_foeCards=side.cards;
  const start=cards.slice(0,TUNING.squad.starters);

  $("foeCoach").textContent="監督 "+coach;
  $("foeForm").textContent="陣形: "+side.form+"　"+esc(f.sub||"");
  $("foePower").textContent=squadPowerAt(cards,side.form);
  $("foeName").textContent=name;
  $("foeSlots").innerHTML=pitchHtml(cards,side.form);
  $("foeBench").innerHTML=benchHtml(cards);
  // 相手は指名を持たないので、**試合と同じ自動選出**をそのまま出す
  $("foeCaptain").innerHTML=ptileHtml(autoCaptain(start),"cap auto","CAP","自動選出",false);
  $("foeKickers").innerHTML=SP_KINDS.map(([k,label,note])=>
    ptileHtml(autoKicker(start,k),"kk auto",label,"自動選出　"+note,false)).join("");
  // 連携の線は出さない。相手の連携は覗けるものではないし、
  // 覗けたところで打てる手が無い(→docs/03 §3.31)
  const foeCard=i=>{ const c=cards[i]; if(c)openCard(c,{ club:name }); };
  $("foeSlots").querySelectorAll(".slot").forEach(el=>{
    el.onclick=()=>foeCard(Number(el.dataset.slot));
  });
  $("foeBench").querySelectorAll(".bn").forEach(el=>{
    el.onclick=()=>foeCard(Number(el.dataset.slot));
  });
  $("foeCaptain").querySelector(".cap").onclick=()=>{
    const c=autoCaptain(start); if(c)openCard(c,{ club:name });
  };
  $("foeKickers").querySelectorAll(".kk").forEach((el,i)=>{
    el.onclick=()=>{ const c=autoKicker(start,SP_KINDS[i][0]); if(c)openCard(c,{ club:name }); };
  });
  $("foeNote").innerHTML="この11人がそのまま出てきます　／　編成は変えられません";
}

// 一覧やピッチに出す短い名前 = **姓**。表示名の並び順は国籍で変わる(日本は姓が先)ので、
// 分割して末尾を取る方法は使えない。sur を持たない古いカードだけ従来どおり分割する。
const shortName=c=>c.sur||c.name.split(" ").slice(-1)[0];

// ---------- SCOUT(→docs/03 §3.22) ----------
// **コインで引くパック。** 稼ぎをいつ補強に回すかを監督に選ばせる。
let _scoutGot=null;                    // 直前に引いたカード(画面を出し直しても残す)
function renderScout(){
  $("scoutCoins").innerHTML="所持コイン <b class=\"num\">"+fmtNum(S.club?S.club.coins:0)+"</b>";
  // **引換券はコインの上に置く**(→docs/03 §3.42)。持っているときだけ出る
  const tk=Object.keys(ticketsOf()).filter(id=>ticketById(id)).map(id=>{
    const t=ticketById(id);
    return '<div class="sc-row tk">'
      +'<div class="sc-b"><div class="sc-nm">'+esc(t.name)
        +'　<i class="sc-n">×'+ticketCount(id)+'</i></div>'
        +'<div class="sc-de">'+esc(t.note)+'</div></div>'
      +'<button class="btn sc-buy" data-ticket="'+esc(id)+'">使う</button>'
    +'</div>';
  }).join("");
  $("scoutList").innerHTML=tk+TUNING.scout.map((pk,i)=>{
    const can=S.club&&S.club.coins>=pk.cost;
    return '<div class="sc-row'+(i?" hi":"")+'">'
      +'<div class="sc-b"><div class="sc-nm">'+esc(pk.name)
        +(pk.cards>1?'　'+pk.cards+'枚':'')+'</div>'
        +'<div class="sc-de">'+esc(pk.note)+'</div></div>'
      +'<button class="btn sc-buy'+(i?"":" ghost")+'" data-pack="'+pk.id+'"'
        +(can?"":" disabled")+'>'+fmtNum(pk.cost)+'</button>'
    +'</div>';
  }).join("");
  $("scoutList").querySelectorAll("[data-pack]").forEach(el=>{
    el.onclick=()=>buyScout(el.dataset.pack);
  });
  $("scoutList").querySelectorAll("[data-ticket]").forEach(el=>{
    el.onclick=()=>useTicket(el.dataset.ticket);
  });
  drawScoutGot();
}
function drawScoutGot(){
  $("scoutOpen").innerHTML=_scoutGot?_scoutGot.map(c=>cardTile(c)).join(""):"";
  $("scoutOpen").querySelectorAll("[data-card]").forEach((el,i)=>{
    el.onclick=()=>openCard(_scoutGot[i]);
  });
}
/**
 * 引換券を使う(→docs/03 §3.42)。**コインは減らない**。
 * LEGENDS の券は、手で作った12人からまだ持っていない選手を招く。
 */
function useTicket(id){
  const t=ticketById(id); if(!t||!ticketUse(id))return;
  const rng=mulberry32((Date.now()^Math.floor(Math.random()*0xffffffff))>>>0);
  const card=id==="scoutLe"?drawLegend(rng):openScout(t,rng,1)[0];
  _scoutGot=[card];
  S.player.coll.push(card);
  save(); headUI(); renderScout();
  toast(RARITY[card.rarity].label+"　"+shortName(card)+" が加入しました");
}
function buyScout(id){
  const pk=TUNING.scout.find(x=>x.id===id); if(!pk||!S.club)return;
  if(S.club.coins<pk.cost){ toast("コインが足りません"); return; }
  S.club.coins-=pk.cost;
  // **たねは引くたびに変える**。ここは資産が増える場所なので、
  // 同じ結果を再現できてはいけない(セーブを戻して引き直す余地を作らない)。
  const rng=mulberry32((Date.now()^Math.floor(Math.random()*0xffffffff))>>>0);
  _scoutGot=openScout(pk,rng,facScoutK());       // スカウト網(→docs/03 §3.5)
  S.player.coll.push(..._scoutGot);
  seeNow("scoutDone");                           // 補強を「やった」(→docs/03 §3.43)
  save(); headUI(); renderScout();
  const best=_scoutGot.reduce((b,c)=>RAR_KEYS.indexOf(c.rarity)>RAR_KEYS.indexOf(b.rarity)?c:b);
  toast(pk.name+"：最高 "+RARITY[best.rarity].label+" "+shortName(best));
}

// ---------- SEASON(任期スケジュール = クラブ進行の起点) ----------
// card-eleven のキャリア画面にあたる位置づけ。就任から任期満了までを一望し、
// ここから各大会(リーグ戦/カップ戦)の日程へ降りていく。
function renderSeason(){
  const W=S.world, club=clubById(S.club.id), lg=leagueById(club.league);
  const r=rankOf(W.table,S.club.id), t=W.table[S.club.id];
  $("seasonHead").textContent="SEASON "+W.season+" · 任期スケジュール";
  // 見出しは引き出しの上に出るので、中では繰り返さない
  $("seasonBox").innerHTML=
    kv("クラブ",esc(club.name)+"（格★"+club.grade+"）")
    +kv("いまの舞台",lg.name+" "+divName(W.div))
    +kv("オーナーの目標",S.club.expect+"位")
    +kv("現在順位",r+"位（"+t.w+"勝"+t.d+"分"+t.l+"敗）")
    +kv("オーナーの評価",evalLabel(S.club.eval)+"（"+Math.round(S.club.eval)+"）")
    +kv("チーム熟練度",fmtNum(S.club.exp))
    // スポンサー(→docs/03 §3.40)。契約の話なのでここに置く
    +(()=>{ const sp=sponsor();
      if(!sp)return kv("スポンサー",sponPending()?"相談が来ています":"—");
      return kv("スポンサー",esc(sponsorById(sp.id).name)+"（第"+sp.until+"節まで）")
        +kv("課題",esc(sponGoalText(sp))+(sp.hit?"　達成":""))
        +kv("報酬",esc(sponPrizeText(sp)))
        +kv("支援",esc(sponAidById(sp.aid).label));
    })();

  renderTenureBar();
  renderTenureCalendar();

  // 参加中の大会。タップするとその大会の日程(順位表と結果の参照)へ。
  const played=Math.min(W.matchday-1,W.fixtures.length);
  $("seasonComps").innerHTML=
    // **ここが大会の一覧そのもの**(→docs/03 §3.23)。日程画面には出られる大会しか
    // 並べないので、「何があって何で開くのか」はこの引き出しだけが答えられる
    '<p class="side-note">条件を満たした大会は、<b>開催節にクラブチャットからエントリー</b>できます。'
      +'大会を終えると次のエントリーまで'+TUNING.cup.rest+'節あきます。</p>'
    +'<div class="comp-card" data-comp="league">'
      +'<div class="cc-l"><b><i class="cc-k">LEAGUE</i>'+esc(lg.name)+' '+divName(W.div)+'</b>'
      +'<div class="lg">'+r+'位 · 勝点'+pts(t)+'（'+played+'/'+W.fixtures.length+'節）</div></div>'
      +'<div class="cc-r">›</div></div>'
    +CUPS.map(cup=>{
      const j=(S.career.cup&&S.career.cup.id===cup.id)?S.career.cup:null;
      const won=S.player.trophies.some(t=>t.id===cup.id);
      // **エントリー中なら状態を、そうでなければ出られない理由を**書く。
      // 出られるかどうかは**その大会について**見る(cupEnterable は今節の1つを返す)
      const en=cupEnterables().some(x=>x.id===cup.id), need=cupNeedShort(cup);
      let sub;
      if(j&&j.done)             sub="終了 ／ "+cupPlaceName(cup,j)+"（"+(j.win?"優勝":"優勝 "+j.champ)+"・+"+fmtNum(j.coin)+"）";
      else if(j&&j.alive)       sub="エントリー中 ／ 次は "+cupRoundName(cup,j.round);
      else if(j)                sub="敗退（"+cupPlaceName(cup,j)+"）／ 決勝は第"+cupLastNode()+"節";
      else if(en)               sub="今節にエントリーできます ／ "+cup.rounds+"回戦";
      // **開催と条件は必ず並べて出す**。片方だけだと「いつ来るのか」か
      // 「なぜ出られないのか」のどちらかが分からなくなる
      else sub=cup.every+"の倍数の節 ／ "
        +(need||(cupNeedFull(cup)==="なし"?"参加条件なし":"参加条件クリア（"+cupNeedFull(cup)+"）"));
      return '<div class="comp-card'+(j?"":" off")+(!j&&!need?" ok":"")+'" data-comp="cup">'
        +'<div class="cc-l"><b><i class="cc-k">CUP</i>'+esc(cup.name)
        +(won?' <i class="cc-t">🏆</i>':'')+'</b>'
        +'<div class="lg">'+esc(sub)+'</div></div>'
        +'<div class="cc-r">›</div></div>';
    }).join("");
  $("seasonComps").querySelectorAll("[data-comp]").forEach(el=>{
    el.onclick=()=>{ _comp=el.dataset.comp; show("schedule",{push:1}); };
  });
}

/**
 * 任期カレンダー(SEASON画面の主役)。
 * 監督が「どんな手を打って、どんなキャリアをクラブと描いたか」を1本の帯で見せる。
 * card-eleven のキャリア日程と同じ上から下への並び。→ docs/03 §3.2.3
 */
function renderTenureCalendar(){
  const W=S.world, C=S.career, rows=[];
  let lastSeason=null, lastClub=null;

  // --- 過去: 消化した節(クラブが変わっても1本で続く) ---
  C.log.forEach((e,i)=>{
    if(e.season!==lastSeason||e.clubId!==lastClub){
      rows.push(seasonDivider(e.season,e.clubId));
      lastSeason=e.season; lastClub=e.clubId;
    }
    rows.push(logRow(e));
    // シーズンの区切り(次の記録が別シーズン)なら、その年の着地を挟む
    const nx=C.log[i+1];
    if(!nx||nx.season!==e.season||nx.clubId!==e.clubId){
      const h=S.player.history.find(x=>x.season===e.season&&x.clubId===e.clubId);
      if(h&&h.rank)rows.push('<div class="cal judge"><span class="cal-n">◆</span>'
        +'<span class="cal-b"><b>'+h.rank+'位で終了（期待に対して '+h.result+'）</b></span></div>');
    }
  });

  // --- 現在: 打ち手 → 試合 ---
  if(!C.over){
    if(lastSeason!==W.season||lastClub!==S.club.id)rows.push(seasonDivider(W.season,S.club.id));
    if(seasonOver())rows.push('<div class="cal judge"><span class="cal-n">◆</span>'
      +'<span class="cal-b"><b>全日程を終了。HOMEで今季を終えられます</b></span></div>');
    else rows.push(currentRow());
  }

  // --- 未来: 任期の上限まで枠を並べる ---
  // リーグの日程は節に固定しない(カップが割り込むため)。既に決まっている予定だけを
  // 枠に書き込み、それ以外は「未定」の空枠として先に見せる(→docs/03 §3.2.3)。
  for(let n=C.node+(C.over?0:1);n<=C.limit;n++){
    const p=C.plan[n], cu=cupCalNote(n);
    if(p)rows.push('<div class="cal fut planned"><span class="cal-n num">'+n+'</span>'
      +'<span class="cal-b"><b>'+esc(p.label)+'</b>'
      +'<span class="lg">'+(p.comp==="cup"?"カップ戦":"リーグ戦")+'（予定確定）</span></span>'
      +'<span class="cal-r">▣</span></div>');
    // **カップの開催日は先に見せる**。エントリー後は大会の予定がそのまま並ぶ(→docs/03 §3.23)
    else if(cu)rows.push('<div class="cal fut '+cu.cls+'"><span class="cal-n num">'+n+'</span>'
      +'<span class="cal-h">🏆</span>'
      +'<span class="cal-b"><b>'+esc(cu.label)+'</b>'
      +'<span class="lg">'+esc(cu.sub)+'</span></span>'
      +'<span class="cal-r">'+cu.mark+'</span></div>');
    else rows.push('<div class="cal none"><span class="cal-n num">'+n+'</span>'
      +'<span class="cal-b"><b>未定</b></span></div>');
  }

  $("seasonCal").innerHTML=rows.join("");
  wireCurrentRow();
}
/**
 * その節にカップの予定があるか。エントリー中なら**大会の予定表がそのまま並ぶ**
 * (決勝・準決勝…)。まだ入っていない大会は開催日だけを先に見せる(→docs/03 §3.23)。
 */
function cupCalNote(n){
  const c=S.career.cup;
  if(c&&!c.done){
    const cup=cupById(c.id), i=cupNodes().indexOf(n);
    if(i>=0)return { label:cup.name+" "+cupRoundName(cup,i+1),
      sub:c.alive?"エントリー中の大会":"敗退のため不参加（進行は確認できます）",
      cls:c.alive?"planned cup":"planned cup out", mark:c.alive?"▣":"—" };
  }
  // 同じ節に重なったら格の高いほうを出す(エントリーの判定と揃える)
  const on=CUPS.filter(cup=>cupDay(cup,n)).sort((a,b)=>b.prize[0]-a.prize[0]);
  if(!on.length)return null;
  // **出られない節でも開催日は見せる**。大会が8つあるので(→docs/03 §3.23)、
  // 進行中や間隔待ちのあいだ先の予定が全部消えると、次にどれを狙うか決められない
  // **その節に何が塞いでいるかで書き分ける**。進行中の大会が終わる節と、
  // そこから間隔があく節では待つ理由が違う。全部同じ文にすると先の予定まで嘘になる
  const nodes=(c&&!c.done)?cupNodes():null, last=nodes?nodes[nodes.length-1]:0;
  const rest=nodes?last+TUNING.cup.rest:(S.career.cupRest||0);
  const also=on.length>1?"（他"+(on.length-1)+"大会と同日・選べます）":"";
  const sub=n<=last?"開催予定（大会が終わるまで参加できません）"
    :n<rest?"開催予定（前の大会から"+TUNING.cup.rest+"節あきます）"
    :cupOpen(on[0])?"開催予定（エントリーできます）":"開催予定（条件を満たせば参加できます）";
  return { label:on[0].name+(on.length>1?" 他":""), sub:sub+also, cls:"cup soon", mark:"◇" };
}
const seasonDivider=(season,clubId)=>
  '<div class="cal-div"><span>SEASON '+season+'</span><b>'+esc(clubName(clubId))+'</b></div>';
const kv=(k,v)=>'<div class="kv"><span>'+k+'</span><b>'+v+'</b></div>';

// ---------- SCHEDULE(大会の日程表。参照用) ----------
// ここは「その大会がどうなっているか」を見る画面。
// 監督が何を選んでどんなキャリアを描いたかは SEASON の任期カレンダーが持つ(→§3.2.3)。
let _comp="league";
function renderSchedule(){
  document.querySelectorAll("#scr-schedule .comp").forEach(b=>b.classList.toggle("on",b.dataset.comp===_comp));
  if(_comp==="cup"){ renderCupSchedule(); return; }

  const W=S.world, lg=leagueById(clubById(S.club.id).league);
  $("schedHead").textContent=lg.abbr+" "+lg.name.toUpperCase()+" · "+divName(S.world.div);
  $("schedList").innerHTML=W.fixtures.map((round,i)=>{
    const m=round.find(x=>x.h===S.club.id||x.a===S.club.id);
    const md=i+1, done=md<W.matchday, next=md===W.matchday;
    const home=m.h===S.club.id, opp=home?m.a:m.h;
    // 行ごと相手の下見へのリンク(→docs/03 §3.34)
    return '<div class="cal foe'+(next?" next":"")+(done?" done":"")+'"'
      +' data-club="'+opp+'" role="button" tabindex="0">'
      +'<span class="cal-n num">'+md+'</span>'
      +'<span class="cal-c" style="background:'+clubColor(opp)+'"></span>'
      +'<span class="cal-b"><b>'+esc(clubName(opp))+'</b>'
      +'<span class="lg">'+(home?"HOME":"AWAY")+'</span></span>'
      +(done?'<span class="cal-s num '+resClass(md)+'">'+scoreOf(md)+'</span>'
        :next?'<span class="cal-r next-lb">次戦</span>'
             :'<span class="cal-r">vs</span>')
      +'</div>';
  }).join("");
  wireFoeLinks($("schedList"));

  // 順位表の要約(タップで詳細へ)
  $("schedStand").innerHTML='<div class="stand-h" id="schedStandH">'
    +'<span class="sect-t">STANDINGS</span><span class="more">詳細を見る ›</span></div>'
    +'<div class="stand-box" id="schedStandBox">'+standings(W.table).slice(0,6).map(row=>
      '<div class="strow'+(row.id===S.club.id?" me":"")+'"><span class="num">'+row.rank+'</span>'
      +'<span class="nm">'+esc(clubName(row.id))+'</span><span class="num pt">'+row.pts+'</span></div>').join("")
    +'</div>';
  $("schedStandH").onclick=$("schedStandBox").onclick=()=>show("standings",{push:1});
}
/** 任期の残りを帯で見せる(何節目/上限・延命の有無)。 */
function renderTenureBar(){
  const C=S.career, pct=clamp(Math.round((C.node-1)/C.limit*100),0,100);
  $("tenureBar").innerHTML='<div class="tb-h"><span class="eyebrow">TENURE</span>'
    +'<span class="num">'+(C.node-1)+' / '+C.limit+' 節'
    +(C.limit>TUNING.tenure.limit?'（延命 +'+(C.limit-TUNING.tenure.limit)+'）':'')+'</span></div>'
    +'<div class="tb-bar"><i style="width:'+pct+'%"></i></div>'
    +(C.over?'<div class="tb-note">任期は終了しました</div>'
      :C.closing?'<div class="tb-note warn">上限に到達。この大会の決着で去就が決まります</div>':'');
}

/** 過去1節の行。「何をやってきたか」= 打ち手 + 試合結果。 */
function logRow(e){
  // **スポンサーの打ち手も記録に出す**(→docs/03 §3.40)。契約が切れたあとに
  // 過去の行を開いても名前が出るよう、handsNow ではなく汎用の呼び名で拾う
  const h=handById(e.hand)||(e.hand==="spon"?{ icon:"📣", label:"スポンサー支援" }:null);
  const cls=e.res==="win"?"w":e.res==="draw"?"d":"l";
  const mark=e.res==="win"?"○":e.res==="draw"?"△":"●";
  // カップは相手がクラブ一覧に居ないので、記録側が持っている名前をそのまま出す
  const cup=e.comp==="cup";
  const name=cup?e.oppName:clubName(e.opp);
  const sub=cup?e.label+(e.champ?" ／ 優勝":"")
            :"S"+e.season+" 第"+e.md+"節 ／ "+(e.home?"HOME":"AWAY");
  return '<div class="cal done'+(e.champ?" champ":"")+'">'
    +'<span class="cal-n num">'+e.node+'</span>'
    +'<span class="cal-h" title="'+(h?h.label:"")+'">'+(cup?"🏆":(h?h.icon:"—"))+'</span>'
    +'<span class="cal-b"><b>'+esc(name)+'</b>'
    +'<span class="lg">'+esc(sub)+'</span></span>'
    +'<span class="cal-s num '+cls+'">'+mark+' '+e.gf+'-'+e.ga+'</span></div>';
}

/**
 * 現在節のタイル(→docs/03 §3.29)。**ここでは何も決めない。**
 * タップするとクラブチャットが開き、そこで打ち手も大会も決まる。
 * 節のカードに操作を詰め込むと、何をどこまで決めたのかが読み取れなくなっていた。
 */
function currentRow(){
  const C=S.career, ch=C.chat;
  const state=!ch?"クラブに集合しましょう"
    :ch.step==="ready"?"準備完了 ／ 試合へ向かえます"
    :"準備中 ／ 続きから話せます";
  // 相手が決まっていれば出す。決まるのはチャットで大会を選んでから
  const f=C.comp==="cup"?cupFixtureOf():null;
  const m=C.comp==="league"?myFixture():null;
  const foe=f?{ name:f.side.name, sub:f.label, col:f.elite?"var(--rar-spe)":"var(--accent-dim)" }
    :m?{ name:clubName(m.opp), sub:"リーグ 第"+S.world.matchday+"節 ／ "+(m.home?"HOME":"AWAY"),
         col:clubColor(m.opp) }:null;
  // **タイルごとリンク**。ボタンは置かず、行き先を一言だけ添える(→docs/06 §6.8)
  return '<div class="cal cur" id="calCur" role="button" tabindex="0">'
    +'<div class="cal-cur-h"><span class="cal-n num">'+C.node+'</span>'
    +'<span class="cal-b"><b>この節の準備</b><span class="lg">'+esc(state)+'</span></span>'
    +'<span class="cal-r">›</span></div>'
    +(foe?'<div class="cal-target"><span class="cal-c" style="background:'+foe.col+'"></span>'
      +'<span class="cal-b"><b>'+esc(foe.name)+'</b>'
      +'<span class="lg">'+esc(foe.sub)+'</span></span></div>':"")
    +'<div class="cur-go">第'+C.node+'節を開始する</div></div>';
}
const cupJoinedName=()=>{ const c=cupJoined(); return c?c.name:"カップ戦"; };
/** カップに出られない理由。**条件が見えないと待つ理由が分からない**。 */
/**
 * その大会に出られない理由(短文)。満たしていれば null。
 * **条件は4種類ある**(熟練度・部・カップ優勝数・DIV1制覇 →docs/03 §3.23)ので、
 * 熟練度だけを見ると「第11節」としか出ず、なぜ灰色なのかが分からなくなる。
 */
function cupNeedShort(cup){
  const exp=S.club?S.club.exp:0;
  if(exp<cup.needExp)return "熟練度 "+fmtNum(exp)+" / "+fmtNum(cup.needExp);
  if(cup.needDiv&&S.world.div>cup.needDiv)return divName(cup.needDiv)+"で出場権";
  if(cup.needCups&&cupWins()<cup.needCups)
    return "カップ優勝 "+cupWins()+" / "+cup.needCups;
  if(cup.needLg1&&!wonDiv1())return divName(1)+"制覇で出場権";
  return null;
}
/** 参加条件の書き出し。満たしているかに関係なく**同じ言い方**で並べる。 */
function cupNeedFull(cup){
  const a=[];
  if(cup.needExp)a.push("熟練度 "+fmtNum(cup.needExp));
  if(cup.needDiv)a.push(divName(cup.needDiv)+" 以上");
  if(cup.needCups)a.push("カップ優勝 "+cup.needCups+"回");
  if(cup.needLg1)a.push(divName(1)+"でリーグ優勝");
  return a.length?a.join(" ／ "):"なし";
}
function cupWhy(){
  const C=S.career, exp=S.club?S.club.exp:0, j=C.cup;
  if(j&&!j.done)
    return cupJoinedName()+"が進行中です。大会が終わるまで次の大会にはエントリーできません。";
  // **大会のあとは間をあける**(→docs/03 §3.23)。全部には出られない
  if(C.cupRest&&C.node<C.cupRest)
    return "大会を終えたばかりです。あと"+(C.cupRest-C.node)+"節あけば次の大会に出られます。"
      +"すべての大会には出られないので、どれを狙うかを選ぶことになります。";
  // **いちばん早く出られる大会**を基準に理由を書く
  const cand=CUPS.map(cup=>({ cup, next:(Math.floor(C.node/cup.every)+1)*cup.every }))
    .sort((a,b)=>a.next-b.next);
  const cup=(cand.find(x=>cupOpen(x.cup))||cand[0]).cup;
  if(exp<cup.needExp)
    return cup.name+"は熟練度 "+fmtNum(cup.needExp)+" から参加できます（現在 "+fmtNum(exp)+"）。";
  if(cup.needDiv&&S.world.div>cup.needDiv)
    return cup.name+"は"+divName(cup.needDiv)+"に上がると出場権が得られます（現在 "+divName(S.world.div)+"）。";
  if(cup.needCups&&cupWins()<cup.needCups)
    return cup.name+"はカップ優勝 "+cup.needCups+"回で出場権が得られます（現在 "+cupWins()+"回）。";
  if(cup.needLg1&&!wonDiv1())
    return cup.name+"は"+divName(1)+"でリーグを制すと出場権が得られます。";
  const next=(Math.floor(C.node/cup.every)+1)*cup.every;
  return cup.name+"は"+cup.every+"の倍数の節に開催されます（次は第"+next+"節）。エントリーは打ち手から選びます。";
}
function wireCurrentRow(){
  const cur=$("calCur");
  if(cur)cur.onclick=()=>show("chat",{push:1});
}
// ---------- クラブチャット(→docs/03 §3.29) ----------
// **1節の準備をここで全部決める。** 秘書がカップ戦・打ち手・予定を順に確認し、
// 最後に試合へ送り出す。選んだ内容は career.chat に残るので、
// 途中で別の画面へ行って戻ってきても会話は続きから見える。
const CHAT_STAGES=["cup","foe","hand","who","who2","menu","result","event","ready"];
const chatLine=(a,seed)=>a[Math.abs(hashStr(seed))%a.length];
/** 台詞を1つ選んで差し込む。**配列でも文字列でも同じように書ける**。 */
const chatText=(v,seed,vars)=>chatFill(Array.isArray(v)?chatLine(v,seed):v,vars||{});
/**
 * 台詞の差し込み。**{x} をまとめて置き換える**(→docs/06 §6.23)。
 * 名前を1つずつ列挙していたときは、足した差し込みを書き忘れて
 * 「{t} をやろう。」がそのまま画面に出た。ここで総なめにする。
 */
const chatFill=(t,v)=>String(t).replace(/\{(\w+)\}/g,(m,k)=>
  (v&&v[k]!=null&&v[k]!=="")?v[k]:"");
const chatSay=(w,t)=>S.career.chat.log.push({ w, t });
/** 会話を始める(その節で最初に開いたとき)。 */
function chatStart(){
  const C=S.career;
  C.chat={ log:[], i:0, step:null, sel:{} };
  chatSay("sec",chatText(CHAT.open,"open:"+C.node,{ d:C.node }));
  chatAdvance();
}
/** 入力が要る段まで進める。要らない段は台詞だけ積んで通り過ぎる。 */
function chatAdvance(){
  const ch=S.career.chat;
  let guard=0;
  while(guard++<20){
    const st=CHAT_STAGES[ch.i];
    if(!st){ ch.step=null; return; }
    if(chatEnter(st)){ ch.step=st; return; }
    ch.i++;
  }
  ch.step=null;
}
/** その段に入る。**入力が要るなら true**。 */
function chatEnter(st){
  const C=S.career, ch=C.chat, sel=ch.sel;
  if(st==="cup"){
    if(cupMustPlay()){ pickComp("cup"); return false; }   // 勝ち残り中は選ぶ余地がない
    const list=cupEnterables();
    if(!list.length)return false;
    sel.cup=list[0].id;
    // **重なった日は「どれに出るか」を聞く**(→docs/03 §3.23)。
    // 格の高いほうを黙って選ぶと、あえて下位大会を獲りにいく手が消える
    chatSay("sec",list.length>1
      ? chatText(CHAT.cupPick,"cupPick:"+C.node,{ c:list.map(x=>x.name).join("・") })
      : chatText(CHAT.cupAsk,"cupAsk:"+C.node,{ c:list[0].name }));
    return true;
  }
  if(st==="foe"){
    if(!C.comp)pickComp("league");
    const f=C.comp==="cup"?cupFixtureOf():null;
    let side=null;
    if(f){
      chatSay("sec",chatText(CHAT.cupStay,"cupStay:"+C.node,
        { c:cupJoinedName(), r:cupRoundName(cupJoined(),f.round), f:f.side.name }));
      side=f.side;
    }else{
      const m=myFixture();
      chatSay("sec",m?chatText(CHAT.foeLeague,"foe:"+C.node,
        { f:clubName(m.opp), v:m.home?"ホーム":"アウェイ" }):"今節のリーグ戦は組まれていません。");
      if(m)side=cpuSquad(m.opp);
    }
    // **相手の見立て**(→docs/03 §3.35)。カップはエントリーの答えで相手が変わるので、
    // 大会が決まったこの位置でしか言えない。
    const b=side&&foeBrief(side);
    if(b){
      chatSay("sec",chatText(CHAT.foeScout,"scout:"+C.node,b));
      chatSay("sec",chatText(CHAT.foeGap[b.gap],"gap:"+C.node));
    }
    return false;
  }
  if(st==="hand"){
    // 治療中の選手が居れば**休息を促す**(→docs/03 §3.32)
    const h=hurtList();
    if(h.length)chatSay("sec",chatText(CHAT.restUrge,"urge:"+C.node,
      { n:shortOf(h[0].id), g:String(h.length) }));
    chatSay("sec",chatText(CHAT.handAsk,"hand:"+C.node));
    return true;
  }
  if(st==="who"){
    if(sel.hand==="rest"){
      // **休息は0〜2の選手を1段よくする**(→docs/03 §3.32)。ケガも治る
      const done=restAll(), healed=done.filter(x=>x.from===0).length;
      chatSay("sec",chatText(CHAT.restSec,"rest:"+C.node));
      chatSay("sec",chatText(done.length?(healed?CHAT.restHeal:CHAT.restDone):CHAT.restNone,
        "restR:"+C.node,{ g:String(done.length), h:String(healed) }));
      return false;
    }
    chatSay("sec",chatText(CHAT.whoAsk,"who:"+C.node));
    return true;
  }
  if(st==="who2"){
    if(sel.hand!=="bond")return false;
    chatSay(sel.who,chatText(CHAT.callBond,"cb:"+C.node));
    return true;
  }
  if(st==="menu"){
    if(sel.hand==="rest")return false;
    // **経験点が貯まっていれば覚醒イベント**(→docs/03 §3.30)。通常のメニューは出ない
    if(sel.awake){ chatSay(sel.who,CHAT.awakeAsk); return true; }
    // **連携も覚醒する**(→docs/03 §3.31)。合計がしきい値を超えた組だけ
    if(sel.bawake){
      chatSay(sel.who,chatText(CHAT.bondAwakeAsk,"bw:"+C.node,{ m:shortOf(sel.who2) }));
      return true;
    }
    // **支援はメニューを聞かない**。伸ばす能力は契約で決まっている(→docs/03 §3.40)
    if(sel.hand==="spon"){ sel.menu=sponAid().id;
      chatSay(sel.who,chatText(sponAid().ask,"sq:"+C.node)); return false; }
    if(sel.hand==="train")chatSay(sel.who,chatText(CHAT.callTrain,"ct:"+C.node));
    else chatSay(sel.who,chatText(CHAT.bondAsk,"ba:"+C.node,{ m:shortOf(sel.who2) }));
    return true;
  }
  if(st==="result"){
    if(sel.hand==="rest")return false;
    if(sel.awake){
      // 当たりは**その場でたねから決める**(選び直しで引き直せないよう節と選手で固定)
      const win=mulberry32((S.world.seed^hashStr("awake:"+C.node+":"+sel.who))>>>0)()<0.5
        ?AWAKES[0].id:AWAKES[1].id;
      const k=sel.awake;
      sel.res=sel.menu===win?"awake":"keep";
      trustHand(sel.who,"train",sel.res);          // 信頼(→docs/03 §3.39)
      if(sel.res==="awake"){
        trainAwake(sel.who,k);
        chatSay(sel.who,CHAT.awakeOk);
        chatSay("sec",chatText(CHAT.awakeSec,"aw:"+C.node));
      }else{
        chatSay(sel.who,CHAT.awakeNg);
        chatSay("sec",chatText(CHAT.awakeKeep,"ak:"+C.node));
      }
      return false;
    }
    if(sel.bawake){
      // 当たりは**その場でたねから決める**(能力の覚醒と同じ形 → §3.30)
      const win=mulberry32((S.world.seed^hashStr("bawake:"+C.node+":"+sel.who+":"+sel.who2))>>>0)()<0.5
        ?BOND_AWAKES[0].id:BOND_AWAKES[1].id;
      sel.res=sel.menu===win?"awake":"keep";
      // 連携の覚醒は**2人とも**の信頼が動く(→docs/03 §3.39)
      trustHand(sel.who,"bond",sel.res); trustHand(sel.who2,"bond",sel.res);
      const m={ m:shortOf(sel.who2) };
      if(sel.res==="awake"){
        bondAwake(sel.who,sel.who2);
        chatSay(sel.who,chatText(CHAT.bondAwakeOk,"bo:"+C.node,m));
        chatSay("sec",chatText(CHAT.bondAwakeSec,"bs:"+C.node));
      }else{
        chatSay(sel.who,chatText(CHAT.bondAwakeNg,"bn:"+C.node,m));
        chatSay("sec",chatText(CHAT.bondAwakeKeep,"bk:"+C.node));
      }
      return false;
    }
    // **手応えはランダム**(→docs/03 §3.29)。スポンサーの支援は当たりが厚い(→§3.40)
    const T=sel.hand==="spon"?TUNING.spon:TUNING.chat;
    const rng=mulberry32((S.world.seed^hashStr("chat:"+C.node+":"+sel.hand))>>>0);
    const r=rng();
    sel.res=r<T.great?"great":r<T.great+T.fail?"fail":"ok";
    const key=sel.hand==="bond"
      ?(sel.res==="great"?"bondGreat":sel.res==="fail"?"bondFail":"bondOk")
      :(sel.res==="great"?"great":sel.res==="fail"?"fail":"ok");
    chatSay(sel.who,chatText(CHAT[key],"res:"+C.node+sel.res,
      { m:sel.who2?shortOf(sel.who2):"" }));
    // **信頼は打ち手のたびに動く**(→docs/03 §3.39)。交流は相方にも同じだけ入る
    trustHand(sel.who,sel.hand,sel.res);
    if(sel.hand==="bond"&&sel.who2)trustHand(sel.who2,"bond",sel.res);
    // **交流は連携になる**(→docs/03 §3.31)。両者に同じだけ入る
    if(sel.hand==="bond"&&sel.who&&sel.who2){
      const B=TUNING.bond;
      const g=sel.res==="great"?B.great:sel.res==="ok"?B.ok:B.fail;
      sel.gain=g;
      if(g)bondAdd(sel.who,sel.who2,g);
    }
    // **訓練は経験点になる**(→docs/03 §3.30)。失敗は0
    if((sel.hand==="train"||sel.hand==="spon")&&sel.menu&&!sel.awake){
      const G=TUNING.train, t=trainById(sel.menu);
      // **練習場**(→docs/03 §3.5)で経験点が増える
      const gain=facTrainGain(sel.res==="great"?rri(rng,G.greatLo,G.greatHi)
        :sel.res==="ok"?rri(rng,G.okLo,G.okHi):0);
      trainAdd(sel.who,t.stat,gain);
      sel.gain=gain;
      // **数字は言わない**。積み上がりはカード詳細で見られる(→docs/03 §3.30)
      chatSay("sec",chatText(CHAT[sel.res==="great"?"expGreat":sel.res==="ok"?"expOk":"expFail"],
        "ex:"+C.node+sel.res));
    }
    return false;
  }
  if(st==="event"){
    // **1節に1つだけ**。順は「報酬 → 契約 → 師弟」。金の話を先に片づける
    const sp=sponsor();
    if(sp&&sp.hit&&!sp.paid){
      sel.spon="pay";
      chatSay("sec",chatText(CHAT.sponHit,"sh:"+C.node,{ n:sponsorById(sp.id).name }));
      // ポジション確定スカウトだけは**どこを厚くするか**を監督が選ぶ
      // **ポジションを選ぶ段**(2段と4段)だけ、監督にどこを呼ぶか聞く
      if(sponPrize(sp.tier).pick){
        chatSay("sec",chatText(CHAT.sponPos,"sp:"+C.node));
        return true;
      }
      sponReward(null);
      return false;
    }
    // **スポンサーが付いていなければオーナーが相談を持ってくる**(→docs/03 §3.40)
    if(sponPending()){
      sel.spon="sign";
      chatSay("sec",chatText(CHAT.sponAsk,"sq:"+C.node));
      return true;
    }
    // **師弟の相談**(→docs/03 §3.39)。打ち手のあと、秘書ではなく選手が話しかけてくる
    const m=mentorPending();
    if(m){
      sel.mentor=m;
      chatSay(m,chatText(CHAT.mentorAsk,"mt:"+C.node+":"+m));
      return true;
    }
    chatSay("sec",chatText(CHAT.eventNone,"ev:"+C.node)); return false;
  }
  if(st==="ready"){ chatSay("sec",chatText(CHAT.ready,"rd:"+C.node)); return true; }
  return false;
}
/** 監督が選んだ。**選択肢の文言がそのまま監督の発言**になる。 */
function chatPick(id,label){
  const C=S.career, ch=C.chat, sel=ch.sel, st=ch.step;
  chatSay("mgr",label);
  if(st==="cup"){
    // id は大会のID(重なった日は選べる)。"no" だけが見送り
    if(id!=="no"){
      const cup=cupEnterables().find(x=>x.id===id)||cupEnterable();
      if(cup&&enterCup(cup.id)){
        // **エントリーは手続きだけ**。打ち手は別に選ぶ(→docs/03 §3.23)。
        // 1回戦の節だけ選手を呼べないと、会話が飛ばされたようにしか読めない
        const f=cupFixtureOf();
        chatSay("sec",chatText(CHAT.cupYes,"cupYes:"+C.node,{ f:f?f.side.name:"—" }));
        ch.i++; ch.step=null; save(); chatAdvance(); return;
      }
    }
    chatSay("sec",chatText(CHAT.cupNo,"cupNo:"+C.node));
    pickComp("league");
  }
  else if(st==="event"&&sel.spon==="pay"){ sponReward(id); sel.spon=null; }
  else if(st==="event"&&sel.spon==="sign"){
    const sp=sponSign(id);
    sel.spon=null;
    if(sp)chatSay("sec",chatText(CHAT.sponYes,"sy:"+C.node,
      { n:sponsorById(sp.id).name, g:sponGoalText(sp), d:String(sp.until) }));
  }
  else if(st==="event"){
    const who=sel.mentor;
    const ok=mentorAnswer(who,id==="yes");
    chatSay(who,chatText(ok?CHAT.mentorYes:CHAT.mentorNo,"mr:"+C.node+":"+who));
    chatSay("sec",chatText(ok?CHAT.mentorSecYes:CHAT.mentorSecNo,"ms:"+C.node,
      { n:shortOf(who) }));
  }
  else if(st==="hand"){ sel.hand=id; pickHand(id); }
  else if(st==="who"){
    sel.who=+id;
    // **選んだ時点で覚醒するかが決まる**(→docs/03 §3.30)
    // 支援も強化トレーニングと同じ枝を通る(→docs/03 §3.40)
    sel.awake=(sel.hand==="train"||sel.hand==="spon")?trainReady(sel.who):null;
  }
  else if(st==="who2"){
    sel.who2=+id;
    // **相方が決まった時点で覚醒するかが決まる**(→docs/03 §3.31)
    sel.bawake=sel.hand==="bond"&&bondCanAwake(sel.who,sel.who2);
  }
  else if(st==="menu"){ sel.menu=id; }
  ch.i++; ch.step=null;
  save(); chatAdvance();
}
/** 報酬を受け取り、何が届いたかを会話に残す(→docs/03 §3.40)。 */
function sponReward(pos){
  const r=sponPay(pos);
  if(!r)return;
  if(r.kind==="coin")chatSay("sec",chatText(CHAT.sponCoin,"sc:"+S.career.node,
    { v:fmtNum(r.coin) }));
  else chatSay("sec",chatText(CHAT.sponCard,"sd:"+S.career.node,
    { n:RARITY[r.card.rarity].label+" "+shortName(r.card) }));
}
/** いま出す選択肢。 */
function chatOptions(){
  const C=S.career, ch=C.chat, sel=ch.sel, st=ch&&ch.step;
  // **監督は単語で返さない**(→docs/06 §6.23)。選択肢は短く、発言は文にする
  const N=C.node;
  if(st==="cup"){
    // **重なった日は大会ごとに選択肢を出す**(→docs/03 §3.23)。1つなら今までどおり
    const list=cupEnterables();
    const one=list.length<2;
    return { q:one?"どうしますか":"どの大会に出ますか", items:list.map(c=>({
        id:c.id,
        label:one?"エントリーする":c.name,
        say:one?chatText(CHAT.sayCupYes,"sy:"+N):c.name+"へ。",
        sub:one?"勝ち続ける限りリーグ戦は進められません"
          :c.rounds+"回戦 ／ 優勝 "+fmtNum(c.prize[0])+"コイン・名声 "+fmtNum(c.fame[0]) }))
      .concat([{ id:"no", label:"今節は見送る", say:chatText(CHAT.sayCupNo,"sn:"+N),
        sub:"リーグ戦に集中します" }]) };
  }
  if(st==="event"){
    if(sel.spon==="pay")return { q:"どのポジションを呼びますか",
      items:POS.map(g=>({ id:g, label:g, say:g+" を頼む。" })) };
    if(sel.spon==="sign")return { q:"どこと契約しますか", items:sponOffers().map(o=>({
      id:o.id, label:o.name,
      // **課題と報酬と支援を並べて見せる**。これが選ぶ材料そのもの
      sub:sponGoalText({ ...o, until:C.node+TUNING.spon.term })
        +" ／ "+sponPrizeText(o)+" ／ 支援 "+sponAidById(o.aid).label,
      say:o.name+"と組もう。" })) };
    return { q:"どう答えますか", items:MENTORS.map(m=>({
      id:m.id, label:m.label, sub:m.sub, say:m.label+"。" })) };
  }
  if(st==="hand")return { q:"打ち手を選ぶ",
    // **説明は添えない**(→docs/06 §6.24)。違いは覚えるもので、毎節読むものではない。
    // スポンサーが付いていれば4つ目が増える(→docs/03 §3.40)
    items:handsNow().map(h=>({ id:h.id, label:h.icon+" "+h.label,
      say:h.id==="spon"?chatText(CHAT.sponAid,"sa:"+N,{ a:h.label })
        :chatText(CHAT[h.id==="train"?"sayTrain":h.id==="bond"?"sayBond":"sayRest"],
        "sh:"+N+h.id) })) };
  // **★とチャンスを一覧に並べる**(→docs/03 §3.30)。誰を伸ばしてきたかが選ぶ前に分かる
  if(st==="who"||st==="who2")return { q:st==="who"?"誰を呼びますか":"相方を選びますか",
    grid:true, items:chatSquad(st==="who2"?sel.who:null)
      .map(c=>({ id:String(c.id), label:shortName(c), rar:c.rarity,
        say:chatText(st==="who"?CHAT.sayWho:CHAT.sayWho2,"sw:"+N+c.id,
          { n:shortName(c), m:shortName(c) }),
        star:trainStar(c.id),
        // **覚醒できる選手は枠が光る**。文字で「覚醒」とは書かない(→docs/03 §3.30)。
        // 交流では「呼ぶ側」は覚醒できる相手が居るか、「相方」はその組が挑めるか
        hot:(sel.hand==="train"||sel.hand==="spon")?(st==="who"&&!!trainReady(c.id))
          :st==="who"?bondReadyWith(c.id)
          :bondCanAwake(sel.who,c.id),
        sub:primarySub(c)+" ・ OVR "+c.ovr })) };
  if(st==="menu"){
    if(sel.awake)return { q:"どう声をかけますか",
      items:AWAKES.map(a=>({ id:a.id, label:a.label, say:a.label+"。" })) };
    if(sel.bawake)return { q:"二人にどう声をかけますか",
      items:BOND_AWAKES.map(a=>({ id:a.id, label:a.label, say:a.label+"。" })) };
    return sel.hand==="train"
      ? { q:"メニューを指示する", items:TRAININGS.map(t=>({ id:t.id, label:t.label,
          say:chatText(CHAT.sayMenu,"sm:"+N+t.id,{ t:t.label }) })) }
      : { q:"何をさせますか", items:BONDS.map(b=>({ id:b.id, label:b.label,
          say:b.label+"。" })) };
  }
  return null;
}
/** 呼べる選手(先発11 + 控え)。except は相方選びで自分を外すため。 */
function chatSquad(except){
  return (S.squad||[]).map(id=>cardById(id)).filter(Boolean).filter(c=>c.id!==except);
}
const shortOf=id=>{ const c=cardById(id); return c?shortName(c):"—"; };
/**
 * 秘書の絵(→docs/06 §6.27)。**クラブごとに決まっていて、移れば替わる**。
 * 誰になるかはクラブIDから決まるので、同じクラブなら毎回同じ人が座っている。
 * **絵を足しても JS は触らない** — ASSETS の並びをそのまま候補にする。
 */
function secretaryArt(clubId){
  const A=(window.ASSETS&&window.ASSETS.secretary)||{};
  const keys=Object.keys(A).sort();
  if(!keys.length)return null;
  const id=clubId||(S.club&&S.club.id)||"";
  return A[keys[Math.abs(hashStr("sec:"+id))%keys.length]];
}
/**
 * 話し手のアイコン(→docs/06 §6.23)。**秘書も監督も選手と同じ丸**。
 * 秘書と監督の絵はまだ無いので、シルエットのプレースホルダーを出す。
 * `src/assets/faces/sec.png` / `mgr.png` を置けば**そのまま差し替わる**
 * (絵を足すのに JS を触らない。選手の絵と同じ考え方 →docs/03 §3.19)。
 */
function chatAvatar(w,cls){
  const box=(kind,src)=>'<div class="'+(cls||"ch-sm")+' '+kind+'">'
    +(src?'<img src="'+src+'" alt="">':'<i class="ch-ph"></i>')+'</div>';
  const F=(window.ASSETS&&window.ASSETS.faces)||{};
  if(w==="sec")return box("sec",secretaryArt()||F.sec);
  if(w==="mgr")return box("mgr",F.mgr);
  const c=cardById(w);
  const art=c&&artKeyOf(c);
  return box("pl",art&&artOf(art+"_stand"));
}
function renderChat(){
  const C=S.career;
  if(!C.chat)chatStart();
  const ch=C.chat;
  // **見出しは今節の相手**(→docs/06 §6.24)。自クラブ名はヘッダーに出ているので、
  // ここで繰り返すより「誰と戦うのか」を置いたほうがこの画面の役に立つ
  const f=C.comp==="cup"?cupFixtureOf():null;
  const m=f?null:myFixture();
  const foe=f?f.side.name:m?clubName(m.opp):null;
  $("chatClub").textContent=foe?"VS "+foe:clubName(S.club.id);
  $("chatSub").textContent="第"+C.node+"節";
  // 節は見出しの副題に出ているので、ここでは繰り返さない(→docs/06 §6.24)
  $("chatAv").innerHTML=chatAvatar("sec","ch-av-in");
  $("chatLog").innerHTML=ch.log.map(m=>{
    // 監督は**右に丸**。左右で誰の発言かが形だけで分かる
    if(m.w==="mgr")return '<div class="ch-row me"><div class="ch-b">'+esc(m.t)+'</div>'
      +chatAvatar("mgr")+'</div>';
    // **選手はポジションも添える**(→docs/06 §6.24)。誰を育てるかの手掛かりになる
    const pc=m.w==="sec"?null:cardById(m.w);
    const nm=m.w==="sec"?"秘書":esc(shortOf(m.w))
      +(pc?' <i class="ch-pos">'+esc(primarySub(pc))+'</i>':"");
    return '<div class="ch-row">'+chatAvatar(m.w)
      +'<div class="ch-b"><span class="ch-nm">'+nm+'</span>'+esc(m.t)+'</div></div>';
  }).join("");
  const o=chatOptions();
  if(ch.step==="ready"){
    $("chatAsk").className="ch-ask";
    $("chatAsk").innerHTML='<button class="btn" id="chatGo">KICK OFF</button>';
    $("chatGo").onclick=()=>startMatch();
  }else if(o){
    $("chatAsk").className="ch-ask"+(o.grid?" grid":"");
    $("chatAsk").innerHTML='<div class="ch-q">'+esc(o.q)+'</div>'
      +o.items.map(it=>'<button class="ch-op'+(it.hot?" hot":"")+'" data-pick="'+esc(it.id)+'">'
        +(it.rar?'<b class="gl-abbr r-'+it.rar.toLowerCase()+'">'+RARITY[it.rar].abbr+'</b>':"")
        +esc(it.label)
        +(it.star?'<i class="awk">'+"★".repeat(it.star)+'</i>':"")
        +(it.sub?'<span class="ch-os">'+esc(it.sub)+'</span>':"")+'</button>').join("");
    $("chatAsk").querySelectorAll("[data-pick]").forEach((el,i)=>{
      // 監督の発言は**名前だけ**。★は一覧の情報であって、口には出さない
      el.onclick=()=>{ chatPick(o.items[i].id,o.items[i].say||o.items[i].label);
        renderChat(); chatBottom(); };
      el.dataset.i=i;
    });
  }else{ $("chatAsk").className="ch-ask"; $("chatAsk").innerHTML=""; }
  chatBottom();
}
/** 会話は下が最新。**開いたら必ず最新まで送る**。 */
function chatBottom(){
  setTimeout(()=>{ const el=$("chatAsk"); if(el)try{ el.scrollIntoView({block:"end"}); }catch(e){} },20);
}
SCREENS.chat.after=chatBottom;

/** 現在節が画面に入るまでスクロールする(96節あるので必須)。 */
function scrollToCurrent(){
  const el=$("calCur"); if(!el)return;
  try{ el.scrollIntoView({block:"center"}); }catch(e){}
}

/**
 * カップの日程(→docs/03 §3.23)。エントリーしていなければ開催日と条件だけ、
 * エントリー後は**大会の予定表と勝ち上がり**、決着後は結果と賞金を見せる。
 */
function renderCupSchedule(){
  const C=S.career, c=C.cup, cup=c?cupById(c.id):CUPS[0];
  // **大会は8つある**(→docs/03 §3.23)。特定の大会名を見出しに焼き付けない
  $("schedHead").textContent="CUP COMPETITIONS · KNOCKOUT STAGE";

  if(!c){
    // **出られる大会だけを並べる**。8つ全部を条件つきで並べると、いま何ができるのかが
    // 埋もれる。条件と品揃えの一覧は SEASON の日程タブが持つ(→docs/03 §3.23)
    const open=CUPS.filter(cupOpen);
    $("schedList").innerHTML=open.length
      ? open.map(x=>{
          const next=(Math.floor(C.node/x.every)+1)*x.every;
          return '<div class="cal">'
            +'<span class="cal-h">🏆</span>'
            +'<span class="cal-b"><b>'+esc(x.name)+'</b>'
            +'<span class="lg">'+esc(x.note)+'</span></span>'
            +'<span class="cal-r">第'+next+'節</span></div>';
        }).join("")
      : '<div class="cal none"><span class="cal-b"><b>出場できる大会がありません</b>'
        +'<span class="lg">'+esc(cupWhy())+'</span></span></div>';
    $("schedStand").innerHTML=open.map(x=>cupInfoBox(x,null)).join("");
    return;
  }

  const rows=cupNodes().map((n,i)=>cupRoundBlock(cup,c,i+1,n)).join("");

  // 決着の帯。**賞金は大会が完了した節にまとめて入る**ので、ここに出るのも完了後
  const head=c.done
    ? '<div class="cup-res'+(c.win?" win":"")+'">'
      +'<span class="eyebrow">RESULT</span>'
      +'<b>'+esc(c.win?"優勝":"優勝 "+c.champ)+'</b>'
      +'<span class="lg">'+(c.win?"":"自クラブ "+cupPlaceName(cup,c)+" ／ ")
        +'賞金 +'+fmtNum(c.coin||0)
        +(c.fame?' ／ 名声 +'+fmtNum(c.fame):"")+'</span></div>'
    : '<div class="cup-res">'
      +'<span class="eyebrow">'+(c.alive?"IN PROGRESS":"ELIMINATED")+'</span>'
      +'<b>'+esc(c.alive?"次は "+cupRoundName(cup,c.round):cupPlaceName(cup,c)+"で敗退")+'</b>'
      +'<span class="lg">'+(c.alive?"勝ち残っている間はリーグ戦を進められません"
          :"第"+cupLastNode()+"節に大会が完了し、賞金が振り込まれます")+'</span></div>';

  $("schedList").innerHTML=head+rows;
  // 枠をタップすると**その回戦で当たったときの相手**が見られる。回戦が上がるほど
  // 相手は強くなる(→docs/03 §3.23)ので、round ごとに引き直す
  $("schedList").querySelectorAll(".br-row.foe").forEach(el=>{
    el.onclick=()=>openFoe({ kind:"cup", cup:c.id, round:Number(el.dataset.round),
      slot:Number(el.dataset.slot), sub:cupRoundName(cup,Number(el.dataset.round)) });
  });
  $("schedStand").innerHTML=cupInfoBox(cup,c);
}
/**
 * 組み合わせ表の1回戦ぶん(→docs/03 §3.23)。
 * **表はエントリー時に出来上がっていて**、勝ち上がりが決まるたびに TBD が埋まる。
 */
function cupRoundBlock(cup,c,round,node){
  const ps=cupPairs(c,round), res=c.res[round-1];
  const n=Math.pow(2,cup.rounds-round);
  const mine=c.alive&&!c.done&&!res&&node===S.career.node;   // これから戦う回戦
  const ms=[];
  for(let k=0;k<n;k++){
    const m=res&&res[k];
    const pair=ps&&ps[k];
    const a=m?m.i:pair?pair[0]:null, b=m?m.j:pair?pair[1]:null;
    const next=mine&&pair&&(pair[0]===c.slot||pair[1]===c.slot);
    ms.push('<div class="br-m'+(next?" next":"")+'">'
      +cupBrRow(c,a,m?m.gi:null,m&&m.w===a,round)
      +cupBrRow(c,b,m?m.gj:null,m&&m.w===b,round)
      +(m&&m.pk?'<div class="br-pk">PK '+esc(m.pk)+'</div>':"")
      +(next?'<div class="br-next">次戦</div>':"")
      +'</div>');
  }
  return '<div class="br-r"><div class="br-k">'+esc(cupRoundName(cup,round))
    +'<span class="num">第'+node+'節</span></div>'+ms.join("")+'</div>';
}
/** 組み合わせ表の1行。決まっていない枠は TBD。埋まった枠は下見へのリンク(→docs/03 §3.34)。 */
function cupBrRow(c,i,g,won,round){
  const tbd=i===null||i===undefined, me=!tbd&&i===c.slot;
  return '<div class="br-row'+(won?" w":"")+(me?" me":"")+(tbd?" tbd":"")
    +((tbd||me)?"":" foe")+'"'
    +((tbd||me)?"":' data-slot="'+i+'" data-round="'+round+'" role="button" tabindex="0"')+'>'
    +'<span class="br-n">'+esc(tbd?"TBD":cupTeamName(c,i))+'</span>'
    +'<span class="br-s num">'+(g===null||g===undefined?"-":g)+'</span></div>';
}
/** 大会の要項(条件・賞金)。順位ごとの賞金は完了節にまとめて入る。 */
function cupInfoBox(cup,c){
  const names=cup.prize.map((_,i)=>i===0?"優勝":i===1?"準優勝":"ベスト"+Math.pow(2,i));
  return '<div class="stand-h"><span class="sect-t">'+esc(cup.name)+' 要項</span></div>'
    +'<div class="stand-box cup-info">'
    +kv("開催",cup.every+"の倍数の節")
    +kv("参加条件",cupNeedFull(cup))
    +kv("方式",cup.rounds+"回戦（ノックアウト）")
    +cup.prize.map((v,i)=>kv(names[i],"+"+fmtNum(v)+" コイン"
      +((cup.fame&&cup.fame[i])?" ／ 名声 +"+fmtNum(cup.fame[i]):"")
      +(c&&c.done&&c.dist===i?"（受領）":""))).join("")
    +'</div>';
}
/** 任期カレンダーを開いたら現在節へ寄せる(96節あるので必須)。 */
SCREENS.season.after=()=>setTimeout(scrollToCurrent,30);
/**
 * タイトルのステッカーの壁(→docs/06 §6.29)。**決定論的に敷き詰める**ので、
 * 開くたびに絵面が変わることはない。枚数は画面の大きさから決める。
 * **絵を足しても JS は触らない** — ASSETS の並びをそのまま使う。
 */
function titleWall(){
  const A=(window.ASSETS&&window.ASSETS.sticker)||{};
  const keys=Object.keys(A).sort();
  if(!keys.length)return "";
  const el=$("scr-title");
  // **要素の実測をあてにしない**。起動直後は高さが確定しておらず、
  // 実測だけで行数を決めると壁が画面の途中で切れて下が真っ黒になった。
  // ビューポートと突き合わせて大きいほうを採り、さらに2行ぶん多めに敷く。
  const W=Math.max(el?el.clientWidth:0, window.innerWidth||390);
  const H=Math.max(el?el.clientHeight:0, window.innerHeight||844);
  const cols=4, cell=W/cols, rows=Math.ceil(H/(cell*0.86))+2;
  // **毎回ちがう壁でよい**(2026-08-10)。貼り替えられる壁のほうが街らしいので、
  // 種は起動ごとに振る。揃えるのは大きさだけ(セルの 0.95〜1.35 倍)。
  const rng=mulberry32((Math.random()*0x7fffffff)>>>0);
  // **同じ絵が隣り合わないように順に配る**。乱数で毎回引くと同じ絵が固まって、
  // 貼り重ねた壁ではなく壁紙に見える
  let bag=[], take=()=>{
    if(!bag.length){ bag=keys.slice();
      for(let i=bag.length-1;i>0;i--){ const j=Math.floor(rng()*(i+1));
        const t=bag[i]; bag[i]=bag[j]; bag[j]=t; } }
    return bag.pop();
  };
  const out=[];
  for(let r=0;r<rows;r++)for(let c=0;c<cols;c++){
    const k=take();
    // **升目から少しずらす**。きれいに並ぶと壁紙になってしまう
    const x=(c+0.5)*cell+(rng()-0.5)*cell*0.50+(r%2?cell*0.26:-cell*0.26);
    const y=(r+0.5)*cell*0.86+(rng()-0.5)*cell*0.34;
    const w=cell*(0.95+rng()*0.40);
    const rot=(rng()-0.5)*50;
    out.push('<img src="'+A[k]+'" alt="" style="left:'+x.toFixed(0)+'px;top:'+y.toFixed(0)+'px'
      +';width:'+w.toFixed(0)+'px;transform:translate(-50%,-50%) rotate('+rot.toFixed(1)+'deg)'
      +';opacity:'+(0.58+rng()*0.34).toFixed(2)+'">');
  }
  return out.join("");
}
/** クラブごとの識別色(モックの丸いクラブカラーに相当)。
 *  ハッシュの剰余だと色相が固まって数色しか出ないので、CLUBS の並び順から
 *  黄金角(137.5°)で回して均等に散らす。
 *
 *  **明るく・鮮やかに**(→docs/06 §6.28)。暗い盤面の上に暗い丸を置くと
 *  クラブの見分けが付かなかったので、パステル寄りのネオンに寄せてある。
 *  **文字を載せる丸は clubInk() を使う**(白では読めなくなる)。 */
const CLUB_L=0.80, CLUB_C=0.17;
const clubHue=clubId=>((CLUBS.findIndex(c=>c.id===clubId)*137.5+20)%360).toFixed(1);
function clubColor(clubId){
  return "oklch("+CLUB_L+" "+CLUB_C+" "+clubHue(clubId)+")";
}
/** その丸の上に載せる字の色。明るい地なので**暗い側**で取る。 */
function clubInk(clubId){
  return "oklch(0.26 0.06 "+clubHue(clubId)+")";
}
/** 消化済みの節のスコア表示。順位表からは復元できないので保存済みの結果を使う。 */
function scoreOf(md){
  const r=(S.world.results||{})[md];
  return r?r.gf+" - "+r.ga:"—";
}
function resClass(md){
  const r=(S.world.results||{})[md];
  return r?(r.win?"w":r.draw?"d":"l"):"";
}
function renderStandings(){
  const rows=standings(S.world.table), W=S.world, t=TUNING.world;
  const lg=leagueById(clubById(S.club.id).league);
  $("standHead").textContent=lg.abbr+" "+lg.name.toUpperCase()+" · "+divName(W.div);
  // **昇格圏と降格圏を色で示す**。順位表は「いまどっちに転びそうか」を見る道具(→§3.24)
  const zone=r=>W.div>1&&r.rank<=t.promote?" up"
    :W.div<DIVS.length&&r.rank>rows.length-t.relegate?" down":"";
  $("standNote").textContent=
    (W.div>1?"上位"+t.promote+"クラブが "+divName(W.div-1)+" へ昇格。":"")
    +(W.div<DIVS.length?"下位"+t.relegate+"クラブが "+divName(W.div+1)+" へ降格。":"")
    +(W.div===1?"最上位の部です。ここを制すれば大陸の舞台が開きます。":"");
  // 行ごと相手の下見へのリンク(→docs/03 §3.34)
  $("standTbl").innerHTML='<tr><th>#</th><th>CLUB</th><th>W</th><th>D</th><th>L</th><th>GF</th><th>GA</th><th>PTS</th></tr>'
    +rows.map(r=>'<tr class="'+(r.id===S.club.id?"me":"foe")+zone(r)+'" data-club="'+r.id+'">'
      +'<td class="num">'+r.rank+'</td>'
      +'<td class="nm">'+esc(clubName(r.id))+'</td><td class="num">'+r.w+'</td><td class="num">'+r.d+'</td>'
      +'<td class="num">'+r.l+'</td><td class="num">'+r.gf+'</td><td class="num">'+r.ga+'</td>'
      +'<td class="num pt">'+r.pts+'</td></tr>').join("");
  wireFoeLinks($("standTbl"));
}

// ---------- CLUB(クラブハウス) ----------
function renderClubhouse(){
  $("clubMgrName").textContent=S.coach||"監督";
  $("clubFame").textContent=fmtNum(S.player.fame);
  $("clubTickets").textContent=ticketTotal();
  const h=S.player.history;
  $("clubHistory").innerHTML=h.length?h.slice().reverse().map(x=>
    '<div class="kv"><span>S'+x.season+' '+esc(clubName(x.clubId))+'</span><b>'
    +(x.rank?x.rank+"位 ":"")+x.result+'</b></div>').join(""):'<div class="lg">まだ記録がありません</div>';
  const F={ training:"練習場", medical:"医療施設", stadium:"スタジアム", scouting:"スカウト網" };
  // 実績トロフィー(→docs/03 §3.36)。**獲っていない分も並べる**。
  // 棚が目標の一覧そのものになり、次に何を狙うかがここで決まる
  const defs=trophyDefs();
  const got=defs.filter(d=>trophyOf(d.id)).length;
  const tile=d=>{
    const t=trophyOf(d.id);
    // 2度目からは回数だけ増える。**初めて獲った季**が実績の中身なので消さない
    const sub=t?("SEASON "+t.season+(t.n>1?" ・ ×"+t.n:"")):d.note;
    return '<div class="trophy'+(t?"":" off")+'"><i>'+(t?"🏆":"🔒")+'</i><div>'
      +'<b>'+esc(d.short)+'</b><span>'+esc(sub)+'</span></div></div>';
  };
  const grp=(k,label)=>'<div class="tr-grp">'+label+'</div><div class="trophies">'
    +defs.filter(d=>d.kind===k).map(tile).join("")+'</div>';
  $("clubTrophies").innerHTML=
    '<div class="tr-sum"><b>'+got+'</b> / '+defs.length+' 実績</div>'
    +grp("cup","カップ戦")+grp("league","リーグ");
  renderFac();
}
/**
 * 施設(→docs/03 §3.5)。**同時に建てられるのは1つだけ**なので、
 * 建設中はほかの行を「待ち」にする。何を先に建てるかがそのまま判断になる。
 */
function renderFac(){
  const b=S.club.build, F=TUNING.fac;
  $("clubFac").innerHTML=FACILITIES.map(f=>{
    const lv=facLv(f.id), on=b&&b.id===f.id;
    const c=facCanBuild(f.id);
    const bar='<div class="fc-bar">'+Array.from({length:F.maxLv},(_,i)=>
      '<i'+(i<lv?' class="on"':(on&&i===b.to-1?' class="wip"':''))+'></i>').join("")+'</div>';
    // **状態は右端に1つだけ**。建設中/上限/金額のどれかで、迷いが出ないようにする
    const right=on?'<span class="fc-wip">あと '+b.left+'節</span>'
      :lv>=F.maxLv?'<span class="fc-max">最大</span>'
      :b?'<span class="fc-off">—</span>'
      :'<button class="fc-go'+(c&&c.ok?"":" off")+'" data-fac="'+f.id+'">'
        +fmtNum(F.cost[lv])+'</button>';
    return '<div class="fc'+(on?" on":"")+'">'
      +'<div class="fc-b"><b>'+f.label+' <span class="fc-lv">Lv.'+lv+'</span></b>'
      +'<span class="lg">'+f.note+'</span>'+bar+'</div>'
      +'<div class="fc-r">'+right+'</div></div>';
  }).join("")
  +'<div class="lg" style="margin-top:8px">'
  +(b?'建設中は<b>ほかの施設を建てられません</b>。':'投資した節には効果が出ません。'
    +'完成まで<b>'+F.nodes[0]+'〜'+F.nodes[F.maxLv-1]+'節</b>かかります。')
  +'<br>観客収入 <b class="num">'+fmtNum(gateIncome())+'</b> ／節'
  +'（スタジアムと成績で伸びます）</div>';
  $("clubFac").querySelectorAll("[data-fac]").forEach(el=>{
    el.onclick=()=>{
      const f=facById(el.dataset.fac), c=facCanBuild(f.id);
      if(!c)return;
      if(!c.ok){ toast("コインが足りません（"+fmtNum(c.cost)+"）"); return; }
      if(!confirm(f.label+" を Lv."+c.to+" にします。"
        +fmtNum(c.cost)+" コイン／完成まで "+c.nodes+"節。よろしいですか?"))return;
      facBuild(f.id); save(); headUI(); renderFac();
      toast(f.label+" の工事を始めました（あと "+c.nodes+"節）");
    };
  });
}

// ---------- 試合(第3段までは結果だけ) ----------
let _lastResult=null;
// ---------- 実況(→docs/06 §6.17) ----------
// **イベントを日本語に直すだけ**。ここで結果を作ることは一切しない。
// 味方=青 / 相手=赤 / ゴール=金 で色分けする(モックの実況欄に準拠)。

/** イベントに出てくる選手を引く。 */
const mPlayer=(M,side,id)=>playerOf(M,side,id);
const mName=p=>p?esc(shortName(p.c)):"選手";

/** シュートの呼び方。終点チャンネルの名前がそのまま実況の語になる(→docs/07 §7.13)。 */
const shotWord=e=>e.flabel||"シュート";
/** ボールのある高さを、実況で使える場所の言葉に直す。 */
const zoneOf=h=>h<0.30?"自陣":h<0.55?"中盤":h<0.78?"敵陣":"ゴール前";
/**
 * 言い回しを**決定的に**選ぶ。イベントの中身から引くので、
 * 同じ試合を何度再生しても同じ実況になる(→docs/07 §7.1)。
 */
const sayOf=(e,arr)=>arr[hashStr(e.by+":"+e.min+":"+(e.step||0))%arr.length];

/**
 * 起点・連鎖の1行(→docs/06 §6.17)。チャンネル名がそのまま実況の語になる。
 * **同じ言い回しを繰り返さない**のが要。持ち上がりは連続すると文が積み上がるので、
 * 何手目かで語を変え、「まだ持っている」ことが読めるようにする。
 */
function lineChannel(M,e){
  const p=mPlayer(M,e.side,e.by), d=mPlayer(M,e.side==="H"?"A":"H",e.vs);
  const nm=mName(p), dn=mName(d), z=zoneOf(e.h), L=e.label;
  if(!e.ok){
    if(!d)return nm+"の"+L+"が通らない";
    // **止めた側が何をしたか**を必ず出す(→docs/07 §7.12)。
    // 守備が「止めた」としか言えないと、守備側の采配が読み物にならない。
    const D=e.dlabel;
    if(!D)return dn+"が"+nm+"の"+L+"を止めた";
    if(e.kind==="carry")return sayOf(e,[dn+"の"+D+"、"+nm+"を止めた",
      dn+"が"+D+"で奪い返す", nm+"、"+dn+"の"+D+"に阻まれた"]);
    if(e.kind==="shot")  return sayOf(e,[dn+"の"+D+"で打たせない", nm+"の"+L+"は"+dn+"が潰した"]);
    return sayOf(e,[dn+"の"+D+"、"+L+"をカット", nm+"の"+L+"は"+dn+"に読まれた",
      nm+"の"+L+"、"+dn+"の"+D+"に引っかかる"]);
  }
  if(!e.step)return sayOf(e,[z+"、"+nm+"（"+e.sub+"）の"+L+"から仕掛ける",
    nm+"（"+e.sub+"）が"+z+"で持つ、"+L, z+"の"+nm+"（"+e.sub+"）、"+L+"で動き出す"]);
  if(e.kind==="carry")
    return e.run>1
      ? sayOf(e,["なおも"+nm+"、"+z+"まで運ぶ", nm+"はまだ離さない、さらに前へ",
          nm+"が持ち上がり続ける"])
      : sayOf(e,[nm+"が"+L+"で持ち出す", nm+"、"+L+"から前を向く"]);
  if(e.kind==="shot")return nm+"、"+z+"から狙う";
  return sayOf(e,[nm+"の"+L+"、"+z+"へ", nm+"が"+L+"で繋ぐ", nm+"の"+L+"が通った"]);
}
/**
 * ファウルの1行。**どこで倒したか**が、そのまま次に何が起きるかを予告する。
 * `side` は**得た側**なので、反則した選手は相手チームから引く。
 */
function lineFoul(M,e){
  const opp=e.side==="H"?"A":"H";
  const dn=mName(mPlayer(M,opp,e.by)), vn=e.on?mName(mPlayer(M,e.side,e.on)):"選手";
  if(e.kind==="pk")  return "<b>"+dn+"がエリア内で"+vn+"を倒した！ PK</b>";
  if(e.kind==="fk")  return dn+"が"+vn+"を倒す。"+zoneOf(e.h)+"でフリーキック";
  return dn+"のファウル。ここで試合が切れる";
}
/** セットプレーを蹴る1行。 */
function lineSet(M,e,kicker){
  const nm=mName(kicker);
  if(e.kind==="pk")return "<b>"+nm+"</b>がスポットにボールを置く";
  if(e.kind==="ck")return nm+"のコーナーキック";
  if(e.mode==="direct")return nm+"が直接狙う";
  // 遠いFKは蹴り込む位置ではない。**繋いで作り直す**(→docs/07 §7.15)
  if(e.mode==="restart")return nm+"のリスタート、ここから作り直す";
  return nm+"が壁の向こうへ蹴り込む";
}
/**
 * 1イベント → 実況の1行。返り値 { text, cls } / 出さないなら null。
 * possession のような内部の刻みは出さない(読み物として意味が無い)。
 */
function matchLine(e,M){
  const ally=e.side&&((e.side==="H")===(M.fixture.h===S.club.id));
  const side=e.side?(ally?"ally":"opp"):"";
  const p=e.by?mPlayer(M,e.side,e.by):null;
  const gk=e.gk?mPlayer(M,e.side==="H"?"A":"H",e.gk):null;
  const vs=e.vs?mPlayer(M,e.side==="H"?"A":"H",e.vs):null;
  switch(e.type){
    case "kickoff":  return { text:"<b>キックオフ</b>", cls:"info" };
    case "halftime": return { text:"<b>ハーフタイム</b> "+scOrder(M,e.hg,e.ag), cls:"info" };
    case "fulltime": return null;                    // 終了は mFinish が出す
    case "origin":
    case "link":     return { text:lineChannel(M,e), cls:side };
    case "foul":     return { text:lineFoul(M,e), cls:side };
    case "card":     return { text:(e.card==="r"?"🟥 ":"🟨 ")+mName(p)
                        +(e.off?"、<b>退場！</b>数的優位が生まれた":"に"+(e.card==="r"?"レッドカード":"警告")),
                        cls:e.off?"goal":"info" };
    case "setpiece": return { text:lineSet(M,e,p), cls:side };
    case "aerial":   return { text:e.ok?"<b>"+mName(p)+"</b>が競り勝った！"
                        :mName(vs)+"が競り勝ってクリア", cls:side };
    // **どう撃ったか**を出す(→docs/07 §7.13)。「シュート」だけだと
    // ヘディングもミドルもGKとの一対一も同じ文になり、局面が読めない
    case "block":    return { text:mName(p)+"の"+shotWord(e)+"！"+mName(vs)+"がブロック", cls:side };
    case "miss":     return { text:mName(p)+"の"+shotWord(e)+"は枠を外れた", cls:side };
    case "save":     return { text:"<b>"+mName(p)+"</b>の"+shotWord(e)+"！"+mName(gk)+"がセーブ", cls:side };
    case "rebound":  return { text:e.ok?mName(p)+"がこぼれ球に詰める！":"こぼれ球は"+mName(vs)+"がクリア", cls:side };
    case "goal":     return { text:"⚽ <b>"+mName(p)+" "+shotWord(e)+"でゴール！</b>"
                        +(e.assist?"（"+mName(mPlayer(M,e.side,e.assist))+"）":"")
                        +"　"+scOrder(M,e.hg,e.ag), cls:"goal" };
    case "sub":      return { text:"🔄 交代 "+mName(mPlayer(M,e.side,e.in))+" ← "
                        +mName(mPlayer(M,e.side,e.out)), cls:"info" };
    default:         return null;                    // possession / build は出さない
  }
}

// ---------- MATCH(→docs/06 §6.17) ----------
// **描画はエンジンが解き終えたイベントを再生するだけ**(→docs/07 §7.1)。
// 位置もイベントが持っているので、選手が唐突に飛ぶことはない。
let _M=null;          // 進行中の試合
let _mTimer=null, _mSpeed=1, _mPaused=false;
let _mPhase=0, _mLastSide="H", _mBall=[50,50], _mRestart=true;
let _mCutT=null, _mCutJ=null, _mBallT=null, _mNext=null;  // 揺れの位相 / 直前に攻めていた側 / ボール位置(演出用)

/**
 * **陣形の縦を詰めて画面に並べる**(→docs/06 §6.17)。
 *
 * 陣形の座標(13=最前線 .. 87=自陣ゴール前)は**ピッチいっぱいに広げた1チーム分**の
 * 立ち位置。編成画面は1チームしか出さないのでそのままでよいが、
 * 試合では2チームを同じピッチに並べるため、そのままだと両陣形が重なり、
 * **自軍FW(13)が相手の最終ライン(100-73=27)より深い位置**に立ってしまう。
 * = 全16陣形で常時オフサイドの絵になる(実際にそうなった)。
 *
 * 13..87 を lineTop..lineBottom に写して、両ブロックが噛み合うようにする。
 * **ボールも同じ写像を通す**ので、選手とボールがずれない。
 */
function dispY(y,restart){
  const P=TUNING.play;
  const top=restart?P.kickTop:P.lineTop;               // 再開時は自陣に収める
  return top+(y-13)*(P.lineBottom-top)/74;
}
/**
 * **自分のクラブは常に画面の下**(→docs/06 §6.17)。上のゴールを目指す。
 *
 * ホームを下に固定すると、アウェイの試合だけ自分が上から下へ攻めることになり、
 * 「どちらが自分か」を毎回読み替えることになる。WCCF と同じく、
 * 見る側の陣地を固定して、相手だけを反転させる。
 */
const mMine=()=>_M&&_M.fixture&&_M.fixture.a===S.club.id?"A":"H";
/** その側を上下左右ひっくり返して描くか。**自分側は返さない**。 */
const mFlip=side=>side!==mMine();

/**
 * スコアの並びも**左が自分**。ピッチと逆にすると読み替えになる。
 * 実況の中のスコアも同じ順で出す(スコアボードと食い違うと混乱する)。
 */
const scOrder=(M,hg,ag)=>M&&M.fixture&&M.fixture.a===S.club.id?ag+" - "+hg:hg+" - "+ag;
const mScore=(hg,ag)=>scOrder(_M,hg,ag);

/** イベントの座標を画面の向きへ直す。相手の攻撃は上下左右が反転する。 */
function toScreen(e,pos){
  const [x,y]=pos||e.pos||[50,50];
  const dy=dispY(y);
  return mFlip(e.side)?[100-x,100-dy]:[x,dy];
}
/** 選手の枠を画面の向きへ直す(相手は反転)。縦は詰めて並べる。 */
const slotXY=(p,side,restart)=>mFlip(side)
  ?[100-p.x,100-dispY(p.y,restart)]:[p.x,dispY(p.y,restart)];

/** ピッチに22人を並べる。以後の位置は mLayout が毎イベント計算する。 */
function mDrawSquads(){
  const html=[];
  for(const T of [_M.home,_M.away]){
    const side0=T.side==="H"?_M.fixture.h:_M.fixture.a;
    const col=clubColor(side0);
    T.players.forEach((p,i)=>{
      const [x,y]=slotXY(p,T.side,true);   // 開始はキックオフ隊形
      // **点ではなく全身を出す**(→docs/06 §6.17)。絵にはクラブカラーが無いので、
      // 足元の影をチームカラーにして、どちらのチームかを影で見分ける。
      const art=artKeyOf(p.c);
      // **立ち絵ではなくプレイ絵**。棒立ちが22人並ぶと試合が止まって見える
      const src=art&&artOf(art+"_play");
      html.push('<div class="mp" data-side="'+T.side+'" data-ix="'+i+'"'
        +' data-rx="'+p.x+'" data-ry="'+p.y+'"'          // 陣形そのままの座標(写像前)
        +' data-x="'+x+'" data-y="'+y+'" data-ph="'+((i*2.4+(T.side==="A"?1.1:0))%6.28).toFixed(2)+'"'
        +' style="left:'+x+'%;top:'+y+'%;--kit:'+col+'">'
        +'<i class="mp-sh"></i>'
        +(src?'<img src="'+src+'" alt="">':'<i class="mp-dot"></i>')
      +'</div>');
    });
  }
  $("mSlots").innerHTML=html.join("");
}

// ---------- 選手の動き(**演出専用** → docs/06 §6.18) ----------
// ここは**見た目だけ**を作る層。エンジンの判定にも events にも一切影響しない。
// 「点が固定的に見える」のを解くために、実際のサッカーの動きを真似る:
//   ・ブロックがボールへ寄る(縦も横も)。ラインごとに寄り方が違う
//   ・守っている側は縦に圧縮し、攻めている側は広がる
//   ・関与している選手はボールまで実際に動く
//   ・GKはゴールラインでボールの左右に追従する
//   ・全員がゆっくり揺れる(完全静止させない)

const L=()=>TUNING.play;
/** ラインごとの寄り方。DFはラインを保ち、MFが一番ボールを追い、FWは前で待つ。 */
const followW=r=>r==="GK"?L().gkFollow:r==="DF"?L().dfFollow:r==="MF"?L().mfFollow:L().fwFollow;
/**
 * **運動量**(→docs/06 §6.18)。動きの幅と寄りの強さに一様に掛かる。
 * 若い選手はよく走り、消耗した選手は足が止まる。**見た目だけ**の係数で、
 * 判定には一切効かない(判定側の疲労は eff() → docs/07 §7.10)。
 */
function vigorOf(p){
  const P=L();
  const t=clamp((p.c.age-P.ageYoung)/(P.ageOld-P.ageYoung),0,1);
  const age=P.ageHi+(P.ageLo-P.ageHi)*t;                 // 18歳=1.16 … 34歳=0.84
  const st=p.stam==null?1:p.stam;
  return age*(1-P.vigorStam+P.vigorStam*st);
}
const dist2=(ax,ay,bx,by)=>{ const dx=ax-bx, dy=ay-by; return dx*dx+dy*dy; };

/**
 * 22人の表示位置を決める。**毎イベント呼ぶ**。
 *   e … いま見せているイベント(側と位置を持つ)
 */
function mLayout(e){
  const P=L();
  // **再開の局面(キックオフ / ハーフタイム / 得点直後)は、両チームとも自陣にいる**。
  // 通常の並びのままだと、開始時点で相手陣内に選手が立っていて違和感が出る。
  if(e.type==="kickoff"||e.type==="halftime"||e.type==="goal"){ _mRestart=true; _mBall=[50,50]; }
  else if(e.pos)_mRestart=false;
  // 位置を持たないイベント(possession など)では**直前のボール位置を保つ**。
  // 中央に戻すと、攻撃の合間に全員が中央へ吸い寄せられて不自然になる。
  if(e.pos&&!_mRestart)_mBall=toScreen(e);
  const [bx,by]=_mBall;
  _mPhase+=P.wanderStep;
  const atkSide=e.side||_mLastSide; if(e.side)_mLastSide=e.side;

  // **2周する**。1周目で両チームの位置を決め、2周目で相手の位置を見て動く
  // (マークを外す = 相手から離れる、なので相手の座標が要る)。
  const teams=[_M.home,_M.away].map(T=>{
    const ps=T.players.map((p,i)=>({ p, i, xy:slotXY(p,T.side,_mRestart) }));
    return { T, ps,
      mine:T.side===atkSide,
      goalY:mFlip(T.side)?100-dispY(87,_mRestart):dispY(87,_mRestart),
      cy:ps.reduce((s,o)=>s+o.xy[1],0)/ps.length,
      cx:ps.reduce((s,o)=>s+o.xy[0],0)/ps.length };
  });

  for(const t of teams){
    const { T, ps, mine, goalY, cx, cy }=t;
    for(const o of ps){
      const el=$("mSlots").querySelector('.mp[data-side="'+T.side+'"][data-ix="'+o.i+'"]');
      if(!el)continue;
      el.dataset.x=o.xy[0].toFixed(1); el.dataset.y=o.xy[1].toFixed(1);
      let [x,y]=o.xy;
      const r=o.p.role, w=followW(r), vg=vigorOf(o.p);

      // ① ブロックがボールへ寄る(縦・横)。ラインごとに寄り方が違う
      y+=(by-cy)*P.followY*w*vg;
      x+=(bx-cx)*P.followX*w*vg;
      // ①' **ボールに近い選手ほど自分から詰める**。ブロックごと動かすだけだと
      //     全員が同じ量だけ平行移動して、誰もボールに行っていないように見える
      if(r!=="GK"){
        const d=Math.sqrt(dist2(o.xy[0],o.xy[1],bx,by))/P.chaseR;
        const near=Math.exp(-d*d);
        x+=(bx-x)*P.chaseK*near*vg;
        y+=(by-y)*P.chaseK*near*vg;
      }
      // ② 攻めている側は前へ出て広がる / 守っている側は下がって圧縮する
      const push=(mine?P.pushUp:-P.dropBack)*(goalY===87?-1:1);
      y+=push*(r==="GK"?0.2:r==="DF"?0.8:1)*vg;
      const comp=mine?P.stretch:P.compact;
      y+=(cy-y)*comp;
      // ③ **枠から離れすぎない**。上限を付けないと全員がボールに吸い寄せられ、
      //    陣形が消えて団子になる(実際にそうなった)。よく走る選手ほど枠は広い
      const mx=P.maxDevX*vg, my=P.maxDevY*vg;
      x=o.xy[0]+clamp(x-o.xy[0],-mx,mx);
      y=o.xy[1]+clamp(y-o.xy[1],-my,my);
      // ④ ゆっくり揺れる(完全に止めない)。疲れた選手の揺れは小さい
      const ph=+el.dataset.ph;
      x+=Math.sin(_mPhase+ph)*P.wander*vg;
      y+=Math.cos(_mPhase*0.8+ph*1.7)*P.wander*0.7*vg;
      // ⑤ GKはゴールラインに残り、ボールの左右にだけ追従する
      if(r==="GK"){ y=goalY+(by-goalY)*P.gkOut; x=50+(bx-50)*P.gkSide; }

      o.pos=[x,y]; o.vg=vg; o.el=el;
    }
  }
  // ⑥ **空いたスペースを狙う**。攻めている側の前の選手は、一番近い相手から離れる。
  //    マークを外す動きに見えるうえ、密集がほどけて盤面が読みやすくなる。
  if(!_mRestart)for(const t of teams){
    if(!t.mine)continue;
    const opp=teams.find(o=>o!==t);
    for(const o of t.ps){
      if(!o.pos||o.p.role==="GK"||o.p.role==="DF")continue;
      let near=null, nd=1e9;
      for(const q of opp.ps){
        if(!q.pos)continue;
        const d=dist2(o.pos[0],o.pos[1],q.pos[0],q.pos[1]);
        if(d<nd){ nd=d; near=q; }
      }
      if(!near)continue;
      const d=Math.sqrt(nd);
      if(d>=P.spaceR||d<0.001)continue;
      const k=(1-d/P.spaceR)*P.spaceK*o.vg;
      o.pos[0]+=(o.pos[0]-near.pos[0])/d*k;
      o.pos[1]+=(o.pos[1]-near.pos[1])/d*k;
    }
  }
  for(const t of teams)for(const o of t.ps){
    if(!o.pos)continue;
    o.el.style.left=clamp(o.pos[0],4,96)+"%";
    o.el.style.top=clamp(o.pos[1],8,92)+"%";
  }
  // ⑥ 関与している選手は**ボールまで実際に動く**(ここが「戦略的に見える」核)
  const at=(side,id,ox,oy)=>{
    const T=side==="H"?_M.home:_M.away;
    const ix=T.players.findIndex(p=>p.c.id===id); if(ix<0)return;
    const el=$("mSlots").querySelector('.mp[data-side="'+side+'"][data-ix="'+ix+'"]');
    if(!el)return;
    el.style.left=clamp(bx+ox,4,96)+"%"; el.style.top=clamp(by+oy,8,92)+"%";
  };
  if(_mRestart)return;                                 // 再開の隊形は崩さない
  if(e.by&&e.pos)at(e.side,e.by,0,0);                  // 持ち手はボールの上
  if(e.vs&&e.pos){                                     // 対応する相手は自陣側から寄せる
    const dSide=e.side==="H"?"A":"H";
    at(dSide,e.vs,ri(-3,3),mFlip(dSide)?-4.5:4.5);
  }
}
/** 関与している2人だけ強調する。**位置は動かさない**。 */
function mFocus(e){
  $("mSlots").querySelectorAll(".mp").forEach(el=>el.classList.remove("on","vs"));
  const mark=(side,id,cls)=>{
    const T=side==="H"?_M.home:_M.away;
    const ix=T.players.findIndex(p=>p.c.id===id);
    if(ix<0)return;
    const el=$("mSlots").querySelector('.mp[data-side="'+side+'"][data-ix="'+ix+'"]');
    if(el)el.classList.add(cls);
  };
  if(e.by)mark(e.side,e.by,"on");
  if(e.vs)mark(e.side==="H"?"A":"H",e.vs,"vs");
  if(e.gk)mark(e.side==="H"?"A":"H",e.gk,"vs");
}
/** ボールを動かす。選手の位置は mLayout が持つ。 */
function mMoveBall(e){
  if(!e.pos)return;
  const [x,y]=toScreen(e);
  const b=$("mBall"); b.style.left=x+"%"; b.style.top=y+"%";
}
/**
 * シュートの行方(→docs/06 §6.17)。**打点に置いたあと、実際にゴールラインまで飛ばす**。
 *
 * 行き先はピッチの実寸に合わせる(TUNING.play.goal*)。CSS の `.pt-goal` は
 * ゴールラインから 1.2〜2.2%、ポストの内側は x 43〜57 にあるので、
 * そこへ入れないと**ボールがピッチの中で止まって見える**。
 */
function mBallShot(e,delay){
  const P=TUNING.play, top=!mFlip(e.side);               // 下に描かれた側が上のゴールを攻める
  const at=v=>top?v:100-v;                               // 上下を入れ替える
  let tx=50, ty=at(P.goalLine);
  switch(e.type){
    case "goal": tx=50+ri(-P.goalMouth,P.goalMouth); ty=at(P.goalNet); break;
    case "save": tx=50+ri(-P.goalMouth,P.goalMouth); ty=at(P.goalKeep); break;
    case "miss": tx=50+(ri(0,1)?-1:1)*ri(P.goalMouth+3,P.goalMouth+9);
                 ty=at(P.goalNet); break;
    case "block":{ const [bx,by]=toScreen(e);            // 弾かれて手前へ戻る
                 tx=bx+ri(-6,6); ty=by+(top?5:-5); break; }
  }
  clearTimeout(_mBallT);
  _mBallT=setTimeout(()=>{
    const b=$("mBall");
    b.style.left=clamp(tx,1,99)+"%"; b.style.top=clamp(ty,1,99)+"%";
  },delay);
}

// ---------- カットイン(→docs/06 §6.19) ----------
// **中央を横切る帯**にプレーを大きく見せる。card-eleven の見せ方を踏襲。
// 演出専用で、結果にも events にも一切影響しない。

/** カットインに出す選手の顔。イラストがあれば使い、無ければクラブカラーの丸にOVR。 */
function cutAvatar(p,side){
  const art=artKeyOf(p.c);
  const src=art&&artOf(art+"_play");
  const cid=side==="H"?_M.fixture.h:_M.fixture.a;
  const col=clubColor(cid), ink=clubInk(cid);
  return '<div class="cut-av" style="--kit:'+col+';--kit-ink:'+ink+'">'
    +(src?'<img src="'+src+'" alt="">':p.c.ovr)+'</div>';
}
/** 選手1人ぶんの枠。cls に L/R と win/dim を渡す。 */
function cutFig(p,side,cls,note){
  if(!p)return '<div class="cut-fig '+cls+'"></div>';
  return '<div class="cut-fig '+cls+'">'+cutAvatar(p,side)
    +'<b>'+esc(shortName(p.c))+'</b><span>'+(note||p.sub||"")+'</span></div>';
}
/** 帯を出して、指定ミリ秒で閉じる。返り値=描画を止めておく時間。 */
function cutShow(html,ms,extra){
  window.__cutN=(window.__cutN||0)+1;                   // 検証用の素朴なカウンタ
  const c=$("mCut");
  c.className="mcut on"+(extra||"");
  c.innerHTML=html;
  clearTimeout(_mCutT);
  _mCutT=setTimeout(()=>{ c.classList.remove("on"); },ms);
  return ms;
}
/** マッチアップ。左=自チーム / 右=相手。決着で勝者が光り、敗者が沈む。 */
function cutVs(e,atk,df,word,atkWon){
  const ally=(e.side==="H")===(_M.fixture.h===S.club.id);
  const mine=ally?atk:df, opp=ally?df:atk;
  const mineSide=ally?e.side:(e.side==="H"?"A":"H");
  const oppSide=mineSide==="H"?"A":"H";
  const mineWon=ally?atkWon:!atkWon;
  // **勝敗は最初から見せない。** 両者が出そろってから決着させる
  // (同時に出すと速すぎて何が起きたか読めない → docs/06 §6.19)。
  const ms=cutShow('<div class="cut">'
    +'<div class="cut-hd">'+esc(e.label||"MATCH UP")+'</div>'
    +cutSkills(mineSide===e.side?e.sk:e.dsk)
    +'<div class="cut-row">'
      +cutFig(mine,mineSide,"L",statNote(mine,e))
      +'<div class="cut-vs">VS</div>'
      +cutFig(opp,oppSide,"R",statNote(opp,e))
    +'</div>'
    +'<div class="cut-word '+(mineWon?"win":"stop")+'">'+word+'</div>'
  +'</div>',TUNING.play.cutMs);
  clearTimeout(_mCutJ);
  _mCutJ=setTimeout(()=>{
    const f=$("mCut").querySelectorAll(".cut-fig");   // [左, 右](間のVSは .cut-fig ではない)
    if(f.length<2)return;
    f[0].classList.add(mineWon?"win":"dim");
    f[1].classList.add(mineWon?"dim":"win");
  },TUNING.play.cutJudge);
  return ms;
}
/** 競り合いで効いた能力を添える(何で勝ったのかが分かるように)。 */
function statNote(p,e){
  if(!p)return "";
  // 守備側は**自分が選んだ守備チャンネル**の能力を出す。攻撃側の能力を並べると
  // 「何で competing しているのか」が読めない(→docs/07 §7.12)。
  const isDf=e.vs&&p.c.id===e.vs;
  const ch=isDf?(COUNTERS[p.sub]||[]).find(c=>c.id===e.dch)
               :(ORIGINS[p.sub]||[]).find(c=>c.id===e.ch);
  const k=ch?ch.stat:(isDf?"def":"atk");
  const head=isDf&&e.dlabel?e.dlabel:p.sub;
  return head+" "+STAT_LABEL[k]+" "+p.c[k];
}
/**
 * 発動した札の帯(→docs/06 §6.26)。**何が効いたのかを言葉で見せる**。
 * 固有スキル(→docs/03 §3.41)は金で光らせ、普通の札と見分けが付くようにする。
 */
function cutSkills(list){
  const a=(list||[]).filter(n=>SKILL_FX[n]);
  if(!a.length)return "";
  return '<div class="cut-sk">'+a.slice(0,2).map(n=>
    '<i class="'+(SKILL_FX[n].sig?"sig":"")+'">'+esc(n)+'</i>').join("")+'</div>';
}
/** パス成功。左に出し手、右から受け手がスライドインする。 */
function cutPass(e,from,to){
  return cutShow('<div class="cut">'
    +'<div class="cut-hd">'+esc(e.label||"PASS")+'</div>'
    +cutSkills(e.sk)
    +'<div class="cut-row">'
      +cutFig(from,e.side,"L")
      +'<div class="cut-arrow">▶</div>'
      +cutFig(to,e.side,"R win")
    +'</div>'
    +'<div class="cut-word win">つながった!</div>'
  +'</div>',TUNING.play.cutMs);
}
/**
 * シュート。**まず「シュート!」で撃ち手と守り手を見せ、そのあとで結果を出す**
 * (→docs/06 §6.19)。いきなり結果を出すと、何に対する結果なのか読めない。
 *   e … goal / save / block / miss
 */
function cutShot(e,sc,keeper,word,scored,assist){
  const P=TUNING.play;
  const kSide=e.side==="H"?"A":"H";
  const ms=(e.type==="goal"?P.goalMs:P.cutMs)+P.shotHold;
  cutShow('<div class="cut">'
    +'<div class="cut-hd">'+esc(e.flabel||"SHOT")+'</div>'
    +cutSkills(e.sk)
    +'<div class="cut-row">'
      +cutFig(sc,e.side,"L","ATK "+sc.c.atk+" / POW "+sc.c.pow)
      +'<div class="cut-vs">VS</div>'
      +(keeper?cutFig(keeper,kSide,"R",(keeper.role==="GK"?"GK":keeper.sub)+" DEF "+keeper.c.def)
        :'<div class="cut-fig R"></div>')
    +'</div>'
    +'<div class="cut-word">シュート!</div>'
  +'</div>',ms);
  // 結果はあとから。撃ち手と守り手のどちらが勝ったかを、そのとき初めて見せる
  clearTimeout(_mCutJ);
  _mCutJ=setTimeout(()=>{
    const c=$("mCut"), band=c.querySelector(".cut");
    if(!band)return;
    const f=c.querySelectorAll(".cut-fig");
    if(f.length>=2){
      f[0].classList.add(scored?"win":"dim");
      f[1].classList.add(scored?"dim":"win");
    }
    const w=c.querySelector(".cut-word");
    if(w){
      w.className="cut-word "+(scored?"goal":"stop");
      w.textContent=word;
      // 出し直す。**遅延は入れない**(結果はもう待たせたので、すぐ出す)
      w.style.animation="none"; void w.offsetWidth;
      w.style.animation="cutWord .42s cubic-bezier(.2,1.4,.4,1)";
    }
    if(scored){
      band.classList.add("goal");
      c.classList.add("shake");
      const hd=band.querySelector(".cut-hd");
      // スコアの並びは盤面と揃える(左=自分 → docs/06 §6.17)
      if(hd)hd.textContent=mScore(e.hg,e.ag)
        +(assist?"　アシスト "+shortName(assist.c):"");
    }
  },P.shotHold);
  return ms;
}
/**
 * PK戦の1本(→docs/03 §3.33)。**流れの中のシュートと同じ形**で見せる。
 * 蹴った瞬間と結果のあいだに間を置き、そのあとで下の一覧に1行積む。
 */
function cutPso(e,kicker,keeper){
  const P=TUNING.play, sp=Math.max(1,_mSpeed);
  const kSide=e.side==="H"?"A":"H";
  const hold=P.psoHold/sp, ms=(P.psoMs+P.psoHold)/sp;
  cutShow('<div class="cut pso-cut">'
    +'<div class="cut-hd">PK '+e.n+'本目</div>'
    +'<div class="cut-row">'
      +cutFig(kicker,e.side,"L",kicker?"ATK "+kicker.c.atk+" / TEC "+kicker.c.tec:"")
      +'<div class="cut-vs">VS</div>'
      +cutFig(keeper,kSide,"R",keeper?"GK DEF "+keeper.c.def:"")
    +'</div>'
    +'<div class="cut-word">キック!</div>'
  +'</div>',ms);
  // 結果はあとから。**蹴り手とGKのどちらが勝ったか**をそのとき初めて見せる
  clearTimeout(_mCutJ);
  _mCutJ=setTimeout(()=>{
    const c=$("mCut"), band=c.querySelector(".cut");
    if(!band)return;
    const f=c.querySelectorAll(".cut-fig");
    if(f.length>=2){
      f[0].classList.add(e.ok?"win":"dim");
      f[1].classList.add(e.ok?"dim":"win");
    }
    const w=c.querySelector(".cut-word");
    if(w){
      w.className="cut-word "+(e.ok?"goal":"stop");
      w.textContent=e.ok?"決めた!":"止めた!";
      w.style.animation="none"; void w.offsetWidth;
      w.style.animation="cutWord .42s cubic-bezier(.2,1.4,.4,1)";
    }
    if(e.ok){ band.classList.add("goal"); c.classList.add("shake"); }
    const hd=band.querySelector(".cut-hd");
    if(hd)hd.textContent="PK "+(mMine()==="H"?e.hg+" - "+e.ag:e.ag+" - "+e.hg);
  },hold);
  return ms;
}
/** キックオフ。両クラブを向かい合わせる。 */
/** セットプレー宣言。誰が蹴るのかを大きく出す(→docs/06 §6.19)。 */
function cutSet(e,kicker){
  const P=TUNING.play;
  const head={ pk:"PENALTY KICK", fk:"FREE KICK", ck:"CORNER KICK" }[e.kind]||"SET PIECE";
  const note={ pk:"ATK "+(kicker?kicker.c.atk:"-")+" / TEC "+(kicker?kicker.c.tec:"-"),
    fk:"TEC "+(kicker?kicker.c.tec:"-"), ck:"POW "+(kicker?kicker.c.pow:"-") }[e.kind];
  return cutShow('<div class="cut sp">'
    +'<div class="cut-hd">'+head+'</div>'
    +'<div class="cut-row">'+cutFig(kicker,e.side,"L win",note)+'</div>'
    +'<div class="cut-word win">'+(e.kind==="pk"?"キッカーは…":"キッカー")+'</div>'
  +'</div>',P.cutMs);
}
/** 退場。赤い帯で、盤面から1人減ることをはっきり伝える。 */
function cutCard(e,p){
  return cutShow('<div class="cut red">'
    +'<div class="cut-hd">'+(e.card==="r"?"RED CARD":"SECOND YELLOW")+'</div>'
    +'<div class="cut-row">'+cutFig(p,e.side,"L dim")+'</div>'
    +'<div class="cut-word stop">退場!</div>'
  +'</div>',TUNING.play.cutMs);
}
/**
 * キックオフ。**両チームのキャプテンを向かい合わせる**(→docs/03 §3.20)。
 * クラブ名だけだと毎試合まったく同じ絵になり、誰の試合なのかが立ち上がらない。
 */
function cutKick(){
  const f=(T,side,cls)=>{
    const cap=T.captain;
    const kit=clubColor(side==="H"?_M.fixture.h:_M.fixture.a);
    return '<div class="cut-fig '+cls+'">'
      +(cap?cutAvatar(cap,side):'<div class="cut-av" style="--kit:'+kit+'"></div>')
      +'<b>'+esc(T.name)+'</b>'
      +'<span>'+(cap?"C "+esc(shortName(cap.c))+" · "+cap.sub:"")+'</span>'
    +'</div>';
  };
  return cutShow('<div class="cut">'
    +'<div class="cut-hd">KICK OFF</div>'
    +'<div class="cut-row">'+f(_M.home,"H","L")
      +'<div class="cut-vs">VS</div>'+f(_M.away,"A","R")+'</div>'
  +'</div>',TUNING.play.kickMs);
}

/**
 * このイベントでカットインを出すか決め、出したら**止めておく時間**を返す。
 * 盛り上がる局面(ゴール/シュート/決着)は必ず、ふつうの繋ぎは抽選で出す。
 * ここは演出なので Math.random でよい(結果に関わらない)。
 */
function mCut(e){
  const P=TUNING.play;
  if(_mSpeed>=P.cutMaxSpeed)return 0;                  // 倍速中は出さない
  const T=e.side==="H"?_M.home:_M.away, D=e.side==="H"?_M.away:_M.home;
  const by=e.by&&mPlayer(_M,e.side,e.by);
  const vs=e.vs&&mPlayer(_M,e.side==="H"?"A":"H",e.vs);
  const gk=e.gk&&mPlayer(_M,e.side==="H"?"A":"H",e.gk);
  switch(e.type){
    case "kickoff": return cutKick();
    // セットプレーは**必ず見せる**。試合の山場であり、誰が蹴るかが読み物になる
    case "setpiece": return cutSet(e,by);
    case "card":     return e.off?cutCard(e,by):0;
    case "aerial":   return vs?cutVs(e,by,vs,e.ok?"競り勝った!":"クリア!",e.ok):0;
    case "goal":    return cutShot(e,by,gk,"GOAL!!",true,e.assist&&mPlayer(_M,e.side,e.assist));
    case "save":    return cutShot(e,by,gk,"SAVE!",false);
    case "block":   return cutShot(e,by,vs,"BLOCK!",false);
    case "miss":    return Math.random()<P.cutMiss?cutShot(e,by,null,"枠を外れた…",false):0;
    case "origin":
    case "link":
      if(!vs)return 0;
      if(!e.ok)return Math.random()<P.cutStop?cutVs(e,by,vs,"STOP!",false):0;
      // 通ったときは、パス系なら受け手を出す(次のイベントの持ち手)
      if(Math.random()>=P.cutPass)return 0;
      if(e.kind==="pass"){
        const nx=_mNext&&_mNext.by&&mPlayer(_M,e.side,_mNext.by);
        if(nx&&nx!==by)return cutPass(e,by,nx);
      }
      return cutVs(e,by,vs,"突破!",true);
    default: return 0;
  }
}/** 1イベントを画面に反映する。 */
/** 1イベントを画面に反映し、**カットインで止める時間**(ms)を返す。 */
function mApply(e){
  const min=(e.at?e.min+"+":e.min)+"分";
  $("mClock").textContent=min;
  $("mClock").classList.toggle("late",e.min>=80);
  if(e.hg!=null)$("mSc").textContent=mScore(e.hg,e.ag);
  if(e.type==="card"&&e.off)mDrawSquads();     // 退場した選手は盤面から消える
  mFocus(e); mMoveBall(e); mLayout(e);
  const hold=mCut(e);
  // シュートは打点に置いてから**実際に飛ばす**。カットインの決着と間を合わせる
  if(["goal","save","miss","block"].includes(e.type))
    mBallShot(e,hold?TUNING.play.shotHold:200);
  const line=matchLine(e,_M);
  if(line)mFeed(min,line.text,line.cls);
  return hold||0;
}
function mFeed(min,text,cls){
  const d=document.createElement("div");
  d.className=cls||"";
  d.innerHTML='<span style="color:var(--text-dim)">'+min+'</span> '+text;
  $("mFeed").prepend(d);
  while($("mFeed").children.length>40)$("mFeed").lastChild.remove();
}

/** 再生ループ。1ティックぶんのイベントを順に見せて、次のティックを解く。 */
function mTick(){
  if(!_M||_mPaused)return;
  if(matchOver(_M)){ mFinish(); return; }
  const evs=stepMatch(_M);
  let i=0;
  const gap=Math.max(180,Math.round(TUNING.ui.tickMs/_mSpeed/Math.max(1,evs.length)));
  const next=()=>{
    if(!_M||_mPaused)return;
    if(i>=evs.length){ _mTimer=setTimeout(mTick,gap); return; }
    _mNext=evs[i+1]||null;                              // パスの受け手を先読みする(演出用)
    const hold=mApply(evs[i++]);
    _mTimer=setTimeout(next,gap+hold);
  };
  next();
}
function mReset(){ const b=$("psoBox"); if(b){ b.hidden=true; $("psoRows").innerHTML="";
  $("psoSum").innerHTML=""; } clearTimeout(_psoTimer); _psoTimer=null; }
function mFinish(){
  clearTimeout(_mTimer); _mTimer=null;
  // **必ずここで試合を締める**。再生ループは matchOver で抜けるので stepMatch を
  // 通らずに終わることがあり、締めないと _M.over が立たず結果画面に中身が渡らない。
  finishTick(_M);
  $("mSc").textContent=mScore(_M.home.score,_M.away.score);
  $("mClock").textContent="FULL TIME";
  mFeed("90分","<b>試合終了</b>","goal");
  $("mDone").style.display="";
  $("mPlay").disabled=$("mSpeed").disabled=$("mSkip").disabled=true;
  closeSub(); $("subTab").classList.add("off");   // 終わったら交代はできない
  closeOrd(); $("ordTab").classList.add("off");   // 指示も同じ
  // **並んだままならPK戦**(→docs/03 §3.33)。決着まで1本ずつ見せる
  if(_M.pso)psoShow();
}

// ---------- PK戦(→docs/03 §3.33) ----------
// 引き分けたノックアウトは**その場で決着を見せる**。裏で決めてしまうと、
// 「なぜ勝ったのか / 負けたのか」が結果画面の数字だけになる。
let _psoTimer=null;
function psoShow(){
  const kicks=_M.events.filter(e=>e.type==="pso");
  const mine=mMine();
  $("mClock").textContent="PK戦";
  $("psoBox").hidden=false;
  $("psoTitle").textContent="PENALTY SHOOT-OUT";
  // **開いたら見える位置へ送る**。実況の下に出るので、放っておくと画面外
  setTimeout(()=>{ try{ $("psoBox").scrollIntoView({block:"center"}); }catch(e){} },30);
  $("psoRows").innerHTML="";
  $("mDone").style.display="none";
  let i=0;
  const step=()=>{
    if(i>=kicks.length){
      const p=_M.pso, w=p.win===mine;
      $("psoSum").innerHTML='<b class="'+(w?"w":"l")+'">'+(w?"勝ち抜け":"敗退")+'</b>'
        +'<span class="num">PK '+(mine==="H"?p.hg+" - "+p.ag:p.ag+" - "+p.hg)+'</span>';
      $("mSc").textContent=mScore(_M.home.score,_M.away.score);
      $("mDone").style.display="";
      // **決着も見える位置へ送る**。本数が多いと一覧ごと画面外へ流れる
      setTimeout(()=>{ try{ $("psoBox").scrollIntoView({block:"end"}); }catch(e){} },30);
      return;
    }
    const e=kicks[i++];
    const p=playerOf(_M,e.side,e.by);
    const gk=playerOf(_M,e.side==="H"?"A":"H",e.gk);
    // **まず蹴る**(→docs/03 §3.33)。一覧に積むのは結果が出てから
    const ms=cutPso(e,p,gk);
    _psoTimer=setTimeout(()=>{
      // **印は成否、タグはどちらの蹴りか**。色で両方を表すと読み違える
      $("psoRows").insertAdjacentHTML("beforeend",
        '<div class="pso-r'+(e.side===mine?" me":"")+'">'
        +'<span class="pso-n num">'+e.n+'</span>'
        +'<span class="pso-w">'+(e.side===mine?"自":"相")+'</span>'
        +'<span class="pso-m'+(e.ok?" ok":"")+'">'+(e.ok?"●":"×")+'</span>'
        +'<span class="pso-p">'+esc(p?shortName(p.c):"—")+'</span>'
        +'<span class="pso-s num">'+(mine==="H"?e.hg+"-"+e.ag:e.ag+"-"+e.hg)+'</span></div>');
      const box=$("psoRows"); box.scrollTop=box.scrollHeight;
      _psoTimer=setTimeout(step,TUNING.play.psoGap/Math.max(1,_mSpeed));
    },ms);
  };
  step();
}
// ---------- 選手交代(→docs/06 §6.21) ----------
// **開くと試合が止まる。** 走らせたまま選ばせると、決めている間に局面が進んで
// 「誰を替えるつもりだったか」が変わってしまう。
let _subOut=-1, _subIn=-1, _subWasPaused=false;

function subSide(){ return mMine()==="H"?_M.home:_M.away; }
function openSub(){
  if(!_M||_M.over)return;
  _subWasPaused=_mPaused;
  if(!_mPaused)mPause(true);                 // 開いている間は必ず止める
  _subOut=-1; _subIn=-1;
  renderSub();
  $("subDrawer").classList.add("on");
  $("subDrawer").setAttribute("aria-hidden","false");
}
function closeSub(){
  $("subDrawer").classList.remove("on");
  $("subDrawer").setAttribute("aria-hidden","true");
  if(!_subWasPaused&&_M&&!_M.over)mPause(false);   // 元が再生中なら戻す
}
const subOpen=()=>$("subDrawer").classList.contains("on");

// ---------- 采配(→docs/03 §3.28 / docs/06 §6.22) ----------
// **同時に効くのは1つだけ。** 選んだ時点で閉じて試合が再開し、いつでも変えられる。
// 指示は試合をまたいで持ち越す(監督の構え)ので、次の試合もその形で始まる。
let _ordWasPaused=false;
function renderOrd(){
  const cur=S.order;
  // **十字に置く**。行/列は指示の意味そのもの(上=攻撃 / 左中右=レーン / 下=守備)
  const cell=o=>o.push>0?"1 / 2":o.push<0?"3 / 2"
    :o.lane<40?"2 / 1":o.lane>60?"2 / 3":"2 / 2";
  const btn=o=>'<button class="od-b'+(cur===o.id?" on":"")
    +'" data-ord="'+o.id+'" style="grid-area:'+cell(o)+'">'
    +'<span class="od-i">'+o.icon+'</span><span class="od-l">'+esc(o.label)+'</span></button>';
  const up=ORDERS.find(o=>o.push>0), dn=ORDERS.find(o=>o.push<0);
  const lanes=ORDERS.filter(o=>o.lane!=null);
  $("ordNote").textContent=cur
    ?"いま出している指示: "+orderById(cur).label+"（もう一度押すと解除）"
    :"指示を1つ選ぶと、その形で試合が再開します。";
  $("ordPad").innerHTML=btn(up)+lanes.map(btn).join("")+btn(dn);
  $("ordDesc").textContent=cur?orderById(cur).desc:"指示なし。陣形どおりに戦います。";
  $("ordPad").querySelectorAll("[data-ord]").forEach(el=>{
    el.onclick=()=>pickOrder(el.dataset.ord===cur?null:el.dataset.ord);
  });
}
/** 指示を出す。**エンジンには積むだけ**で、次のティックの頭で効く(→docs/07 §7.6)。 */
function pickOrder(id){
  S.order=id||null;
  if(_M&&!_M.over)orderMatch(_M,mMine(),{ type:"order", id:S.order });
  save();
  toast(id?orderById(id).label+" を指示しました":"指示を解除しました");
  closeOrd();
}
function openOrd(){
  if(!_M||_M.over)return;
  _ordWasPaused=_mPaused;
  if(!_mPaused)mPause(true);                 // 開いている間は必ず止める
  renderOrd();
  $("ordDrawer").classList.add("on");
  $("ordDrawer").setAttribute("aria-hidden","false");
}
function closeOrd(){
  $("ordDrawer").classList.remove("on");
  $("ordDrawer").setAttribute("aria-hidden","true");
  if(!_ordWasPaused&&_M&&!_M.over)mPause(false);   // 元が再生中なら戻す
}
const ordOpen=()=>$("ordDrawer").classList.contains("on");

/** スタミナのバー1本。**残量で色が変わる**ので、替えどきが一目で分かる。 */
function stamBar(v){
  const pc=Math.round(clamp(v,0,1)*100);
  const cls=pc<45?" low":pc<70?" mid":"";
  return '<div class="sb-bar'+cls+'"><i style="width:'+pc+'%"></i></div>';
}
/**
 * 交代ドロワーの中身。**申請済みの交代を先に反映して見せる**(→docs/06 §6.21)。
 * 実際の入れ替えは次の再開時だが、リスト上ですぐ入れ替わらないと
 * 「もう選んだのか、まだなのか」が分からず、3枠を続けて使えない。
 */
function subView(T){
  const pitch=T.players.map((p,i)=>({ i, p, pending:false }));
  const bench=T.bench.map((b,i)=>({ i, b, used:!!b.used, out:null }));
  for(const o of _M.orders[T.side]){
    if(o.type!=="sub")continue;
    const slot=pitch[o.out], bn=bench[o.in];
    if(!slot||!bn)continue;
    bn.used=true; bn.pending=true;
    bn.out=slot.p;                         // この枠から下がる選手(戻れない)
    slot.p={ c:bn.b.c, sub:slot.p.sub, role:slot.p.role, stam:1 };
    slot.pending=true;
  }
  return { pitch, bench };
}
function renderSub(){
  const T=subSide();
  const used=_M.subs[T.side];
  const pend=_M.orders[T.side].filter(o=>o.type==="sub").length;
  const left=Math.max(0,TUNING.squad.subMax-used-pend);
  const v=subView(T);

  $("subNote").innerHTML="スタミナの少ない選手から替えます。"
    +"<b>一度下がった選手は戻れません。</b>"
    +"交代は次の再開時（3分ごと）に反映されます。";

  const row=(cls,pos,name,val,attr,tag)=>'<div class="sb-r'+cls+'"'+attr+'>'
    +'<div class="sb-pos">'+pos+'</div>'
    +'<div class="sb-b"><div class="sb-nm">'+name+'</div>'+stamBar(val)+'</div>'
    +(tag?'<div class="sb-tag">'+tag+'</div>':'')
    +'<div class="sb-v">'+Math.round(val*100)+'%</div></div>';

  let h='<div class="sb-sec">ピッチ</div>';
  v.pitch.forEach(o=>{
    // 申請済みの枠は**もう使った枠**。入った選手は消し込みではなく施錠して見せる
    // 枠を使い切っても**薄くしない**。ここは最後までスタミナ一覧として読む画面
    const sel=o.i===_subOut, dis=o.pending||left<=0;
    h+=row((sel?" on":"")+(o.pending?" lock":""),
      o.p.sub||o.p.role, esc(shortName(o.p.c)), o.p.stam==null?1:o.p.stam,
      dis?"":' data-out="'+o.i+'"', o.pending?"IN":"");
  });
  // ベンチには**まだ出ていない選手だけ**。送り出した選手はピッチ欄に移る
  h+='<div class="sb-sec">ベンチ</div>';
  const rest=v.bench.filter(o=>!o.used);
  h+=rest.length?"":'<div class="sb-note">出せる選手が居ません</div>';
  rest.forEach(o=>{
    const sel=o.i===_subIn, dis=left<=0;
    h+=row(sel?" on":"",
      primarySub(o.b.c), esc(shortName(o.b.c)), 1,
      dis?"":' data-in="'+o.i+'"', "");
  });
  // 下がった選手は**ベンチにも戻らない**。並べて「戻れない」ことを見せる
  const gone=v.bench.filter(o=>o.out).map(o=>o.out)
    .concat((T.subOut||[]).filter(p=>!v.bench.some(o=>o.out===p)));
  if(gone.length){
    h+='<div class="sb-sec">交代済み（戻れません）</div>';
    gone.forEach(p=>{ h+=row(" done",p.sub||p.role,esc(shortName(p.c)),
      p.stam==null?0:p.stam,"","OUT"); });
  }
  $("subBody").innerHTML=h;
  $("subBody").querySelectorAll("[data-out]").forEach(el=>{
    el.onclick=()=>{ _subOut=_subOut===Number(el.dataset.out)?-1:Number(el.dataset.out); renderSub(); };
  });
  $("subBody").querySelectorAll("[data-in]").forEach(el=>{
    el.onclick=()=>{ _subIn=_subIn===Number(el.dataset.in)?-1:Number(el.dataset.in); renderSub(); };
  });
  // **残り回数はボタンに出す**。使い切ったら 0 のまま押せなくする(閉じるのは×)
  const go=$("subGo");
  go.textContent="交代する　残り"+left+"回";
  go.disabled=left<=0||_subOut<0||_subIn<0;
}
function doSub(){
  if(_subOut<0||_subIn<0)return;
  const T=subSide();
  const out=T.players[_subOut], inc=T.bench[_subIn];
  if(!orderMatch(_M,T.side,{ type:"sub", out:_subOut, in:_subIn })){
    toast("交代枠が残っていません"); return;
  }
  toast(shortName(inc.c)+" ← "+shortName(out.c)+"（次の再開時）");
  _subOut=-1; _subIn=-1;
  renderSub();
}

function mSkip(){
  clearTimeout(_mTimer); _mTimer=null;
  clearTimeout(_mCutT); clearTimeout(_mCutJ); clearTimeout(_mBallT);
  $("mCut").classList.remove("on");
  finishMatch(_M);
  mFinish();
}
/** 試合を始める。ここから先はエンジンが解いたものを再生するだけ。 */
function startMatch(){
  _M=beginMyMatch();
  _mBall=[50,50]; _mPhase=0; _mRestart=true;
  mReset();                                   // 前の試合のPK戦が残らないように
  if(!_M){ toast("試合を開始できません"); return; }
  _mSpeed=1; _mPaused=false;
  // **左が自分・右が相手**。ピッチの下が自分なのに、名前だけホーム基準だと読み替えになる
  const mine=mMine()==="H"?_M.home:_M.away, opp=mMine()==="H"?_M.away:_M.home;
  $("mNameH").textContent=mine.name; $("mNameA").textContent=opp.name;
  $("mEmbH").style.setProperty("--kit",clubColor(mMine()==="H"?_M.fixture.h:_M.fixture.a));
  $("mEmbA").style.setProperty("--kit",clubColor(mMine()==="H"?_M.fixture.a:_M.fixture.h));
  $("mSc").textContent="0 - 0"; $("mClock").textContent="KICK OFF";
  $("mFeed").innerHTML=""; $("mDone").style.display="none";
  $("mPlay").disabled=$("mSpeed").disabled=$("mSkip").disabled=false;
  $("mPlay").textContent="⏸ 一時停止"; $("mSpeed").textContent="×1";
  show("match");
  mDrawSquads();
  $("mBall").style.left="50%"; $("mBall").style.top="50%";
  // キックオフのイベントは createMatch が積んでいるので、ここで自分で見せる
  // (stepMatch は返さない)。card-eleven と同じく**開始からカットインする**。
  const hold=mApply(_M.events[0]);
  _mTimer=setTimeout(mTick,600+hold);
}
function doMatchday(){
  const done=_M&&_M.over?_M:null;
  const out=playMatchday(done);          // 試合の中身(out.M)は playMatchday が入れる
  _M=null; _lastResult=out;
  save(); headUI(); show("result");
  // **大会の完了はここでしか分からない**。賞金と名声はこの節に入る(→§3.23 / §3.9)
  const cc=out&&out.cupClosed;
  if(cc)toast(cc.cup.name+" 終了　優勝 "+(cc.win?"自クラブ":cc.champ)
    +"　+"+fmtNum(cc.coin)+"コイン"+(cc.fame?"　名声 +"+fmtNum(cc.fame):""));
}
/**
 * 試合結果(→docs/06 §6.20)。モックの構成に準拠:
 *   スコア → 勝敗 → MOM のカード → チームスタッツ → 選手採点 → 報酬 → 他会場
 * **集計はすべてエンジン側(matchStats / matchRatings)**。ここは並べるだけ。
 */
function renderResult(){
  const o=_lastResult; if(!o||!o.my){ show("home"); return; }
  const m=o.my, M=o.M;
  $("resultHead").textContent=m.cup?(m.label||"CUP"):"FULL TIME";
  // **カップの相手はクラブ一覧に居ない**。記録側が持っている名前を使う
  // (clubName(null) をそのまま出していて "null" と表示されていた)
  const foe=m.cup?(m.oppName||"—"):clubName(m.opp);
  $("rsScore").innerHTML='<b>'+esc(clubName(S.club.id))+'</b>'
    +'<span class="num">'+m.gf+' - '+m.ga+'</span>'
    +'<b>'+esc(foe)+'</b>';
  // PK戦で決まったなら、そのスコアを添える(→docs/03 §3.33)
  $("rsVerdict").textContent=(m.win?"勝利":m.draw?"引き分け":"敗戦")
    +(m.pso?"　PK "+m.pso.gf+"-"+m.pso.ga:"");
  $("rsReward").innerHTML=m.cup
    ?'<span>'+esc(m.label||"カップ戦")+'</span><span>+'+(m.win?350:150)+' EXP</span>'
    :'<span>+'+fmtNum(m.win?TUNING.reward.win:m.draw?TUNING.reward.draw:TUNING.reward.lose)
      +' コイン</span><span>+'+(m.win?350:m.draw?220:150)+' EXP</span>';
  $("rsOthers").innerHTML=o.others.map(x=>'<div class="fx"><span class="nm">'+esc(clubName(x.h))+'</span>'
    +'<span class="num">'+x.hg+' - '+x.ag+'</span>'
    +'<span class="nm">'+esc(clubName(x.a))+'</span></div>').join("")||'<div class="lg">なし</div>';
  $("btnResultOk").onclick=()=>show("home");
  $("btnResultNext").onclick=()=>show("season");

  // 試合の中身が無い(古いセーブ等)ときはスコアだけで成立させる
  if(!M){ $("rsMom").innerHTML=""; $("rsBars").innerHTML=""; $("rsList").innerHTML=""; return; }
  const mySide=M.fixture.h===S.club.id?"H":"A", opSide=mySide==="H"?"A":"H";
  const st=matchStats(M);

  // MOM は両チームから1人。カードそのものを見せる
  const mom=manOfTheMatch(M);
  $("rsMom").innerHTML=mom?cardTile(mom.p.c):"";
  $("rsMom").querySelectorAll("[data-card]").forEach(el=>{ el.onclick=()=>openCard(mom.p.c); });

  // チームスタッツ(左=自チーム)
  const rows=[
    ["支配率", st[mySide].possPct, st[opSide].possPct, "%"],
    ["シュート", st[mySide].shots, st[opSide].shots, ""],
    ["枠内", st[mySide].sog, st[opSide].sog, ""],
    ["ブロック", st[mySide].blocks, st[opSide].blocks, ""],
    ["パス成功率", passPct(st[mySide]), passPct(st[opSide]), "%"],
  ];
  $("rsBars").innerHTML=rows.map(([lb,a,b,u])=>{
    const t=a+b||1;
    return '<div class="rs-bar"><div><span>'+a+u+'</span><span>'+lb+'</span><span>'+b+u+'</span></div>'
      +'<div class="rs-tr"><i style="width:'+(a/t*100)+'%"></i>'
      +'<i style="width:'+(b/t*100)+'%"></i></div></div>';
  }).join("");

  // 選手採点(自チーム。評価の高い順)
  const list=matchRatings(M,mySide);
  $("rsList").innerHTML=list.map(x=>{
    const p=x.p, s2=p.stat;
    const g=(s2.goals?"⚽"+s2.goals+" ":"")+(s2.assists?"A"+s2.assists:"");
    return '<div class="rs-p'+(x.min<90?" out":"")+'" data-card="'+p.c.id+'"'+kitStyle(p.c)+'>'
      +'<div class="rs-pos">'+(p.sub||p.role)+'</div>'
      +'<div class="rs-nm"><b>'+esc(shortName(p.c))+'</b><span>'+g+'</span></div>'
      +'<div class="v">'+s2.shots+'</div>'
      +'<div class="v">'+(s2.pass?Math.round(s2.passOk/s2.pass*100)+"%":"—")+'</div>'
      +'<div class="v dim">'+x.min+"'"+'</div>'
      +'<div class="rs-rt '+(x.rating>=7?"hi":x.rating<5?"lo":"")+'">'+x.rating.toFixed(1)+'</div>'
    +'</div>';
  }).join("");
  $("rsList").querySelectorAll("[data-card]").forEach((el,i)=>{
    el.onclick=()=>openCard(list[i].p.c);
  });
}
const passPct=t=>t.pass?Math.round(t.passOk/t.pass*100):0;

// ---------- オーナー(→docs/03 §3.9) ----------
// **オーナーと向き合う場は1つ**。開幕も総括も去就も同じ画面で、HOME から同じタイルで行く。
// 重なったら「総括 → 去就」の順に出す(先にシーズンを畳んでからでないと契約の話にならない)。
const OWNER_EV={
  open:  { tag:"就任のあいさつ", line:"オーナーが目標を告げようとしています。", go:"Meet the Owner" },
  season:{ tag:"シーズンの総括", line:"今季の全日程が終了しました。", go:"Meet the Owner" },
  tenure:{ tag:"契約の話", line:"オーナーが去就について話したいそうです。", go:"Meet the Owner" },
};
/** いま待っているオーナーのイベント。**順番はここが持つ**(総括が去就より先)。 */
function pendingOwner(){
  const C=S.career;
  if(!S.club||!C)return null;
  if(!C.opened)return "open";
  if(seasonOver())return "season";
  if(!C.tenureDone&&C.node>=TUNING.tenure.extendAt&&!C.over)return "tenure";
  return null;
}
let _review=null;
/** オーナーに会う。**ここで判定も走る**ので、開いた時点で結果は確定している。 */
async function openOwner(){
  const k=pendingOwner(); if(!k)return;
  if(k==="open"){ S.career.opened=true; _review={ kind:"open" }; }
  else if(k==="season")_review={ kind:"season", j:judgeSeason() };
  else _review={ kind:"tenure", t:ownerTenure() };
  await save();
  show("board",{push:1});
}
/** 評価の見え方(→docs/03 §3.9)。**数字だけを置かない。** 何で動いたかを添える。 */
// **名声も同じ表から出る**(→docs/03 §3.9)ので、理由の札に両方を並べる。
// 評価と名声が同じ出来事から来ていることが、札を見れば分かる
const EVAL_WHY={ upset:["格上を倒した",1], slip:["格下に取りこぼした",-1],
  lChamp:["リーグ優勝",1], promote:["昇格",1],
  cChamp:["カップ優勝",1], cOut1:["カップ初戦敗退",-1] };
function ownerRating(evLog){
  const E=TUNING.eval, v=Math.round(S.club.eval);
  const need=E.extendNeed;
  const why=Object.keys(EVAL_WHY).filter(k=>evLog&&evLog[k]).map(k=>{
    const [lab,sign]=EVAL_WHY[k], n=evLog[k], pt=E[k]*n*sign;
    return '<span class="ev-w'+(sign>0?" up":" dn")+'">'+lab+(n>1?" ×"+n:"")
      +'<b>'+(pt>0?"+":"")+pt+'</b>'
      +(E.fameFor.includes(k)?'<s>名声 +'+fmtNum(E[k]*n*E.fameK)+'</s>':"")+'</span>';
  }).join("");
  return '<div class="ev-box"><div class="ev-h"><span class="eyebrow">OWNER RATING</span>'
    +'<b class="'+(v>=need?"ok":"")+'">'+esc(evalLabel(S.club.eval))+'</b></div>'
    +'<div class="ev-bar"><i style="width:'+v+'%"></i>'
      +'<u style="left:'+need+'%" title="延命ライン"></u></div>'
    +'<div class="ev-lg">第'+TUNING.tenure.extendAt+'節に <b>'+need+'</b> 以上で契約が延びます'
      +'（いま '+v+'）</div>'
    +(why?'<div class="ev-ws">'+why+'</div>':"")
  +'</div>';
}
// 見出しは**誰の話か**ではなく**何の話か**。2つ並ぶときに同じ札が続くと、
// 同じことを2回言われたように読める
const ownerSay=(pool,vars,seed,head)=>'<div class="bd-say"><span class="eyebrow">'
  +(head||"OWNER")+'</span>'
  +'<b>「'+esc(chatText(pool,seed,vars||{}))+'」</b></div>';

/**
 * オーナーの画面(→docs/03 §3.9)。開幕・総括・去就の3つを1つの型で出す。
 * **クラブは替わらない**ので、見せるのは「どこまで来たか」と「次に何を求められているか」。
 */
function renderBoard(){
  const r=_review; if(!r)return;
  const W=S.world, lg=leagueById(clubById(S.club.id).league);

  // ---- 開幕。オーナーが目標順位を告げる ----
  if(r.kind==="open"){
    $("boardHead").textContent="SEASON "+W.season+" · APPOINTMENT";
    $("boardMove").innerHTML='<div class="bd-move stay">'
      +'<span class="eyebrow">TARGET</span><b>'+S.club.expect+'位以内</b>'
      +'<span class="lg">'+esc(clubName(S.club.id)+" ／ "+lg.name+" "+divName(W.div))+'</span></div>';
    $("boardOwner").innerHTML=ownerSay(OWNER.open,{ g:String(S.club.expect) },"op:"+W.season);
    $("boardBox").innerHTML='<div class="sect-t">契約</div>'
      +kv("目標順位",S.club.expect+"位以内")
      +kv("達成すると","一時金 +"+fmtNum(TUNING.reward.season.goalHit)+" コイン（上回るほど増額）")
      +kv("届かないと","1つ下回るごとに −"+fmtNum(TUNING.reward.season.goalMiss)+" コイン")
      +kv("任期",TUNING.tenure.limit+"節（第"+TUNING.tenure.extendAt+"節の評価しだいで "
        +TUNING.tenure.hardMax+"節）")
      +ownerRating(null);
    $("boardGo").textContent="シーズンを始める";
    $("boardGo").onclick=async()=>{ await save(); show("home"); };
    return;
  }
  // ---- 第80節。去就 ----
  if(r.kind==="tenure"){
    const t=r.t;
    $("boardHead").textContent="NODE "+S.career.node+" · CONTRACT";
    $("boardMove").innerHTML='<div class="bd-move '+(t.ok?"up":"stay")+'">'
      +'<span class="eyebrow">'+(t.ok?"EXTENDED":"UNCHANGED")+'</span>'
      +'<b>'+(t.ok?"任期 +"+t.add+"節":"任期はそのまま")+'</b>'
      +'<span class="lg">上限 '+t.limit+'節 ／ 残り '+tenureLeft()+'節</span></div>';
    $("boardOwner").innerHTML=ownerSay(t.ok?OWNER.keepOk:OWNER.keepNg,null,"kp:"+S.career.node);
    $("boardBox").innerHTML=ownerRating(S.club.evLog);
    $("boardGo").textContent="続ける";
    $("boardGo").onclick=async()=>{ await save(); show("home"); };
    return;
  }
  // ---- シーズンの総括(+ 次のシーズンの目標) ----
  const j=r.j, m=j.move;
  $("boardHead").textContent="SEASON "+W.season+" REVIEW · "+lg.abbr+" "+divName(m.from);
  const kind=m.promoted?"up":m.relegated?"down":"stay";
  const lab=m.promoted?"昇格":m.relegated?"降格":"残留";
  $("boardMove").innerHTML='<div class="bd-move '+kind+'">'
    +'<span class="eyebrow">'+(m.promoted?"PROMOTED":m.relegated?"RELEGATED":"STAY")+'</span>'
    +'<b>'+j.rank+'位 ／ '+lab+'</b>'
    +'<span class="lg">'+esc(lg.name+" "+divName(m.from)
      +(m.move?" → "+divName(m.to):"（"+divName(m.to)+"のまま）"))+'</span></div>';
  // オーナーの言葉。**総括と次季の目標を1つのイベントにまとめる**(→docs/03 §3.9)
  const key=m.promoted?"up":m.relegated?"down":j.diff>0?"over":j.diff<0?"under":"met";
  $("boardOwner").innerHTML=ownerSay(OWNER[key],null,S.club.id+":"+W.season)
    +(j.nextGoal?ownerSay(OWNER.goal,{ g:String(j.nextGoal) },"gl:"+W.season,"NEXT SEASON"):"");
  // 数字。**目標に対してどうだったか**を賞金の内訳で見せる
  const gc=j.goalCoin;
  $("boardBox").innerHTML='<div class="sect-t">総括</div>'
    +kv("順位",j.rank+"位（目標 "+j.goal+"位）")
    +kv(gc>=0?"達成ボーナス":"減俸",(gc>=0?"+":"")+fmtNum(gc)+" コイン")
    +kv("賞金の合計","+"+fmtNum(j.coin||0)+" コイン"
      +(m.promoted?"（昇格 +"+fmtNum(TUNING.reward.season.promote)+"）":"")
      +(j.rank===1?"（優勝 +"+fmtNum(TUNING.reward.season.champ)+"）":""))
    +kv("所持コイン",fmtNum(S.club.coins))
    +kv("名声","+"+fmtNum(j.fameGain)+" ／ 通算 "+fmtNum(S.player.fame))
    // **実績はここでしか知らせない**(→docs/03 §3.36)。CLUB の棚を開かないと
    // 気づかないのでは、制覇の重みが出ない
    +(j.trophy?kv("実績","🏆 "+esc(j.trophy.name)
      +(j.trophy.first?"（初）":"（×"+j.trophy.n+"）")):"")
    +kv("任期","残り "+tenureLeft()+" 節（上限 "+S.career.limit+"）")
    +ownerRating(j.evLog)
    +(S.career.over?'<div class="lg" style="margin-top:10px">任期が明けました。次のクラブを選べます。</div>':"");
  $("boardGo").textContent=S.career.over?"キャリアを振り返る":divName(m.to)+" を始める";
  $("boardGo").onclick=async()=>{
    if(S.career.over){ show("career"); return; }
    startNextSeason();
    await save(); headUI(); show("home");
    toast("SEASON "+S.world.season+" ／ "+divName(S.world.div)+" が始まりました");
  };
}
/** 任期終了 = キャリア1周の終わり。積み上げたものを見せて次の周へ送り出す。 */
function renderCareerEnd(){
  const C=S.career, h=S.player.history;
  const w=C.log.filter(e=>e.res==="win").length;
  const d=C.log.filter(e=>e.res==="draw").length;
  const l=C.log.filter(e=>e.res==="lose").length;
  $("endBody").innerHTML=
    '<div class="end-t">任期満了</div>'
    // **キャリアの終わりではなく任期の終わり**(→docs/03 §3.2.3)。
    // 名声・実績・カードは持ったまま次のクラブへ移る
    +'<div class="lg" style="margin-bottom:14px">'+esc(S.coach||"監督")
      +' の任期が満了しました。名声と実績、集めたカードは次のクラブへ持っていけます。</div>'
    +kv("戦った節",C.log.length+" 節")
    +kv("通算成績",w+"勝 "+d+"分 "+l+"敗")
    +kv("渡り歩いたクラブ",new Set(h.map(x=>x.clubId)).size+" クラブ")
    +kv("最終的な名声",fmtNum(S.player.fame))
    +kv("集めたカード",S.player.coll.length+" 枚")
    // **連れていく選手をここで見せる**(→docs/03 §3.39)。次の任期の頭で
    // 「なぜ強いのか」が分かるように、送り出す画面で名前を出しておく
    +kv("連れていく選手",(C.mentor||[]).length
      ?(C.mentor||[]).map(id=>{ const c=cardById(id);
          return c?esc(shortName(c))+(trainStar(id)?"★"+trainStar(id):""):"—"; }).join(" / ")
      :"—")
    +'<div class="sect-t" style="margin-top:14px">CAREER</div>'
    +h.map(x=>'<div class="kv"><span>S'+x.season+' '+esc(clubName(x.clubId))
      +(x.div?' '+divName(x.div):"")+'</span><b>'
      +(x.rank?x.rank+"位 "+x.result:"—")+'</b></div>').join("");
}

// ---------- 就任先の選択 ----------
let _pickedClub=null;
function renderOffers(){
  const fame=S.player.fame;
  const list=offersFor(fame).sort((a,b)=>b.grade-a.grade||a.rank-b.rank).slice(0,12);
  $("offerHead").textContent="OFFERS · 名声 "+fmtNum(fame);
  $("offerNote").textContent="名声が届いたクラブから声がかかります。格が高いほど期待も高くなります。";
  $("offerList").innerHTML=list.map(c=>{
    const lg=leagueById(c.league);
    return '<div class="offer" data-club="'+c.id+'">'
      +'<div class="of-l"><b>'+esc(c.name)+'</b>'
      +'<div class="lg">'+lg.name+' '+divName(c.div)+' ／ 部内'+c.rank+'位相当 ／ 格★'+c.grade+'</div></div>'
      +'<div class="of-r num">'+fmtNum(requiredFame(c))+'</div></div>';
  }).join("");
  $("offerList").querySelectorAll("[data-club]").forEach(el=>{
    el.onclick=async()=>{
      _pickedClub=el.dataset.club;
      if(S.club){ await joinClub(_pickedClub); }      // 2シーズン目以降は即就任
      else{ openContract(); }                          // 初回は契約書へ戻る
    };
  });
}
async function joinClub(clubId){
  startTenure(clubId);
  await save(); headUI(); show("home");
  toast(clubName(clubId)+"に就任しました");
}

// ---------- 就任契約書 ----------
// 暗い画面の中に1枚だけ「紙の書類」を置く。記入 → 署名欄に反映 → 押印して就任、
// という手順そのものを見せることで、就任を通過儀礼ではなく儀式にする。
function openContract(){
  $("ctCoach").value=S.coach||"";
  $("ctDate").textContent=todayLabel();
  $("ctSeason").textContent="MANAGERIAL CONTRACT · SEASON "+S.world.season;
  $("ctSeasonRef").textContent="シーズン"+S.world.season;
  const c=_pickedClub?clubById(_pickedClub):null;
  $("ctPickClub").textContent=c?c.name:"クラブを選ぶ";
  $("ctPickClub").classList.toggle("picked",!!c);
  $("ctLeague").textContent=c?leagueById(c.league).name+" "+divName(c.div):"—";
  $("ctGrade").textContent=c?"★"+c.grade+"（部内"+c.rank+"位相当）":"—";
  $("ctNote").textContent=c?c.name+" 監督として登録されます":"クラブを選ぶと契約内容が確定します";
  updateSignature();
  show("contract");
}
/** 記入した氏名を署名欄へ即時に反映する(書いている実感を出すため)。 */
function updateSignature(){
  $("ctSignPreview").textContent=($("ctCoach").value||"").trim();
}
async function signContract(){
  const coach=($("ctCoach").value||"").trim();
  if(!coach){ toast("監督名を記入してください"); return; }
  if(!_pickedClub){ toast("就任先クラブを選んでください"); return; }
  S.coach=coach;
  await joinClub(_pickedClub);
}

// --- 配線(結合時に一度だけ実行される) ---
document.querySelectorAll("#tabs button").forEach(b=>{ b.onclick=()=>show(b.dataset.s); });
$("hdBack").onclick=goBack;
$("ctSign").onclick=signContract;
$("ctPickClub").onclick=()=>show("offer",{push:1});
$("ctCoach").oninput=updateSignature;
document.querySelectorAll("#scr-schedule .comp").forEach(b=>{
  b.onclick=()=>{ _comp=b.dataset.comp; renderSchedule(); };
});
$("btnAutoSquad").onclick=()=>{ S.squad=autoSquad(); save(); renderDeck(); toast("自動編成しました"); };
$("btnForm").onclick=openForm;
$("cardModal").onclick=e=>{ if(e.target===$("cardModal"))closeCard(); };  // 外側タップで閉じる
$("slotModal").onclick=e=>{ if(e.target===$("slotModal"))closeSlot(); };
$("formModal").onclick=e=>{ if(e.target===$("formModal"))closeForm(); };
$("helpTab").onclick=e=>{ e.stopPropagation(); helpOpen()?closeHelp():openHelp(); };
$("helpClose").onclick=e=>{ e.stopPropagation(); closeHelp(); };
// 同じタブをもう一度押したら閉じる。別のタブなら中身を入れ替えて開いたままにする
$("contractTab").onclick=e=>{ e.stopPropagation(); closeHelp();
  (sideOpen()&&_side==="contract")?closeSide():openSide("contract"); };
$("compTab").onclick=e=>{ e.stopPropagation(); closeHelp();
  (sideOpen()&&_side==="comp")?closeSide():openSide("comp"); };
$("sideClose").onclick=e=>{ e.stopPropagation(); closeSide(); };
// 外側のどこかを触ったら閉じる(閉じるボタンを探さなくてよいように)
document.addEventListener("click",e=>{
  const near=s=>e.target.closest&&e.target.closest(s);
  if(helpOpen()&&!near("#helpDrawer")&&!near("#helpTab"))closeHelp();
  if(sideOpen()&&!near("#sideDrawer")&&!near("#sideTabs"))closeSide();
});
$("btnGallery").onclick=()=>show("gallery",{push:1});
$("tileScout").onclick=()=>{ _scoutGot=null; show("gacha",{push:1}); };
$("tileDeck").onclick=()=>show("deck");
/** 再生と一時停止。交代ドロワーからも呼ぶので関数にしてある。 */
function mPause(on){
  _mPaused=on;
  $("mPlay").textContent=on?"▶ 再生":"⏸ 一時停止";
  if(!on)mTick();
}
$("mPlay").onclick=()=>mPause(!_mPaused);
$("subTab").onclick=()=>{ subOpen()?closeSub():openSub(); };
$("subClose").onclick=closeSub;
$("ordTab").onclick=()=>{ ordOpen()?closeOrd():openOrd(); };
$("ordClose").onclick=closeOrd;
$("subGo").onclick=doSub;
$("mSpeed").onclick=()=>{
  const sp=TUNING.ui.speeds;
  _mSpeed=sp[(sp.indexOf(_mSpeed)+1)%sp.length];
  $("mSpeed").textContent="×"+_mSpeed;
};
$("mSkip").onclick=mSkip;
$("mDone").onclick=doMatchday;
// **任期が明けたら次の任期へ**(→docs/03 §3.2.3)。名声・実績・カードは持ち越す。
// ここで newGame() を呼ぶと、積み上げたものが毎回消えて周回にならない
$("btnNewCareer").onclick=async()=>{
  newTenure(); _pickedClub=null; await save(); show("offer");
};
