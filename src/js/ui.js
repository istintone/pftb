// ================= 画面と共通UI =================
// 画面は #scr-<id> の要素を .on で1つだけ表示する方式。増やすときは
// index.html に <div id="scr-xxx" class="screen"> を足し、SCREENS に描画関数を登録する。

const $=id=>document.getElementById(id);

// 画面ID → 表示時に呼ぶ描画関数。画面を追加したらここに1行足す。
const SCREENS={ home:()=>renderHome(), team:()=>renderTeam() };

function show(id){
  document.querySelectorAll(".screen").forEach(el=>el.classList.remove("on"));
  const el=$("scr-"+id); if(el)el.classList.add("on");
  document.body.classList.toggle("on-title",id==="title");
  document.querySelectorAll(".tabs button").forEach(b=>b.classList.toggle("on",b.dataset.s===id));
  const f=SCREENS[id]; if(f)f();
}

let _toastTimer=null;
function toast(msg){
  const t=$("toast"); if(!t)return;
  t.textContent=msg; t.style.display="block";
  if(_toastTimer)clearTimeout(_toastTimer);
  _toastTimer=setTimeout(()=>{t.style.display="none";},2600);
}

function coinUI(){
  $("coinN").textContent=S.coins;
  $("ahTeam").textContent=S.teamName||"マイクラブ";
  $("ahOwner").textContent="👤 "+(S.coach||"監督");
}

// --- 各画面の描画(中身は仕様確定後に実装。今は土台の動作確認用) ---
function renderHome(){
  $("homeBody").innerHTML=
    '<div class="card"><b>試合</b><div class="lg">未実装 — ここに対戦相手の一覧と試合開始を置く。</div></div>';
}
function renderTeam(){
  $("teamBody").innerHTML=
    '<div class="card"><b>編成</b><div class="lg">未実装 — ここにフォーメーションと選手配置を置く。</div></div>';
}

// --- クラブ設立モーダル(監督名/クラブ名の入力) ---
function openProfile(isNew){
  $("pfTeam").value=S.teamName||"";
  $("pfCoach").value=S.coach||"";
  $("profileModal").classList.add("on");
  $("pfSave").onclick=async()=>{
    const tn=($("pfTeam").value||"").trim(), cn=($("pfCoach").value||"").trim();
    if(!tn||!cn){ toast("クラブ名と監督名を入力してください"); return; }
    if(isNew)await newGame();
    S.teamName=tn; S.coach=cn; await save();
    $("profileModal").classList.remove("on");
    coinUI(); show("home");
  };
}

// --- 配線(結合時に一度だけ実行される) ---
document.querySelectorAll(".tabs button").forEach(b=>{ b.onclick=()=>show(b.dataset.s); });
$("profileClose").onclick=()=>$("profileModal").classList.remove("on");
