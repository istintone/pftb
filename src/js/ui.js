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
    +'<div class="pc-art">'+playerArt(c)+'</div>'
    +sparks(c)   // 粒子はカード面全体に散らす(絵の中に閉じ込めない)
    +'<div class="pc-stats">'+STAT_KEYS.map(k=>
      '<div'+(c[k]>=STAT_MAX?' class="mx"':'')+'><span>'+STAT_LABEL[k]+'</span>'
      +'<b>'+c[k]+'</b></div>').join("")+'</div>'
    +'<div class="pc-name">'
      +'<b>'+(own?'<i class="own">★</i>':'')+esc(shortName(c))+'</b>'
      +'<span>'+primarySub(c)+(c.subs.length>1?" +"+(c.subs.length-1):"")
      +' · '+esc(c.club||"—")+'</span>'
    +'</div>';
}
/**
 * 選手のイラスト。カードでは**プレイ絵(play)**を使う(→player-art-prompt.md)。
 * 画像を持たないカード(自動生成の選手)はプレースホルダのままにする。
 */
function playerArt(c,kind){
  const src=c.art&&(window.ASSETS&&window.ASSETS.players||{})[c.art+"_"+(kind||"play")];
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
let _slotIx=-1;      // いま編集している枠

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
  const slots=FORMATIONS[S.form], sub=slots[ix][0];
  _slotIx=ix;
  const cur=cardById(S.squad[ix]);
  const list=availableCards().slice()
    .sort((a,b)=>slotFit(b,sub)*b.ovr-slotFit(a,sub)*a.ovr);

  $("slotModalBody").innerHTML=
    '<button class="close-btn" id="slotClose" aria-label="閉じる">×</button>'
    +'<h3>'+sub+' の枠</h3>'
    +'<div class="lg" style="margin-bottom:10px">適性の高い順に並んでいます。'
      +(cur?'　いまは <b>'+esc(shortName(cur))+'</b>':'　いまは空きです')+'</div>'
    +(cur?'<button class="btn ghost" id="slotClear" style="margin-bottom:10px">'
        +'空きにする</button>':'')
    +'<div class="picks">'+list.map(c=>{
        const at=S.squad.indexOf(c.id);          // 既に入っている枠(-1 なら控え)
        return '<div class="pick'+(c.id===S.squad[ix]?" on":"")+'" data-pick="'+c.id+'">'
          // 左端の「›」だけは**入れ替えずに詳細を開く**。行そのものは入れ替え。
          +'<button class="pk-i" data-info="'+c.id+'" aria-label="詳細">›</button>'
          +'<div class="pk-ovr'+effClass(c,sub)+'">'+effOvr(c,sub)+'</div>'
          +'<div class="pk-b"><b>'+(isLoaned(c)?"":'<i class="own">★</i>')
            +esc(c.name)+'</b>'
            +'<span>'+c.subs.join(" / ")+'</span></div>'
          +'<div class="pk-r">'
            +(at>=0&&at!==ix?'<span class="pk-at">'+slots[at][0]+'</span>':'')+'</div>'
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


  // ベンチ(先発から溢れた控え)。横スクロールで並べる。
  const bench=cards.slice(TUNING.squad.starters,
    TUNING.squad.starters+TUNING.squad.bench).filter(Boolean);
  $("deckBench").innerHTML=bench.length
    // ベンチは枠に入っていないので掛ける適性が無い。ここだけ素のOVRを出す。
    ? bench.map(c=>'<div class="bn" data-card="'+c.id+'"'+kitStyle(c)+'>'
        +'<div class="bn-ovr">'+c.ovr+'</div>'
        +'<div class="bn-name">'+esc(shortName(c))+'</div>'
        +'<div class="bn-pos">'+primarySub(c)+'</div></div>').join("")
    : '<div class="none">控えはいません。カードを増やすとここに並びます。</div>';
  wireCardTiles($("deckBench"));

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
    doMatchday();
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
function doMatchday(){
  const out=playMatchday();
  _lastResult=out;
  save(); headUI(); show("result");
}
function renderResult(){
  const o=_lastResult; if(!o||!o.my){ show("home"); return; }
  const m=o.my;
  $("resultHead").textContent=m.win?"WIN":m.draw?"DRAW":"LOSE";
  $("resultBody").innerHTML=
    '<div class="score"><b>'+esc(clubName(S.club.id))+'</b>'
    +'<span class="num sc">'+m.gf+' - '+m.ga+'</span>'
    +'<b>'+esc(clubName(m.opp))+'</b></div>'
    +'<div class="lg" style="margin:10px 0">'+(m.home?"HOME":"AWAY")+'</div>'
    +kv("コイン",'+'+fmtNum(m.win?TUNING.reward.win:m.draw?TUNING.reward.draw:TUNING.reward.lose))
    +kv("チーム熟練度",'+'+(m.win?350:m.draw?220:150))
    +kv("現在順位",rankOf(S.world.table,S.club.id)+"位")
    +'<div class="sect-t" style="margin-top:14px">他会場</div>'
    +o.others.map(x=>'<div class="fx"><span class="nm">'+esc(clubName(x.h))+'</span>'
      +'<span class="num">'+x.hg+' - '+x.ag+'</span>'
      +'<span class="nm">'+esc(clubName(x.a))+'</span></div>').join("");
  $("btnResultOk").onclick=()=>show("home");
}

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
$("btnNewCareer").onclick=async()=>{
  if(!confirm("新しいキャリアを始めます。よろしいですか?"))return;
  await newGame(); _pickedClub=null; show("offer");
};
