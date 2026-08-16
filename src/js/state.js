// ================= 状態と保存 =================
// セーブ状態 S は「JSONで丸ごと保存できる素のオブジェクト」に保つ(関数やDOM参照を入れない)。
// スキーマを変えたら SAVE_VER を上げ、migrate() に旧版からの補完を書く。
const SAVE_KEY="pftb-save";
const SAVE_VER=30;

// 新規データ。
// **所有の境界を構造で表す**(→docs/03-game-design.md §3.2)。
//   player … プレイヤー(監督)の恒久資産。クラブを移っても持ち越す
//   club   … 契約中のクラブのもの。退任すると丸ごと捨てる
//   world  … 世界の状態(シード・シーズン・順位表・日程)
// この分け方のおかげで、退任処理は「S.club を作り直すだけ」で済む。
function defaultState(){
  return {
    v:SAVE_VER,
    // 選んでいる特別采配(→docs/03 §3.50)。指示(S.order)と同じ並び
    tactic:null,
    coach:"",                       // 監督名(就任契約書で記入)
    // 監督の顔(→docs/03 §3.45)。就任契約書で選ぶ。src/assets/manager の名前が入る。
    // 空なら監督名から決まる(古いセーブと、選ばずに進んだ場合の受け皿)
    face:"",
    form:DEFAULT_FORM,              // 使用フォーメーション
    player:{
      fame:0,                       // 名声 = 次にどのクラブへ行けるか(→§3.9)
      // 引換券(→docs/03 §3.42)。{ "<種類>": 枚数 }。コインを使わずに引ける
      tickets:{},
      // 秘書からの連絡(→docs/03 §3.42)。**溜まっていく**。クラブチャットとは別物
      // [{ id, at, read, got }] … at=届いた節 / got=受け取り済み
      mail:[],
      // 見たもの・やったこと(→docs/03 §3.43)。チュートリアルの進み具合はこれで決まる。
      // **キャリアで1つ**。任期をまたいでも消えない(二度目の就任で案内は出ない)
      seen:{},
      coll:[],                      // 集めた選手カード = プレイヤーの資産(→§3.2.2)
      // 習得した采配(→docs/03 §3.50)。**キャリアに残る**(移籍しても消えない)。
      // ダイレクトプレーだけは最初から。監督なら誰でも知っている手なので
      tactics:["direct"],
      trophies:[],                  // 獲得トロフィー(→§3.9)
      // 師弟の持ち越し(→docs/03 §3.39)。任期が明けるときに作られ、
      // **次の就任で1度だけ**使われて消える。{ cards, train, bond, gold }
      legacy:null,
      history:[],                   // キャリアの軌跡 [{season,clubId,rank,result}]
    },
    club:null,                      // 就任するまで null(→startTenure で作る)
    // div/divs = いま戦っている部と、リーグ3部の所属(→docs/03 §3.24)。
    // 昇降格で動くので**決定的に作り直せない唯一の世界情報**。就任時に作る。
    world:{ seed:0, season:1, matchday:1, table:{}, fixtures:[], results:{},
            div:3, divs:null },
    squad:[],                       // 編成(11枠。カードIDまたは null)
    // セットプレーの担当(→docs/06 §6.15)。カードID。null なら能力で自動選出。
    kickers:{ pk:null, fk:null, ck:null },
    // キャプテン(→docs/03 §3.20)。カードID。null なら能力と年齢で自動選出。
    captain:null,
    // 采配(→docs/03 §3.28)。ORDERS の id。**同時に効くのは1つだけ**。
    // 試合をまたいで持ち越す(監督の構え)。試合中はいつでも変えられる。
    order:null,
    // 任期 = キャリア1周(→docs/03 §3.2.3)。シーズンとは切り離し、節で通算する。
    career:{
      node:1,                       // 通算の節(1..limit)
      limit:TUNING.tenure.limit,    // 現在の上限(延命で伸びる)
      closing:false,                // 上限に達した = 新規大会へエントリーしない
      over:false,                   // 任期終了(キャリア1周の終わり)
      // オーナーのイベント(→docs/03 §3.9)。**どちらも一度きり**。
      //   opened     … 就任直後の開幕イベント(目標順位を告げられた)
      //   tenureDone … 第80節の去就イベント(契約が伸びたか、当初のままか)
      opened:false,
      tenureDone:false,
      hand:null,                  // 今節の打ち手(選ぶまで試合に進めない)
      // キープレイヤー(→docs/03 §3.44)。**その試合のあいだだけ**の指名。
      // 節が変われば消える(hand と同じ扱い)
      kp:null,
      // 済ませたトレードの節目(→docs/03 §3.49)。断った場合もここに入る
      tradeDone:[],
      // 移籍市場で買い取った枠(→docs/03 §3.53)。{ "mk<節>-<枠>": 1 }。
      // **節が変われば市場は総入れ替え**なので、鍵は節をまたいで意味を持たない
      market:{},
      // クラブチャット(→docs/03 §3.29)。**節ごとに畳む**ので、節が進めば消える。
      // { log:[{w,t}], i:段の位置, step:入力待ちの段, sel:{選んだもの} }
      chat:null,
      // 訓練の成果(→docs/03 §3.30)。**任期のあいだだけ**。career ごと畳まれるので、
      // 次の任期では自動で消える。{ "<カードID>": { exp:{atk..}, up:{atk..}, star:0 } }
      train:{},
      // 連携(→docs/03 §3.31)。{ "<小さいID>:<大きいID>": 値 }。
      // **編成から外れた選手の分は捨てる**ので、いま組んでいる16人ぶんだけが残る。
      bond:{},
      // 覚醒した組(→docs/03 §3.31)。{ "<小さいID>:<大きいID>": true }。
      // **黄金線**になり、パスの倍率が1段上がる。連携と同じく任期が明ければ消える。
      bondGold:{},
      // 信頼(→docs/03 §3.39)。{ "<カードID>": 値 }。**任期のあいだだけ**積む。
      // 師弟を結んだ選手だけが、任期をまたいで成果を持ち越す。
      trust:{},
      mentor:[],                    // 師弟を結んだカードID(上限 TUNING.trust.max)
      mentorSeen:{},                // 相談が起きた選手(結果によらず二度目は無い)
      streak:0,                     // 連勝数(→§3.40 スポンサーの課題)
      // コンディション(→docs/03 §3.32)。{ "<カードID>": 0..4 }。
      // **無ければ2(普通)**。任期の頭は全員が普通から始まる。
      cond:{},
      // 治療中(→docs/03 §3.32)。{ "<カードID>": 残りの節数 }。
      // 節が進むたびに減り、0になると普通へ戻る。休息でも治せる。
      hurt:{},
      comp:null,                    // 今節に出る大会("league" / "cup")
      // 先に決まっている予定。node番号 → {comp,label}。
      // カップの連戦のように「この節はこの大会」と先に埋まるケースをここで表す。
      // 埋まっていない節は「未定」の枠として表示する(→docs/03 §3.2.3)。
      plan:{},
      // 参加中のカップ(→docs/03 §3.23)。大会が完了するまで持ち続ける。
      // { id, node0, round, alive, out, champ, done }
      cup:null,
      // 大会を終えてから次に出られるようになる節(→docs/03 §3.23)。
      // これが無いと、8種の開催日が任期の大半を覆ってリーグが回らない
      cupRest:0,
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
  // v4 → v5: 編成を先発11から**先発11 + 控え5 = 16枠**にした(→docs/03 §3.17)。
  // 交代を扱うために控えを常設する。既存の編成はそのまま活かし、控えだけ足す。
  if(S.v<5&&S.club){
    const N=TUNING.squad.starters;
    const xi=(S.squad||[]).slice(0,N);
    while(xi.length<N)xi.push(null);
    const used=new Set(xi.filter(Boolean));
    S.squad=xi.concat(pickBench(availableCards().filter(c=>!used.has(c.id))));
  }
  // v5 → v6: セットプレーの担当指名を足した(→docs/07 §7.11)。
  // 未指名は「能力で自動選出」と同じ意味なので、空で足すだけでよい。
  if(S.v<6&&!S.kickers)S.kickers={ pk:null, fk:null, ck:null };
  // v6 → v7: キャプテンを足した(→docs/03 §3.20)。未指名は自動選出と同じ。
  if(S.v<7&&S.captain===undefined)S.captain=null;
  // v7 → v8: カップ戦を足した(→docs/03 §3.23)。勝ち抜き中でない状態から始める。
  if(S.v<8&&S.career&&S.career.cup===undefined)S.career.cup=null;
  // v8 → v9: カップを「エントリーして大会ごと追う」形に作り替えた。
  // 途中の勝ち抜き状態は持ち越せないので畳む(次の開催節から入り直せる)。
  if(S.v<9&&S.career)S.career.cup=null;
  // v9 → v10: エントリー時に組み合わせ表を作るようにした。表の無い進行中の大会は
  // 相手を復元できないので畳む(次の開催節から入り直せる)。
  if(S.v<10&&S.career&&S.career.cup&&!S.career.cup.field)S.career.cup=null;
  // v10 → v11: リーグを3部制にした(→docs/03 §3.24)。クラブIDの割り当てが変わり、
  // 部の所属もセーブに持つようになったので、**進行中の任期は畳んで就任からやり直す**。
  // 集めたカード・名声・実績は監督のものなので残す。
  // v10 → v11: リーグを3部制にした(→docs/03 §3.24)。旧8クラブはそのまま DIV1 なので
  // 任期は畳まず、**部の所属だけ足す**。進行中の日程も DIV1 の顔ぶれのまま噛み合う。
  // v11 → v12: 能力の天井(20)に張り付かないよう OVR帯と重みを組み直した(→docs/03 §3.27)。
  // 手持ちカードは**段ごとに新しい帯へ写し直し**、能力を配り直す(OVRの相対関係は保つ)。
  if(S.v<12){
    const OLD_BANDS={ STD:[54,72], REG:[68,86], SPE:[82,98], WC:[96,110], LEG:[100,116] };
    const rescale=c=>{
      const o=OLD_BANDS[c.rarity], n=RARITY[c.rarity]&&RARITY[c.rarity].ovr;
      if(!o||!n||!c.pos)return c;
      // 帯の外(クラブ補正ぶん)も比率のまま持ち越す
      const ovr=clamp(Math.round(n[0]+(c.ovr-o[0])*((n[1]-n[0])/(o[1]-o[0]))),
        STAT_KEYS.length,OVR_MAX);
      const st=statsFor(mulberry32(hashStr("v12:"+c.id)>>>0),c.pos,ovr);
      STAT_KEYS.forEach(k=>c[k]=st[k]);
      c.ovr=calcOvr(c.pos,st);
      return c;
    };
    (S.player&&S.player.coll||[]).forEach(rescale);
    (S.club&&S.club.loan||[]).forEach(rescale);
  }
  if(S.v<11&&S.world){
    if(S.world.div===undefined)S.world.div=S.club?clubById(S.club.id).div:3;
    if(!S.world.divs)S.world.divs=S.club?makeDivs(clubById(S.club.id).league):null;
  }
  // v12 → v13: 采配を足した(→docs/03 §3.28)。未指定 = 指示なしと同じ。
  if(S.v<13&&S.order===undefined)S.order=null;
  // v28 → v29: 特別采配(→docs/03 §3.50)。**監督が覚えたものはキャリアに残る**
  if(S.v<29){
    if(!S.player.tactics||!S.player.tactics.length)S.player.tactics=["direct"];
    if(S.tactic===undefined)S.tactic=null;
  }
  // v13 → v14: 節の進行をクラブチャットに移した(→docs/03 §3.29)。
  // 途中の会話は持ち越せないので畳む(打ち手と大会の選択はそのまま残る)。
  if(S.v<14&&S.career&&S.career.chat===undefined)S.career.chat=null;
  // v14 → v15: 訓練の経験点を足した(→docs/03 §3.30)。空から始める。
  if(S.v<15&&S.career&&!S.career.train)S.career.train={};
  // v15 → v16: 連携を足した(→docs/03 §3.31)。空から始める。
  if(S.v<16&&S.career&&!S.career.bond)S.career.bond={};
  // v16 → v17: コンディションを足した(→docs/03 §3.32)。空 = 全員が普通。
  if(S.v<17&&S.career&&!S.career.cond)S.career.cond={};
  // v17 → v18: ケガの治療を足した(→docs/03 §3.32)。
  if(S.v<18&&S.career&&!S.career.hurt)S.career.hurt={};
  // v18 → v19: オーナーの評価を積み上げ式にし(→docs/03 §3.9)、
  // 開幕イベントと第80節の去就イベントを足した。
  // 途中のセーブに遡ってイベントを出すと話が繋がらないので、**済んだことにする**。
  if(S.v<19){
    S.career.opened=true;
    S.career.tenureDone=S.career.node>=TUNING.tenure.extendAt;
    if(S.club&&!S.club.evLog)S.club.evLog={};
  }
  // v19 → v20: 連携に覚醒を足した(→docs/03 §3.31)。既存の任期には黄金線を持たせない。
  if(S.v<20&&!S.career.bondGold)S.career.bondGold={};
  // v20 → v21: 連携のしきい値を約3倍に引き上げた(→docs/03 §3.31)。
  // **進行中の任期の線が細くならないよう、積み上げも3倍にする**。
  // 40/80/120 → 80/200/360 なので、×3 で段はほぼそのまま残る。
  if(S.v<21&&S.career&&S.career.bond)
    for(const k of Object.keys(S.career.bond))S.career.bond[k]*=3;
  // v21 → v22: 施設投資(→docs/03 §3.5)。建設中の1件を持つ。
  if(S.v<22&&S.club&&!S.club.build)S.club.build=null;
  // v22 → v23: 大会を8種に増やしたので、間をあける仕組みを足した(→docs/03 §3.23)
  if(S.v<23&&S.career&&S.career.cupRest==null)S.career.cupRest=0;
  // v23 → v24: 実績トロフィー(→docs/03 §3.36)。カップの初優勝しか無かったので、
  // 種別と回数を足す。**季は残っているので数え直さない**(初回の季が実績の意味)
  // v24 → v25: 信頼と師弟(→docs/03 §3.39)。任期をまたぐ持ち越しは player 側に置く
  if(S.v<25&&S.career){
    if(!S.career.trust)S.career.trust={};
    if(!S.career.mentor)S.career.mentor=[];
    if(!S.career.mentorSeen)S.career.mentorSeen={};
  }
  if(S.v<25&&S.player&&S.player.legacy===undefined)S.player.legacy=null;
  // v25 → v26: スポンサー(→docs/03 §3.40)
  // v26 → v27: 秘書からの連絡と引換券(→docs/03 §3.42)。
  // 券は数だけの数値だったが、種類ごとに持てるようにした(使い道が無かったので捨てる)
  if(S.v<27&&S.player){
    if(typeof S.player.tickets!=="object"||!S.player.tickets)S.player.tickets={};
    if(!S.player.mail)S.player.mail=[];
  }
  // v27 → v28: チュートリアル(→docs/03 §3.43)。**進み具合を持つ入れ物を足しただけ**。
  // 既存のセーブは案内が済んだ扱いにする(いまさら「まずはオーナーへ」とは言わない)
  if(S.v<28&&S.player){
    if(!S.player.seen)S.player.seen={};
    if(!S.player.mail)S.player.mail=[];
    for(const m of MAILS)if(m.tut&&!S.player.mail.some(x=>x.id===m.id))
      S.player.mail.push({ id:m.id, at:0, read:true, got:true });
  }
  // v29 → v30: 移籍市場(→docs/03 §3.53)。**買った枠の覚え書きを足しただけ**
  if(S.v<30&&S.career&&!S.career.market)S.career.market={};
  if(S.v<26){
    if(S.club&&S.club.sponsor===undefined)S.club.sponsor=null;
    if(S.career&&S.career.streak==null)S.career.streak=0;
  }
  if(S.v<24&&S.player&&S.player.trophies)
    for(const t of S.player.trophies){ if(!t.kind)t.kind="cup"; if(!t.n)t.n=1;
      if(!t.last)t.last=t.season; }
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
