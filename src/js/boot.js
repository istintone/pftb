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

// タイトルをタップしたときの入口。セーブがあれば続きから、無ければ就任契約書へ。
function setupTitle(exists){
  const t=document.getElementById("scr-title");
  document.getElementById("tFoot").textContent=exists?"タップして続きから":"© P-FOOTBALL";
  t.onclick=async()=>{
    t.onclick=null;                      // 二重起動を防ぐ
    try{
      if(exists){ await loadGame(); headUI(); show("home"); }
      else openContract();
    }catch(e){ showErr(e); t.onclick=null; openContract(); }
  };
}

(async()=>{
  try{
    headUI();
    setupTitle(await hasSave());
    window.__boot&&window.__boot("2/2: 起動完了!",true);
  }catch(e){
    showErr(e);
    try{ setupTitle(false); }catch(_){}
    window.__boot&&window.__boot("2/2: 起動完了(初期化に一部失敗)",true);
  }
})();
