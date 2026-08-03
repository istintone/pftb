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
  home:      { title:"HOME",      tab:"home",      chrome:"full", render:()=>renderHome() },
  cards:     { title:"CARDS",     tab:"cards",     chrome:"full", render:()=>renderCards() },
  deck:      { title:"DECK",      tab:"deck",      chrome:"full", render:()=>renderDeck() },
  season:    { title:"SEASON",    tab:"season",    chrome:"full", render:()=>renderSeason() },
  clubhouse: { title:"CLUB",      tab:"clubhouse", chrome:"full", render:()=>renderClubhouse() },
  schedule:  { title:"FIXTURES",  under:"season",  chrome:"back", render:()=>renderSchedule() },
  standings: { title:"STANDINGS", under:"season",  chrome:"back", render:()=>renderStandings() },
  gallery:   { title:"GALLERY",   under:"clubhouse", chrome:"back", render:()=>renderGallery() },
  gacha:     { title:"SCOUT",     under:"home",    chrome:"back" },
  secretary: { title:"SECRETARY", under:"home",    chrome:"back" },
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

  if(def.render)def.render();
  $("appBody").scrollTop=0;
  if(def.after)def.after();      // 描画後の後処理(現在節へスクロール等)
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
  const own=!isLoaned(c);
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
      +'<b>'+(own?'<i class="own">★</i>':'')+esc(shortName(c))+'</b>'
      // ポジションは OVR の下へ移したので、名前帯は**クラブだけ**
      +'<span>'+esc(c.club||"—")+'</span>'
    +'</div>';
}
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
  const src=art&&(window.ASSETS&&window.ASSETS.players||{})[art+"_"+(kind||"play")];
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
  $("homeSeason").textContent="SEASON "+W.season+" · MATCHDAY "+String(Math.min(W.matchday,W.fixtures.length)).padStart(2,"0");

  const f=myFixture();
  if(seasonOver()){
    $("homeNext").innerHTML='<div class="lg">今季の全日程が終了しました。'
      +(S.career.closing?'<br><b>任期の上限に達しています。ここで去就が決まります。</b>':'')+'</div>'
      +'<button class="btn" id="btnFinishSeason" style="margin-top:10px">シーズンを終える</button>';
    $("btnFinishSeason").onclick=finishSeason;
  }else if(f){
    // 試合そのものはスケジュール画面(=クラブ進行の起点)から始める。
    // HOME は「監督のデバイス」であって、進行の操作盤ではない(→docs/06 §6.8)。
    $("homeNext").innerHTML='<div class="next-vs"><b>'+esc(clubName(S.club.id))+'</b>'
      +'<span class="vs">vs</span><b>'+esc(clubName(f.opp))+'</b></div>'
      +'<div class="lg" style="margin:6px 0 10px">'+(f.home?"HOME":"AWAY")+' ／ 第'+W.matchday+'節</div>'
      +'<button class="btn" id="btnPlay">試合を進める</button>';
    $("btnPlay").onclick=()=>show("season");
  }
  // 秘書: 次に何をすればよいかを示す(ナラティブ誘導)
  $("homeSec").innerHTML='<div class="bubble">'+esc(secretaryLine())+'</div>';
  // CLUB NEWS: クラブの今(一時的なコンディションの表示でもある)
  $("homeNews").innerHTML=clubNews().map(n=>'<div class="news">'+n+'</div>').join("");
}
function secretaryLine(){
  if(seasonOver())return "監督、今季の全日程が終わりました。会長がお待ちです。";
  if(S.world.matchday===1)return "監督、就任おめでとうございます。まずは編成を確認してから初戦に臨みましょう。";
  const r=rankOf(S.world.table,S.club.id);
  if(r<=S.club.expect)return "現在"+r+"位。期待を上回っています、この調子で。";
  return "現在"+r+"位。会長の期待は"+S.club.expect+"位です。巻き返しましょう。";
}
function clubNews(){
  const r=rankOf(S.world.table,S.club.id), t=S.world.table[S.club.id];
  const lg=leagueById(clubById(S.club.id).league);
  return [
    "今季の目標は<b>"+S.club.expect+"位以内</b>。現在 <b>"+r+"位</b>（"+t.w+"勝"+t.d+"分"+t.l+"敗）",
    lg.name+"は<b>"+lg.style+"</b>のチームが多い。",
    "チーム熟練度 <span class='num'>"+fmtNum(S.club.exp)+"</span> ／ 会長の評価 "+evalLabel(S.club.eval),
  ];
}
const evalLabel=v=>v>=75?"良好":v>=45?"普通":v>=TUNING.eval.floorDismiss?"不満":"危機的";

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
    +"　<span class=\"own\">★</span> 自分のカード "+own+" 枚";
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
// WORLD CLASS / LEGENDS は実在選手の段でパックからは出ないため、
// 通常のプレーでは見る手段が無い。見本としてここで全段を並べる(→docs/03 §3.13)。
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
          +'<div class="pk-b"><b>'+(isLoaned(c)?"":'<i class="own">★</i>')
            +esc(c.name)+'</b>'
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
  if(cardId!=null){
    const at=S.squad.indexOf(cardId);
    if(at>=0&&at!==ix)S.squad[at]=S.squad[ix];   // 入れ替え(空きが出ない)
  }
  S.squad[ix]=cardId;
  save(); closeSlot(); renderDeck();
}

// ---------- セットプレー担当(→docs/06 §6.15 / docs/07 §7.11) ----------
// 蹴る種類ごとに見る能力が違う。**指名は先発にしか効かない**(蹴る人が居ないため)。
const SP_KINDS=[["pk","PK","指名"],["fk","FK","指名"],["ck","CK","指名"]];
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
function openCard(x){
  const c=(x&&typeof x==="object")?x:cardById(x); if(!c)return;
  const nation=nationById(c.nation);
  $("cardModalBody").className="cm-sheet "+rarClass(c);
  $("cardModalBody").innerHTML=
    '<button class="cm-x" id="cardModalClose" aria-label="閉じる">×</button>'
    // 上半分は一覧と同じカードそのもの(同じ部品を大きく見せる)
    +'<div class="pcard cm-card '+rarClass(c)+'"'+cardBgStyle(c)+'>'+cardFace(c)+'</div>'
    +'<div class="cm-b">'
      +'<div class="cm-name">'+esc(c.name)+'</div>'
      +'<div class="cm-sub">'+c.pos+' · '+esc(c.club||"—")+' · '+esc(nation?nation.name:c.nation)+'</div>'
      +'<div class="cm-facts">'
        +'<div><span>年齢</span><b>'+c.age+'歳</b></div>'
        +'<div><span>得意ポジション</span><b>'+c.subs.join(" / ")+'</b></div>'
      +'</div>'
      +'<div class="cm-k">ABILITY <span class="cm-cap">/ '+STAT_MAX+'</span></div>'
      +'<div class="bars">'+STAT_KEYS.map(k=>
        '<div class="bar"><span>'+STAT_LABEL[k]+'</span>'
        +'<div class="tr"><i style="width:'+Math.round(c[k]/STAT_MAX*100)+'%"></i></div>'
        +'<b>'+c[k]+'</b></div>').join("")+'</div>'
      +'<div class="cm-k">SKILLS</div>'
      +'<div class="skills">'+c.skills.map(s=>'<span class="skill">'+esc(s)+'</span>').join("")+'</div>'
      +'<div class="cm-k">COMBINATION</div>'
      +'<div class="cm-combo">'+esc(c.club||"—")+'</div>'
      +'<div class="cm-k">PROFILE</div>'
      +'<div class="cm-bio">'+esc(bioOf(c))+'</div>'
      +'<div class="cm-own">'+(isLoaned(c)
        ? "クラブからの貸与 — 退任するとこのクラブに残ります"
        : "<span class=\"own\">★</span> 自分のカード — 移籍しても連れて行けます")+'</div>'
    +'</div>';
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
  return ' style="--kit:'+clubColor(S.club?S.club.id:"")+';--rar:var(--rar-'
    +c.rarity.toLowerCase()+')"';
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

  // ピッチ上の11人。位置は FORMATIONS が持つ % をそのまま使う。
  // 枠のポジション名の濃さが、そのまま**その枠への適性**を表す。
  $("deckSlots").innerHTML=slots.map(([sub,x,y],i)=>{
    const c=cards[i];
    return '<div class="slot'+(c?"":" empty")+'" style="left:'+x+'%;top:'+y+'%"'
      +' data-slot="'+i+'"'+(c?' data-card="'+c.id+'"':'')+'>'
      +'<div class="sl-pos'+(c?" fit-"+fitTier(c,sub):"")+'">'+sub+'</div>'
      // 丸の中は**適性を掛けた実効値**。素のOVRを出すと、50%の選手のほうが
      // 大きく見えて「置き間違いのほうが強い」という逆の読みになる。
      +'<div class="sl-disc'+(c?effClass(c,sub):"")+'"'+(c?kitStyle(c):"")
        +'>'+(c?effOvr(c,sub):"+")
        +(c&&!isLoaned(c)?'<span class="sl-own">★</span>':'')+'</div>'
      +'<div class="sl-name">'+(c?esc(shortName(c)):"空き")+'</div>'
    +'</div>';
  }).join("");
  // 枠をタップしたら**その枠に入れる選手を選ぶ**。カード詳細はピッカーの中から開く。
  $("deckSlots").querySelectorAll(".slot").forEach(el=>{
    el.onclick=()=>openSlot(Number(el.dataset.slot));
  });


  // 控え(交代要員)。先発と同じく**枠**なので、タップして差し替えられる。
  // 枠のポジションを持たないので適性は掛からず、素のOVRを出す(→docs/03 §3.17)。
  $("deckBench").innerHTML=Array.from({length:TUNING.squad.bench},(_,k)=>{
    const c=cards[TUNING.squad.starters+k];
    return '<div class="bn'+(c?"":" empty")+'" data-slot="'
      +(TUNING.squad.starters+k)+'"'+(c?kitStyle(c):"")+'>'
      +'<div class="bn-ovr">'+(c?c.ovr:"+")
        +(c&&!isLoaned(c)?'<span class="sl-own">★</span>':'')+'</div>'
      +'<div class="bn-name">'+(c?esc(shortName(c)):"空き")+'</div>'
      +'<div class="bn-pos">'+(c?primarySub(c):"控え"+(k+1))+'</div></div>';
  }).join("");
  $("deckBench").querySelectorAll(".bn").forEach(el=>{
    el.onclick=()=>openSlot(Number(el.dataset.slot));
  });

  // セットプレー担当(→docs/07 §7.11)。**指名しなければ能力で自動選出**なので、
  // 空欄のままでも成立する。誰が蹴るのかは常に見えている必要があるため、
  // 自動のときも実際に蹴る選手の名前を出す。
  $("deckKickers").innerHTML=SP_KINDS.map(([k,label,note])=>{
    const named=cardById(S.kickers&&S.kickers[k]);
    const on=named&&start.some(c=>c&&c.id===named.id);   // 先発に居ないと蹴れない
    const c=on?named:autoKicker(start,k);
    return '<div class="kk'+(on?"":" auto")+'" data-kick="'+k+'"'+(c?kitStyle(c):"")+'>'
      +'<div class="kk-t">'+label+'</div>'
      +'<div class="kk-nm">'+(c?esc(shortName(c)):"—")+'</div>'
      +'<div class="kk-sub">'+(on?note:"自動")+'</div>'
    +'</div>';
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
// 一覧やピッチに出す短い名前 = **姓**。表示名の並び順は国籍で変わる(日本は姓が先)ので、
// 分割して末尾を取る方法は使えない。sur を持たない古いカードだけ従来どおり分割する。
const shortName=c=>c.sur||c.name.split(" ").slice(-1)[0];

// ---------- SEASON(任期スケジュール = クラブ進行の起点) ----------
// card-eleven のキャリア画面にあたる位置づけ。就任から任期満了までを一望し、
// ここから各大会(リーグ戦/カップ戦)の日程へ降りていく。
function renderSeason(){
  const W=S.world, club=clubById(S.club.id), lg=leagueById(club.league);
  const r=rankOf(W.table,S.club.id), t=W.table[S.club.id];
  $("seasonHead").textContent="SEASON "+W.season+" · 任期スケジュール";
  $("seasonBox").innerHTML='<div class="sect-t">契約</div>'
    +kv("クラブ",esc(club.name)+"（"+lg.name+"・格★"+club.grade+"）")
    +kv("期待順位",S.club.expect+"位")
    +kv("現在順位",r+"位（"+t.w+"勝"+t.d+"分"+t.l+"敗）")
    +kv("会長の評価",evalLabel(S.club.eval)+"（"+Math.round(S.club.eval)+"）")
    +kv("チーム熟練度",fmtNum(S.club.exp));

  renderTenureBar();
  renderTenureCalendar();

  // 参加中の大会。タップするとその大会の日程(順位表と結果の参照)へ。
  const played=Math.min(W.matchday-1,W.fixtures.length);
  $("seasonComps").innerHTML=
    '<div class="comp-card" data-comp="league">'
      +'<div class="cc-l"><div class="cc-k">LEAGUE</div>'
      +'<b>'+esc(lg.name)+'</b>'
      +'<div class="lg">'+r+'位 · 勝点'+pts(t)+'（'+played+'/'+W.fixtures.length+'節）</div></div>'
      +'<div class="cc-r">›</div></div>'
    +'<div class="comp-card off" data-comp="cup">'
      +'<div class="cc-l"><div class="cc-k">CUP</div>'
      +'<b>大陸大会</b>'
      +'<div class="lg">未開催（実装予定）</div></div>'
      +'<div class="cc-r">›</div></div>';
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
    const p=C.plan[n];
    if(p)rows.push('<div class="cal fut planned"><span class="cal-n num">'+n+'</span>'
      +'<span class="cal-b"><b>'+esc(p.label)+'</b>'
      +'<span class="lg">'+(p.comp==="cup"?"カップ戦":"リーグ戦")+'（予定確定）</span></span>'
      +'<span class="cal-r">▣</span></div>');
    else rows.push('<div class="cal none"><span class="cal-n num">'+n+'</span>'
      +'<span class="cal-b"><b>未定</b></span></div>');
  }

  $("seasonCal").innerHTML=rows.join("");
  wireCurrentRow();
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
  $("schedHead").textContent=lg.abbr+" "+lg.name.toUpperCase()+" · CLUB CHAMPIONSHIP";
  $("schedList").innerHTML=W.fixtures.map((round,i)=>{
    const m=round.find(x=>x.h===S.club.id||x.a===S.club.id);
    const md=i+1, done=md<W.matchday, next=md===W.matchday;
    const home=m.h===S.club.id, opp=home?m.a:m.h;
    return '<div class="cal'+(next?" next":"")+(done?" done":"")+'">'
      +'<span class="cal-n num">'+md+'</span>'
      +'<span class="cal-c" style="background:'+clubColor(opp)+'"></span>'
      +'<span class="cal-b"><b>'+esc(clubName(opp))+'</b>'
      +'<span class="lg">'+(home?"HOME":"AWAY")+'</span></span>'
      +(done?'<span class="cal-s num '+resClass(md)+'">'+scoreOf(md)+'</span>'
        :next?'<span class="cal-r next-lb">次戦</span>'
             :'<span class="cal-r">vs</span>')
      +'</div>';
  }).join("");

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
  const h=handById(e.hand);
  const cls=e.res==="win"?"w":e.res==="draw"?"d":"l";
  const mark=e.res==="win"?"○":e.res==="draw"?"△":"●";
  return '<div class="cal done">'
    +'<span class="cal-n num">'+e.node+'</span>'
    +'<span class="cal-h" title="'+(h?h.label:"")+'">'+(h?h.icon:"—")+'</span>'
    +'<span class="cal-b"><b>'+esc(clubName(e.opp))+'</b>'
    +'<span class="lg">S'+e.season+' 第'+e.md+'節 ／ '+(e.home?"HOME":"AWAY")+'</span></span>'
    +'<span class="cal-s num '+cls+'">'+mark+' '+e.gf+'-'+e.ga+'</span></div>';
}

/**
 * 現在節のカード。1節は「打ち手を選ぶ → どの大会に出るかを選ぶ → 試合」の順で決める。
 * リーグの日程は節に固定されていないので、リーグを選んだ節に次の1試合を消化する。
 */
function currentRow(){
  const C=S.career, avail=compsAvailable();
  const planned=C.plan[C.node];
  const f=myFixture();
  const comp=C.comp||(avail.length===1?avail[0]:null);

  let target="";
  if(comp==="league"&&f)
    target='<div class="cal-target"><span class="cal-c" style="background:'+clubColor(f.opp)+'"></span>'
      +'<span class="cal-b"><b>'+esc(clubName(f.opp))+'</b>'
      +'<span class="lg">リーグ 第'+S.world.matchday+'節 ／ '+(f.home?"HOME":"AWAY")+'</span></span></div>';
  else if(comp==="cup")
    target='<div class="cal-target"><span class="cal-b"><b>'+esc(planned?planned.label:"カップ戦")+'</b>'
      +'<span class="lg">カップ戦</span></span></div>';

  return '<div class="cal cur" id="calCur">'
    +'<div class="cal-cur-h"><span class="cal-n num">'+C.node+'</span>'
    +'<span class="cal-b"><b>この節にすること</b>'
    +(planned?'<span class="lg">予定が確定しています</span>':'<span class="lg">打ち手 → 出場する大会</span>')+'</span></div>'
    // ① 打ち手
    +'<div class="step-k">① 打ち手</div>'
    +'<div class="hands">'+HANDS.map(h=>
      '<button class="hand'+(C.hand===h.id?" on":"")+'" data-hand="'+h.id+'">'
      +'<span class="hd-i">'+h.icon+'</span><span class="hd-l">'+h.label+'</span></button>').join("")+'</div>'
    +'<div class="lg hand-desc">'+(C.hand?esc(handById(C.hand).desc):"打ち手を選んでください")+'</div>'
    // ② 出場する大会
    +'<div class="step-k">② 出場する大会</div>'
    +'<div class="comps">'
      +'<button class="compbtn'+(comp==="league"?" on":"")+'" data-comp2="league"'
        +(avail.includes("league")?"":" disabled")+'>リーグ戦</button>'
      +'<button class="compbtn'+(comp==="cup"?" on":"")+'" data-comp2="cup"'
        +(avail.includes("cup")?"":" disabled")+'>カップ戦</button>'
    +'</div>'
    +(avail.includes("cup")?"":'<div class="lg hand-desc">カップ戦は未実装です（大陸大会は今後）</div>')
    +target
    +'<button class="btn" id="calGo"'+(C.hand&&comp?"":" disabled")+'>試合開始</button></div>';
}
function wireCurrentRow(){
  document.querySelectorAll("#scr-season [data-hand]").forEach(b=>{
    b.onclick=()=>{ pickHand(b.dataset.hand); save(); renderSeason(); scrollToCurrent(); };
  });
  document.querySelectorAll("#scr-season [data-comp2]").forEach(b=>{
    b.onclick=()=>{ if(pickComp(b.dataset.comp2)){ save(); renderSeason(); scrollToCurrent(); } };
  });
  const go=$("calGo");
  if(go)go.onclick=()=>{
    if(!S.career.hand){ toast("打ち手を選んでください"); return; }
    if(!S.career.comp&&!pickComp("league")){ toast("出場する大会を選んでください"); return; }
    startMatch();
  };
}
/** 現在節が画面に入るまでスクロールする(96節あるので必須)。 */
function scrollToCurrent(){
  const el=$("calCur"); if(!el)return;
  try{ el.scrollIntoView({block:"center"}); }catch(e){}
}

function renderCupSchedule(){
  $("schedHead").textContent="CONTINENTAL CUP · KNOCKOUT STAGE";
  $("schedList").innerHTML='<div class="stub"><b>大陸大会</b>'
    +'<span>各国の上位が集まるノックアウト方式。<br>まだ実装していません（→ docs/03 §3.8）</span></div>';
  $("schedStand").innerHTML="";
}
/** 任期カレンダーを開いたら現在節へ寄せる(96節あるので必須)。 */
SCREENS.season.after=()=>setTimeout(scrollToCurrent,30);
/** クラブごとの識別色(モックの丸いクラブカラーに相当)。
 *  ハッシュの剰余だと色相が固まって数色しか出ないので、CLUBS の並び順から
 *  黄金角(137.5°)で回して均等に散らす。 */
function clubColor(clubId){
  const i=CLUBS.findIndex(c=>c.id===clubId);
  return "oklch(0.58 0.14 "+((i*137.5+20)%360).toFixed(1)+")";
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
  const rows=standings(S.world.table);
  $("standTbl").innerHTML='<tr><th>#</th><th>CLUB</th><th>W</th><th>D</th><th>L</th><th>GF</th><th>GA</th><th>PTS</th></tr>'
    +rows.map(r=>'<tr'+(r.id===S.club.id?' class="me"':'')+'><td class="num">'+r.rank+'</td>'
      +'<td class="nm">'+esc(clubName(r.id))+'</td><td class="num">'+r.w+'</td><td class="num">'+r.d+'</td>'
      +'<td class="num">'+r.l+'</td><td class="num">'+r.gf+'</td><td class="num">'+r.ga+'</td>'
      +'<td class="num pt">'+r.pts+'</td></tr>').join("");
}

// ---------- CLUB(クラブハウス) ----------
function renderClubhouse(){
  $("clubMgrName").textContent=S.coach||"監督";
  $("clubFame").textContent=fmtNum(S.player.fame);
  $("clubTickets").textContent=S.player.tickets;
  const h=S.player.history;
  $("clubHistory").innerHTML=h.length?h.slice().reverse().map(x=>
    '<div class="kv"><span>S'+x.season+' '+esc(clubName(x.clubId))+'</span><b>'
    +(x.rank?x.rank+"位 ":"")+x.result+'</b></div>').join(""):'<div class="lg">まだ記録がありません</div>';
  const F={ training:"練習場", medical:"医療施設", stadium:"スタジアム", scouting:"スカウト網" };
  $("clubFac").innerHTML=Object.keys(F).map(k=>kv(F[k],"Lv."+S.club.fac[k])).join("")
    +'<div class="lg" style="margin-top:6px">投資は第4段で実装します。</div>';
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
    const col=clubColor(T.side==="H"?_M.fixture.h:_M.fixture.a);
    T.players.forEach((p,i)=>{
      const [x,y]=slotXY(p,T.side,true);   // 開始はキックオフ隊形
      // **点ではなく全身を出す**(→docs/06 §6.17)。絵にはクラブカラーが無いので、
      // 足元の影をチームカラーにして、どちらのチームかを影で見分ける。
      const art=artKeyOf(p.c);
      const src=art&&(window.ASSETS&&window.ASSETS.players||{})[art+"_stand"];
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

  for(const T of [_M.home,_M.away]){
    const mine=T.side===atkSide;                       // 攻めている側か
    const goalY=mFlip(T.side)?100-dispY(87,_mRestart):dispY(87,_mRestart); // 自陣ゴールの側
    // ブロックの中心(枠の平均)。ここを基準にボールへ寄せる
    const ps=T.players.map((p,i)=>({ p, i, xy:slotXY(p,T.side,_mRestart) }));
    const cy=ps.reduce((s,o)=>s+o.xy[1],0)/ps.length;
    const cx=ps.reduce((s,o)=>s+o.xy[0],0)/ps.length;

    for(const o of ps){
      const el=$("mSlots").querySelector('.mp[data-side="'+T.side+'"][data-ix="'+o.i+'"]');
      if(!el)continue;
      el.dataset.x=o.xy[0].toFixed(1); el.dataset.y=o.xy[1].toFixed(1);
      let [x,y]=o.xy;
      const r=o.p.role, w=followW(r);

      // ① ブロックがボールへ寄る(縦・横)。ラインごとに寄り方が違う
      y+=(by-cy)*P.followY*w;
      x+=(bx-cx)*P.followX*w;
      // ② 攻めている側は前へ出て広がる / 守っている側は下がって圧縮する
      const push=(mine?P.pushUp:-P.dropBack)*(goalY===87?-1:1);
      y+=push*(r==="GK"?0.2:r==="DF"?0.8:1);
      const comp=mine?P.stretch:P.compact;
      y+=(cy-y)*comp;
      // ③ **枠から離れすぎない**。上限を付けないと全員がボールに吸い寄せられ、
      //    陣形が消えて団子になる(実際にそうなった)
      x=o.xy[0]+clamp(x-o.xy[0],-P.maxDevX,P.maxDevX);
      y=o.xy[1]+clamp(y-o.xy[1],-P.maxDevY,P.maxDevY);
      // ④ ゆっくり揺れる(完全に止めない)
      const ph=+el.dataset.ph;
      x+=Math.sin(_mPhase+ph)*P.wander;
      y+=Math.cos(_mPhase*0.8+ph*1.7)*P.wander*0.7;
      // ⑤ GKはゴールラインに残り、ボールの左右にだけ追従する
      if(r==="GK"){ y=goalY+(by-goalY)*P.gkOut; x=50+(bx-50)*P.gkSide; }

      el.style.left=clamp(x,4,96)+"%";
      el.style.top=clamp(y,8,92)+"%";
    }
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
  const src=art&&(window.ASSETS&&window.ASSETS.players||{})[art+"_play"];
  const col=clubColor(side==="H"?_M.fixture.h:_M.fixture.a);
  return '<div class="cut-av" style="--kit:'+col+'">'
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
/** パス成功。左に出し手、右から受け手がスライドインする。 */
function cutPass(e,from,to){
  return cutShow('<div class="cut">'
    +'<div class="cut-hd">'+esc(e.label||"PASS")+'</div>'
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
function cutKick(){
  const f=(name,id,cls)=>'<div class="cut-fig '+cls+'">'
    +'<div class="cut-av" style="--kit:'+clubColor(id)+'"></div><b>'+esc(name)+'</b></div>';
  return cutShow('<div class="cut">'
    +'<div class="cut-hd">KICK OFF</div>'
    +'<div class="cut-row">'+f(_M.home.name,_M.fixture.h,"L")
      +'<div class="cut-vs">VS</div>'+f(_M.away.name,_M.fixture.a,"R")+'</div>'
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
}
/**
 * 試合結果(→docs/06 §6.20)。モックの構成に準拠:
 *   スコア → 勝敗 → MOM のカード → チームスタッツ → 選手採点 → 報酬 → 他会場
 * **集計はすべてエンジン側(matchStats / matchRatings)**。ここは並べるだけ。
 */
function renderResult(){
  const o=_lastResult; if(!o||!o.my){ show("home"); return; }
  const m=o.my, M=o.M;
  $("resultHead").textContent="FULL TIME";
  $("rsScore").innerHTML='<b>'+esc(clubName(S.club.id))+'</b>'
    +'<span class="num">'+m.gf+' - '+m.ga+'</span>'
    +'<b>'+esc(clubName(m.opp))+'</b>';
  $("rsVerdict").textContent=m.win?"勝利":m.draw?"引き分け":"敗戦";
  $("rsReward").innerHTML='<span>+'+fmtNum(m.win?TUNING.reward.win:m.draw?TUNING.reward.draw:TUNING.reward.lose)
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

/** シーズン終了 → 審判 → 続投 or 解任 → 次の就任先へ。
 *  任期が上限に達していれば、ここで延命 or キャリア終了も決まる(→§3.2.3)。 */
async function finishSeason(){
  const expect=S.club.expect;
  const j=judgeSeason();
  S.world.season++;
  await save();
  toast(j.rank+"位（期待"+expect+"位）／名声 "+(j.fameGain>=0?"+":"")+j.fameGain);
  if(j.tenure&&j.tenure.extended){
    toast("好成績により任期が延長されました（上限 "+j.tenure.limit+" 節）");
  }
  if(S.career.over){ show("career"); return; }
  show("offer",{push:1});
}
/** 任期終了 = キャリア1周の終わり。積み上げたものを見せて次の周へ送り出す。 */
function renderCareerEnd(){
  const C=S.career, h=S.player.history;
  const w=C.log.filter(e=>e.res==="win").length;
  const d=C.log.filter(e=>e.res==="draw").length;
  const l=C.log.filter(e=>e.res==="lose").length;
  $("endBody").innerHTML=
    '<div class="end-t">任期満了</div>'
    +'<div class="lg" style="margin-bottom:14px">'+esc(S.coach||"監督")+' のキャリアが幕を閉じました。</div>'
    +kv("戦った節",C.log.length+" 節")
    +kv("通算成績",w+"勝 "+d+"分 "+l+"敗")
    +kv("渡り歩いたクラブ",new Set(h.map(x=>x.clubId)).size+" クラブ")
    +kv("最終的な名声",fmtNum(S.player.fame))
    +kv("集めたカード",S.player.coll.length+" 枚")
    +'<div class="sect-t" style="margin-top:14px">CAREER</div>'
    +h.map(x=>'<div class="kv"><span>S'+x.season+' '+esc(clubName(x.clubId))+'</span><b>'
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
      +'<div class="lg">'+lg.name+' ／ 国内'+c.rank+'位相当 ／ 格★'+c.grade+'</div></div>'
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
  $("ctLeague").textContent=c?leagueById(c.league).name:"—";
  $("ctGrade").textContent=c?"★"+c.grade+"（国内"+c.rank+"位相当）":"—";
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
// 外側のどこかを触ったら閉じる(閉じるボタンを探さなくてよいように)
document.addEventListener("click",e=>{
  if(!helpOpen())return;
  if(e.target.closest&&(e.target.closest("#helpDrawer")||e.target.closest("#helpTab")))return;
  closeHelp();
});
$("btnGallery").onclick=()=>show("gallery",{push:1});
$("mPlay").onclick=()=>{
  _mPaused=!_mPaused;
  $("mPlay").textContent=_mPaused?"▶ 再生":"⏸ 一時停止";
  if(!_mPaused)mTick();
};
$("mSpeed").onclick=()=>{
  const sp=TUNING.ui.speeds;
  _mSpeed=sp[(sp.indexOf(_mSpeed)+1)%sp.length];
  $("mSpeed").textContent="×"+_mSpeed;
};
$("mSkip").onclick=mSkip;
$("mDone").onclick=doMatchday;
$("btnNewCareer").onclick=async()=>{
  if(!confirm("新しいキャリアを始めます。よろしいですか?"))return;
  await newGame(); _pickedClub=null; show("offer");
};
