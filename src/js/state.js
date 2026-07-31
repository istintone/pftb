// ================= 状態と保存 =================
// セーブ状態 S は「JSONで丸ごと保存できる素のオブジェクト」に保つ(関数やDOM参照を入れない)。
// スキーマを変えたら SAVE_VER を上げ、migrate() に旧版からの補完を書く。
const SAVE_KEY="pftb-save";
const SAVE_VER=1;

// 新規データ。キーを足しただけの変更なら SAVE_VER を上げなくても
// loadGame() の欠落補完が古いセーブを救う(→docs/02-data-model.md §2.3)。
function defaultState(){
  return {
    v:SAVE_VER,
    coach:"", teamName:"",   // 監督名 / クラブ名(就任契約書で記入)
    coins:0, tickets:0,      // コイン(クラブ予算) / チケット(報酬券)
    fame:0,                  // 名声。クラブを移っても失われない監督個人の資産
    season:1, matchday:1,    // 任期の進行(1シーズン=12節)
  };
}
let S=defaultState();

// --- 永続化 ---
// 通常のブラウザ/GitHub Pages では localStorage。ホスト側が window.storage(非同期)を
// 提供する環境ではそちらを優先し、応答が無い場合もタイムアウトで起動を続行する。
async function readSave(){ // 保存済みJSON文字列(無ければnull)
  if(typeof window!=="undefined"&&window.storage){
    try{ const r=await withTimeout(window.storage.get(SAVE_KEY),3000); return (r&&r.value)||null; }catch(e){ return null; }
  }
  try{ return localStorage.getItem(SAVE_KEY); }catch(e){ return null; }
}
async function _writeRaw(v){ // 生JSON文字列を書き込む(インポート用)
  if(typeof window!=="undefined"&&window.storage){
    try{ await withTimeout(window.storage.set(SAVE_KEY,v),2500); }catch(e){}
    return;
  }
  try{ localStorage.setItem(SAVE_KEY,v); }catch(e){}
}
async function _writeSave(){ _saveDirty=false; await _writeRaw(JSON.stringify(S)); }

let _saveTimer=null,_saveDirty=false;
// 保存はデバウンス: 連続した save() を1回の書き込みにまとめる。
// 取りこぼし防止に、画面非表示/離脱時は必ずフラッシュする。即時resolveなので await save() でも使える。
function save(){
  _saveDirty=true;
  if(!_saveTimer){
    _saveTimer=setTimeout(()=>{_saveTimer=null;if(_saveDirty)_writeSave();},600);
    if(_saveTimer&&_saveTimer.unref)_saveTimer.unref(); // node(テスト)でプロセスを引き止めない
  }
  return Promise.resolve();
}
function flushSave(){ if(_saveTimer){clearTimeout(_saveTimer);_saveTimer=null;} if(_saveDirty)return _writeSave(); }
if(typeof window!=="undefined"&&window.addEventListener){
  if(typeof document!=="undefined"&&document.addEventListener)
    document.addEventListener("visibilitychange",()=>{ if(document.hidden)flushSave(); });
  window.addEventListener("pagehide",flushSave);
  window.addEventListener("beforeunload",flushSave);
}
async function hasSave(){ return !!(await readSave()); }
function deleteSave(){
  _saveDirty=false; if(_saveTimer){clearTimeout(_saveTimer);_saveTimer=null;} // 保留中の保存を破棄(削除後に復活させない)
  if(typeof window!=="undefined"&&window.storage){ try{ window.storage.set(SAVE_KEY,""); }catch(e){} }
  try{ localStorage.removeItem(SAVE_KEY); }catch(e){}
}

// --- 移行/バックアップ ---
// 端末・URL間の引っ越し用。エクスポートは保留中の保存をフラッシュしてから現在のSを返す。
async function exportSave(){ await flushSave(); return JSON.stringify(S); }
async function importSave(text){
  let obj;
  try{ obj=JSON.parse(String(text||"").trim()); }catch(e){ throw new Error("JSONとして読み取れません(コピー漏れの可能性)"); }
  if(!obj||typeof obj!=="object"||Array.isArray(obj)) throw new Error("セーブデータの形式ではありません");
  if(typeof obj.v!=="number") throw new Error(GAME.title+"のセーブではないようです(vが無い)");
  await _writeRaw(JSON.stringify(obj)); // 検証済みをそのまま保存(次回のloadGameで補完/移行)
  return true;
}

// 旧スキーマからの補完。SAVE_VER を上げたときに if(S.v<N){...} を積み増す。
function migrate(){
  S.v=SAVE_VER;
}

function applyDefaults(){ S=defaultState(); }              // 新規データ
async function newGame(){ applyDefaults(); await save(); } // はじめから(上書き確認は呼び出し側)
async function loadGame(){                                 // つづきから(セーブが無ければ新規)
  const v=await readSave();
  if(!v){ applyDefaults(); await save(); return; }
  try{ S=JSON.parse(v); }catch(e){ applyDefaults(); await save(); return; }
  if(S.v<SAVE_VER){ migrate(); await save(); }
  // 版に依らない欠落補完(古いセーブに新フィールドを足したときの保険)
  const d=defaultState();
  for(const k in d) if(S[k]===undefined) S[k]=d[k];
}
