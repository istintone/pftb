// ================= 画面と共通UI =================
// 画面は #scr-<id> を .on で1つだけ表示する。画面を増やすときは
//   1) index.html に <div id="scr-xxx" class="screen"> を足す
//   2) SCREENS に1エントリ足す(ヘッダー・タブ・戻るの出し方はここで決まる)
// の2手順で済むようにしてある。

const $=id=>document.getElementById(id);

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
  home:      { title:"HOME",      tab:"home",      chrome:"full", render:()=>renderHome() },
  cards:     { title:"CARDS",     tab:"cards",     chrome:"full" },
  deck:      { title:"DECK",      tab:"deck",      chrome:"full" },
  season:    { title:"SEASON",    tab:"season",    chrome:"full" },
  clubhouse: { title:"CLUB",      tab:"clubhouse", chrome:"full", render:()=>renderClubhouse() },
  schedule:  { title:"SCHEDULE",  under:"season",  chrome:"back" },
  league:    { title:"LEAGUE",    under:"season",  chrome:"back" },
  standings: { title:"STANDINGS", under:"season",  chrome:"back" },
  gacha:     { title:"SCOUT",     under:"home",    chrome:"back" },
  secretary: { title:"SECRETARY", under:"home",    chrome:"back" },
  match:     { title:"MATCH",     chrome:"bare" },
  result:    { title:"RESULT",    chrome:"bare" },
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

  if(def.render)def.render();
}
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
  const club=S.teamName||"マイクラブ";
  $("hdClubName").textContent=club;
  $("hdEmblem").textContent=(club.trim()[0]||"P").toUpperCase();
  $("hdCoin").textContent=fmtNum(S.coins);
}

// --- 各画面の描画(中身は段階的に実装する。今は骨格の同期のみ) ---
function renderHome(){
  $("homeSeason").textContent="SEASON "+S.season+" · MATCHDAY "+String(S.matchday).padStart(2,"0");
}
function renderClubhouse(){
  $("clubMgrName").textContent=S.coach||"監督";
  $("clubFame").textContent=fmtNum(S.fame);
}

// --- 就任契約書(監督名・クラブ名を記入して開始) ---
function openContract(){
  $("ctCoach").value=S.coach||"";
  $("ctClub").value=S.teamName||"";
  $("ctDate").textContent=todayLabel();
  show("contract");
}
async function signContract(){
  const coach=($("ctCoach").value||"").trim(), club=($("ctClub").value||"").trim();
  if(!coach||!club){ toast("監督名とクラブ名を記入してください"); return; }
  await newGame();
  S.coach=coach; S.teamName=club;
  await save();
  headUI(); show("home");
}

// --- 配線(結合時に一度だけ実行される) ---
document.querySelectorAll("#tabs button").forEach(b=>{ b.onclick=()=>show(b.dataset.s); });
$("hdBack").onclick=goBack;
$("ctSign").onclick=signContract;
$("btnSchedule").onclick=()=>show("schedule",{push:1});
$("btnLeague").onclick=()=>show("league",{push:1});
$("btnStandings").onclick=()=>show("standings",{push:1});
$("cardModalClose").onclick=()=>$("cardModal").classList.remove("on");
