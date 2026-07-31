// ================= 起動 =================
// 結合順の最後。ここだけが起動の副作用(即時実行)を持つ。
// テスト(src/tests/_setup.js)は boot.js を読み込まず、必要な関数を明示的に呼ぶ。
function showErr(m){
  try{
    const t=document.getElementById("toast");
    t.textContent="⚠ "+((m&&m.message)||m||"不明なエラー");
    t.style.display="block";
    setTimeout(()=>t.style.display="none",5000);
  }catch(e){}
}
window.addEventListener("error",ev=>showErr(ev.message));
window.addEventListener("unhandledrejection",ev=>showErr(ev.reason));

// タイトルの「つづきから/はじめから」を配線。セーブの有無でボタンの主従を入れ替える。
function setupTitleButtons(exists){
  const cont=document.getElementById("btnContinue"), nw=document.getElementById("btnNew");
  cont.style.display=exists?"":"none";
  nw.className=exists?"btn ghost":"btn tstart";
  cont.onclick=async()=>{ await loadGame(); coinUI(); show("home"); };
  nw.onclick=async()=>{
    if(await hasSave()&&!confirm("はじめからプレイすると、現在のセーブデータは消えます。よろしいですか?"))return;
    openProfile(true);
  };
}

document.body.classList.add("on-title"); // 起動時はタイトル表示=下部タブ非表示
(async()=>{
  try{
    coinUI();
    setupTitleButtons(await hasSave());
    window.__boot&&window.__boot("2/2: 起動完了!",true);
  }catch(e){
    showErr(e);
    try{ setupTitleButtons(false); }catch(_){}
    window.__boot&&window.__boot("2/2: 起動完了(初期化に一部失敗)",true);
  }
})();
