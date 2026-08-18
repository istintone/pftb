// 全テスト共通: モックDOM/localStorage/Image の設定 + src/js/*.js の結合読み込み。
// JS_FILES の並びは build.py の JS_FILES と同じにすること(変更したら両方更新)。
"use strict";
const fs = require("fs");
const path = require("path");

const SRC_DIR = path.join(__dirname, "..", "js");
const JS_FILES = ["data.js", "cards.js", "signatures.js", "world.js", "match-core.js", "emblem.js", "state.js", "ui.js"];
// boot.js は含めない(起動時の即時実行を避け、各テストが必要な関数を明示的に呼ぶ)

function mkEl() {
  const el = {
    textContent: "", innerHTML: "", value: "", className: "", style: {}, dataset: {},
    appendChild() {}, prepend() {}, remove() {}, click() {},
    setAttribute() {}, removeAttribute() {}, getAttribute: () => null,
    closest: () => null, focus() {}, blur() {},
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    querySelector: () => mkEl(), querySelectorAll: () => [mkEl(), mkEl()],
  };
  return el;
}
function mockCanvas() {
  const c = mkEl(); c.width = 0; c.height = 0;
  c.getContext = () => ({
    fillStyle: "", strokeStyle: "", font: "", textAlign: "", textBaseline: "",
    lineWidth: 1, globalAlpha: 1, imageSmoothingEnabled: false,
    fillRect(){}, strokeRect(){}, clearRect(){}, drawImage(){},
    fillText(){}, strokeText(){}, beginPath(){}, closePath(){},
    moveTo(){}, lineTo(){}, arc(){}, rect(){}, clip(){},
    fill(){}, stroke(){}, save(){}, restore(){},
    translate(){}, rotate(){}, scale(){},
    createLinearGradient(){ return { addColorStop(){} }; },
    createRadialGradient(){ return { addColorStop(){} }; },
  });
  return c;
}
function mockStorage() {
  const m = new Map();
  return {
    getItem: k => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: k => { m.delete(k); },
    clear: () => m.clear(),
  };
}

/**
 * テスト用にグローバル(document/window/localStorage/Image/setTimeout)をモックし、
 * src/js/*.js を結合したモジュールをrequireして返す。
 *
 * opts:
 *   timeoutDiv   setTimeoutの待ち時間を割る倍率(相対的な長短は保つ高速化)
 *   timeoutFlat  待ち時間を要求値に関わらず常にこのms固定にする(最速)
 *   storageHang  trueなら window.storage が永久に解決しない(ハング耐性テスト用)
 *   transform    (src:string)=>string  結合後ソースへの任意の文字列変換
 *   exports      module.exportsに追加するコード片(例:"show,toast")
 *   tmpName      一時ファイル名(既定:"_tmp_run.js")
 *
 * 戻り値Eには、テスト側のポーリング待ちで使う実時間sleep E._wait(ms) も生やしてある
 * (内部のsetTimeoutは倍率調整されるため、外側のループは実時間で待つ必要がある)。
 */
function setup(opts = {}) {
  const realTimeout = global.setTimeout;
  if (opts.timeoutFlat != null) {
    const flat = opts.timeoutFlat;
    global.setTimeout = (f) => realTimeout(f, flat);
  } else {
    const div = opts.timeoutDiv || 1;
    global.setTimeout = (f, ms) => realTimeout(f, Math.max(1, (ms || 0) / div));
  }

  global.localStorage = mockStorage();
  global.window = opts.storageHang
    ? { storage: { get: () => new Promise(() => {}), set: () => new Promise(() => {}) }, addEventListener(){} }
    : { addEventListener(){} };
  global.confirm = () => true;

  global.Image = class { constructor(){ this.complete = true; this.naturalWidth = 1; } set src(v){} decode(){ return Promise.resolve(); } };

  global.document = {
    getElementById: () => mkEl(), querySelector: () => mkEl(),
    querySelectorAll: () => [mkEl(), mkEl()],
    createElement: t => (t === "canvas" ? mockCanvas() : mkEl()),
    body: mkEl(), addEventListener(){},
  };

  let code = JS_FILES.map(f => fs.readFileSync(path.join(SRC_DIR, f), "utf8").trim()).join("\n\n");
  if (opts.transform) code = opts.transform(code);
  const extra = opts.exports ? "," + opts.exports : "";
  code += `\nmodule.exports={getS:()=>S,setS:v=>{S=v;},setM:v=>{_M=v;},newGame,loadGame,save,flushSave,hasSave,deleteSave,`
        + `exportSave,importSave,exportSquad,show,scOrder,mFlip,mMine,vigorOf,hypeOf,HYPE,goBack,toast,headUI,openContract,SCREENS,HELP,helpFor,SAVE_VER,`
        + `CLUBS,LEAGUES,DIVS,divName,careerDiv,divClubs,clubsOfDiv,rosterPlan,clubPlan,cupPlan,expandRarPlan,makeDivs,applyPromotion,startNextSeason,newTenure,requiredFame,offersFor,NATIONS,NATION_IDS,FAMILY,GIVEN_BY_NATION,makeName,leagueById,nationById,nationBox,TUNING,RARITY,RAR_KEYS,RAR_DROPS,FORMATIONS,DEFAULT_FORM,refitSquad,clubById,clubStar,goldWeb,embSvg,embDesign,embMonogram,embStars,EMB_SHAPES,EMB_FIELDS,EMB_CRESTS,EMB_HUES,embHueById,clubsOf,clubRoster,clubPower,makeFixtures,`
        + `standings,rankOf,expectedRank,requiredFame,offersFor,startTenure,playMatchday,beginMyMatch,myFixtureOf,matchSeedOf,seasonOver,`
        + `judgeSeason,myFixture,squadCards,autoSquad,availableCards,sellPrice,sellWhy,canSell,sellCard,sellCards,sellTotal,marketList,marketOf,marketPrice,marketWhy,marketBuy,marketSeed,cardById,squadPower,resolveMatch,simulateMatch,matchStats,matchRatings,matchRating,manOfTheMatch,minutesOf,playerOf,spKicker,pickCaptain,staminaOf,createMatch,stepMatch,finishMatch,orderMatch,matchOver,matchMin,matchClock,bestXI,bestFormFor,formFor,matchSide,teamStrength,midPower,`
        + `mulberry32,hashStr,calcOvr,ovrOf,upOf,makeCard,statsFor,applyBody,rollBody,bodyLabel,makeRoster,openScout,coverOf,SIGNATURES,signatureCards,STAT_KEYS,STAT_W,STAT_MAX,OVR_MAX,SUBPOS,ORIGINS,COUNTERS,FINISHES,SET_FINISH,SKILLS,SKILL_FX,SK_GRP,SKILLS_SIG,sigSkillOf,SK_WHEN,SK_WHEN_SHARE,SK_WHEN_WHAT,skOn,skFired,eff,staminaOf,isKp,kpK,kpOf,kpCarry,cpuKp,skMove,skillsOf,eff,skW,skS,skK,SK_SOLO,SK_WHAT,ironK,freshK,momGain,SKILLS,SKILLS_ANY,skillPool,SET_FINISH,pickOriginCh,pickCounterCh,pickFinish,resolveShot,subGroup,slotFit,fitTier,squadPowerAt,primarySub,pickHand,pickComp,trainRec,trainExp,trainUp,trainStar,trainUps,starUp,liveOvr,liveCard,myPower,trainAdd,trainReady,trainAwake,bondKey,bondOf,bondSum,bondAdd,bondMatch,bondIsGold,bondCanAwake,bondAwake,bondReadyWith,BOND_AWAKES,bondPairs,bondTier,mailTick,mailPush,mailTrim,mailDef,sponMail,seenHas,seeNow,seenAll,TUT_ALL,mailList,mailLatest,mailUnread,mailRead,mailTake,mailHas,MAILS,mailById,TICKETS,ticketById,ticketCount,ticketAdd,ticketUse,ticketTotal,drawLegend,drawSig,MEMORABILIA,memById,memHas,memList,memUnlock,memSide,memReward,memAward,memOwned,sponsor,sponOffers,sponSign,sponHit,sponPay,sponTick,sponPending,sponGoalText,sponPrizeText,sponCoin,sponAid,sponAidById,sponsorById,sponPrize,SPONSORS,SPONSOR_AID,SPON_PRIZE,streakAdd,handsNow,handNow,fameLose,trustOf,trustAdd,trustMatch,trustHand,trustNews,mentorPending,luckPick,tradePending,tradeDo,tradeHint,tradeOuts,luckApply,LUCK_ROLES,mentorAnswer,isMentor,mentorFull,makeLegacy,applyLegacy,MENTORS,condOf,condSet,condMul,condMove,condAfterMatch,condCpu,condHurt,condInjure,hurtList,hurtTick,applyInjuries,restAll,COND_MAX,COND_MIN,COND_HURT,TRAININGS,trainById,AWAKES,compsAvailable,CUPS,cupById,cupRoundName,cupRound,cupFixtureOf,cupSide,playCupDay,cupEnterable,cupEnterables,cupOpen,enterCup,cupNodes,cupLastNode,cupMustPlay,cupNodeNow,cupPlaceName,closeCup,advanceNode,cupDraw,cupPairs,cupMyPair,cupEntrants,cupResolveRound,cupTeamName,cupChampSlot,trophyDefs,trophyAdd,trophyOf,trophyCount,lgTrophyId,ORDERS,orderById,TACTICS,tacticById,clubTactic,learnRoll,tacticWhy,tacticOk,learnTactic,tacticsKnown,setTeamTactic,setTeamOrder,HANDS,tenureLeft,judgeTenure,checkTenureClosing,FACILITIES,facById,facStart,facLv,facCanBuild,facBuild,facTick,gateIncome,facTrainGain,facMedK,facMedHeal,facScoutK,evalAdd,evalMatch,ownerTenure,expectedRank,cpuSquad,coachName,foeBrief${extra}};`;

  const tmpPath = path.join(__dirname, opts.tmpName || "_tmp_run.js");
  fs.writeFileSync(tmpPath, code);
  delete require.cache[require.resolve(tmpPath)];
  const E = require(tmpPath);
  E._wait = ms => new Promise(r => realTimeout(r, ms));
  return E;
}

module.exports = { setup, mkEl, mockCanvas, mockStorage };
