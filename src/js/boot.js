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

// タイトルの入口。
//   セーブ無し … 画面のどこを押しても開始(TAP TO START)
//   セーブ有り … 「RETURN TO CAREER(再開)」と「NEW CAREER(最初から)」の選択
// 続きがあるのに誤タップで消えては困るので、セーブがある間は全画面タップを無効にする。
function setupTitle(exists){
  const t=document.getElementById("scr-title");
  // ステッカーの壁(→docs/06 §6.29)。**画面の大きさが決まってから**敷く
  const wall=document.getElementById("tWall");
  if(wall)wall.innerHTML=titleWall();
  const start=document.getElementById("tStart"), menu=document.getElementById("tMenu");
  start.style.display=exists?"none":"";
  menu.style.display=exists?"flex":"none";
  // **どのビルドを見ているか**が分かるように、版とセーブの形式を添える(→SPEC.md)
  document.getElementById("tFoot").textContent=
    "© P-FOOTBALL　v"+VERSION+" · save v"+SAVE_VER;

  const begin=async()=>{
    await newGame();                     // 世界のシードをここで固定する
    _pickedClub=null;
    show("offer");                       // 名声0 → 下位クラブだけが声をかけてくる
  };
  const resume=async()=>{
    await loadGame(); headUI(); applyBg();
    // **QRで配った合言葉**(→docs/03 §3.55)。URL に付いていればここで開く
    const got=memFromUrl();
    if(got){ await save(); toast("「"+got.name+"」が開きました"); }
    show(S.club?"home":"offer");         // 就任前で終わっていたら就任先選択から
  };
  const once=fn=>async()=>{              // 二重起動を防ぐ
    t.onclick=null; start.onclick=null;
    try{ await fn(); }catch(e){ showErr(e); }
  };

  t.onclick=exists?null:once(begin);
  document.getElementById("tResume").onclick=once(resume);
  document.getElementById("tNew").onclick=async()=>{
    if(!confirm("新しくキャリアを始めると、いまのセーブデータは消えます。よろしいですか?"))return;
    await once(begin)();
  };
}

(async()=>{
  try{
    headUI(); applyBg();
    setupTitle(await hasSave());
    window.__boot&&window.__boot("2/2: 起動完了!",true);
  }catch(e){
    showErr(e);
    try{ setupTitle(false); }catch(_){}
    window.__boot&&window.__boot("2/2: 起動完了(初期化に一部失敗)",true);
  }
})();
