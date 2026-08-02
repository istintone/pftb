// ================= 状態と保存 =================
// セーブ状態 S は「JSONで丸ごと保存できる素のオブジェクト」に保つ(関数やDOM参照を入れない)。
// スキーマを変えたら SAVE_VER を上げ、migrate() に旧版からの補完を書く。
const SAVE_KEY="pftb-save";
const SAVE_VER=4;

// 新規データ。
// **所有の境界を構造で表す**(→docs/03-game-design.md §3.2)。
//   player … プレイヤー(監督)の恒久資産。クラブを移っても持ち越す
//   club   … 契約中のクラブのもの。退任すると丸ごと捨てる
//   world  … 世界の状態(シード・シーズン・順位表・日程)
// この分け方のおかげで、退任処理は「S.club を作り直すだけ」で済む。
function defaultState(){
  return {
    v:SAVE_VER,
    coach:"",                       // 監督名(就任契約書で記入)
    form:DEFAULT_FORM,              // 使用フォーメーション
    player:{
      fame:0,                       // 名声 = 次にどのクラブへ行けるか(→§3.9)
      tickets:0,                    // チケット(報酬券)。コインを使わずパックを引ける
      coll:[],                      // 集めた選手カード = プレイヤーの資産(→§3.2.2)
      tactics:[],                   // 習得した采配(→§3.7)
      trophies:[],                  // 獲得トロフィー(→§3.9)
      history:[],                   // キャリアの軌跡 [{season,clubId,rank,result}]
    },
    club:null,                      // 就任するまで null(→startTenure で作る)
    world:{ seed:0, season:1, matchday:1, table:{}, fixtures:[], results:{} },
    squad:[],                       // 編成(11枠。カードIDまたは null)
    // 任期 = キャリア1周(→docs/03 §3.2.3)。シーズンとは切り離し、節で通算する。
    career:{
      node:1,                       // 通算の節(1..limit)
      limit:TUNING.tenure.limit,    // 現在の上限(延命で伸びる)
      closing:false,                // 上限に達した = 新規大会へエントリーしない
      over:false,                   // 任期終了(キャリア1周の終わり)
      hand:null,                    // 今節の打ち手(選ぶまで試合に進めない)
      comp:null,                    // 今節に出る大会("league" / "cup")
      // 先に決まっている予定。node番号 → {comp,label}。
      // カップの連戦のように「この節はこの大会」と先に埋まるケースをここで表す。
      // 埋まっていない節は「未定」の枠として表示する(→docs/03 §3.2.3)。
      plan:{},
      log:[],                       // 消化した節の記録(カレンダーの過去行になる)
    },
  };
}

/**
 * 編成を単体で持ち出せる形にする(将来の非同期対戦の前提 → §3.2.2)。
 * 相手の環境にはこちらのセーブが無いので、**カードの実体ごと**書き出す。
 */
function exportSquad(){
  return {
    coach:S.coach, club:S.club?clubById(S.club.id).name:"",
    form:S.form, cards:squadCards().filter(Boolean),
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
  // v1 → v2: 平置きだった項目を player / club / world に分けた。
  // v1 には就任という概念が無くコレクションも無いので、監督名だけ引き継いで作り直す。
  if(S.v<2){
    const coach=S.coach||"";
    S=defaultState();
    S.coach=coach;
  }
  // v2 → v3: 任期(キャリア1周=96節)を導入した。v2 には通算節の概念が無く、
  // 途中から数え始めると任期の意味が壊れるので、進行中のキャリアは作り直す。
  if(S.v<3){
    const coach=S.coach||"";
    S=defaultState();
    S.coach=coach;
  }
  // v3 → v4: 架空の4カ国を**実在の6リーグ + 実在の16国籍**に作り替えた
  // (→docs/03 §3.8 / §3.15)。旧クラブID("nordia-8"等)も旧国籍("garia"等)も存在しない。
  //
  //   ・**手持ちカードは残す**。プレイヤーの資産なので捨てない(→§3.2.2)。
  //     国籍だけ、旧4カ国 → 近い実在国籍へ読み替える。
  //   ・クラブは消滅するので任期を畳み、就任先の選択からやり直してもらう。
  //     借りていた選手はもともと退任時に返すものなので、ここで手放しても筋は通る。
  if(S.v<4){
    const NAT={ garia:"fra", iberia:"esp", estra:"cro", nordia:"den" };
    const fix=c=>{ if(c&&NAT[c.nation])c.nation=NAT[c.nation]; return c; };
    const keep={
      coach:S.coach||"",
      player:S.player?{ ...S.player, coll:(S.player.coll||[]).map(fix) }:null,
    };
    S=defaultState();
    S.coach=keep.coach;
    if(keep.player)S.player=keep.player;
    // 世界とクラブは作り直し。名声は残るので、届く範囲のクラブから選び直せる。
    S.world.seed=(Date.now()^Math.floor(Math.random()*0xffffffff))>>>0;
  }
  S.v=SAVE_VER;
}

function applyDefaults(){ S=defaultState(); }              // 新規データ
// はじめから。世界のシードをここで固定する(以後クラブの顔ぶれは毎回同じになる)。
async function newGame(){
  applyDefaults();
  S.world.seed=(Date.now()^Math.floor(Math.random()*0xffffffff))>>>0;
  uid=1;
  await save();
}
async function loadGame(){                                 // つづきから(セーブが無ければ新規)
  const v=await readSave();
  if(!v){ applyDefaults(); await save(); return; }
  try{ S=JSON.parse(v); }catch(e){ applyDefaults(); await save(); return; }
  if(S.v<SAVE_VER){ migrate(); await save(); }
  // 版に依らない欠落補完(古いセーブに新フィールドを足したときの保険)。
  // player / world は入れ子なので、その中のキーまで補う。
  const d=defaultState();
  for(const k in d) if(S[k]===undefined) S[k]=d[k];
  for(const k in d.player) if(S.player[k]===undefined) S.player[k]=d.player[k];
  for(const k in d.world)  if(S.world[k]===undefined)  S.world[k]=d.world[k];
  for(const k in d.career) if(S.career[k]===undefined) S.career[k]=d.career[k];
  if(!S.world.seed) S.world.seed=(Date.now()&0xffffffff)>>>0;
  // カードIDが衝突しないよう、既存の最大IDの次から再開する
  const ids=S.player.coll.map(c=>c.id).concat((S.club&&S.club.loan||[]).map(c=>c.id));
  uid=Math.max(1,...ids.filter(n=>n<1000000))+1;
}
