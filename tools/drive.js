#!/usr/bin/env node
/**
 * pftb を headless Chrome で起動し、画面を遷移させながらスクリーンショットを撮る。
 *
 *   node tools/drive.js                 # 既定のスモークフローを実行
 *   node tools/drive.js --out=<dir>     # スクリーンショットの出力先(既定: OSのtemp/pftb-shots)
 *   node tools/drive.js --port=9333     # DevTools のポート
 *   node tools/drive.js --keep          # 終了後もプロファイルを残す(状態を引き継いで再実行したいとき)
 *   node tools/drive.js --mobile        # スマホ実寸(390x844)で確認する
 *
 * 依存パッケージなし。Node 22+ の組み込み fetch / WebSocket で CDP を直接叩く。
 * フローを増やすときは下の STEPS に足す。ヘルパー(ctx)の使い方はそこのコメント参照。
 */
"use strict";
const { spawn } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const arg = (k, d) => (process.argv.find(a => a.startsWith("--" + k + "=")) || "=" + d).split("=").slice(1).join("=");
const has = k => process.argv.includes("--" + k);
const OUT = arg("out", path.join(os.tmpdir(), "pftb-shots"));
const PORT = Number(arg("port", 9333));
const PAGE = process.env.PFTB_URL || "file:///" + path.join(ROOT, "index.html").replace(/\\/g, "/");

// Chrome か Edge のどちらかがあれば動く(Windows / macOS / Linux)
const CANDIDATES = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser",
];
function findBrowser() {
  const b = CANDIDATES.find(p => fs.existsSync(p));
  if (!b) throw new Error("Chrome / Edge が見つかりません。CANDIDATES にパスを足してください。");
  return b;
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function findTarget() {
  for (let i = 0; i < 40; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      const page = list.find(t => t.type === "page" && t.webSocketDebuggerUrl);
      if (page) return page.webSocketDebuggerUrl;
    } catch (e) { /* まだ起動途中 */ }
    await sleep(250);
  }
  throw new Error("DevTools に接続できませんでした(ポート " + PORT + ")");
}

function rpc(ws) {
  let id = 0;
  const waiting = new Map();
  ws.addEventListener("message", ev => {
    const m = JSON.parse(ev.data);
    if (m.id && waiting.has(m.id)) { waiting.get(m.id)(m); waiting.delete(m.id); }
  });
  return (method, params = {}) => new Promise((res, rej) => {
    const n = ++id;
    waiting.set(n, m => (m.error ? rej(new Error(method + ": " + m.error.message)) : res(m.result)));
    ws.send(JSON.stringify({ id: n, method, params }));
  });
}

// ---------------------------------------------------------------------------
// スモークフロー。ctx で使えるもの:
//   ctx.js(式)      ページ上で評価して値を返す(Promiseはawaitされる)
//   ctx.shot(名前)  スクリーンショットを <OUT>/<名前>.png に保存
//   ctx.wait(ms)    待つ
//   ctx.screen()    現在表示中の画面ID
//   ctx.log(...)    進捗表示
// ---------------------------------------------------------------------------
const STEPS = [
  ["タイトル", async ctx => {
    ctx.log("画面:", await ctx.screen(),
      "/ HELPタブ(出ないはず):", await ctx.js(
        "getComputedStyle(document.getElementById('helpTab')).display"));
    const fonts = await ctx.js(`(async()=>{await document.fonts.ready;return [...document.fonts].map(f=>f.family+':'+f.status).join(', ')})()`);
    ctx.log("フォント:", fonts);
    await ctx.shot("01-title");
  }],
  ["就任先の選択(名声0で届く範囲)", async ctx => {
    await ctx.js("document.getElementById('scr-title').click()");
    await ctx.wait(700);
    ctx.log("画面:", await ctx.screen(),
      "/ オファー数:", await ctx.js("document.querySelectorAll('#offerList [data-club]').length"));
    await ctx.shot("02-offers");
  }],
  ["クラブを選ぶ → 契約書", async ctx => {
    await ctx.js("document.querySelectorAll('#offerList [data-club]')[0].click()");
    await ctx.wait(400);
    ctx.log("画面:", await ctx.screen(),
      "/ クラブ:", await ctx.js("document.getElementById('ctPickClub').textContent"),
      "/ リーグ:", await ctx.js("document.getElementById('ctLeague').textContent"),
      "/ 格:", await ctx.js("document.getElementById('ctGrade').textContent"));
    // 署名欄は入力に追従する
    await ctx.js("(()=>{const i=document.getElementById('ctCoach');i.value='C. モレッティ';i.dispatchEvent(new Event('input'))})()");
    await ctx.wait(150);
    ctx.log("署名欄:", JSON.stringify(await ctx.js("document.getElementById('ctSignPreview').textContent")));
    await ctx.shot("03-contract");
  }],
  ["未記入で署名(弾かれること)", async ctx => {
    await ctx.js("(()=>{const i=document.getElementById('ctCoach');i.value='';i.dispatchEvent(new Event('input'));document.getElementById('ctSign').click()})()");
    await ctx.wait(300);
    ctx.log("画面:", await ctx.screen(), "/ toast:", await ctx.js("document.getElementById('toast').textContent"));
  }],
  ["記入して署名 → 就任", async ctx => {
    await ctx.js(`(()=>{const i=document.getElementById('ctCoach');i.value='C. モレッティ';i.dispatchEvent(new Event('input'));
                  document.getElementById('ctSign').click()})()`);
    await ctx.wait(700);
    ctx.log("画面:", await ctx.screen(),
      "/ ヘッダー:", await ctx.js("document.getElementById('hdClubName').textContent"),
      "/ コイン:", await ctx.js("document.getElementById('hdCoin').textContent"));
    await ctx.shot("04-home");
  }],
  ["HOME → 任期スケジュール → リーグ戦 → 試合", async ctx => {
    ctx.log("次戦:", await ctx.js("document.querySelector('#homeNext .next-vs').textContent"));
    await ctx.js("document.getElementById('btnPlay').click()");     // 直接は戦わずスケジュールへ
    await ctx.wait(300);
    ctx.log("遷移先:", await ctx.screen(),
      "/ 大会数:", await ctx.js("document.querySelectorAll('#seasonComps [data-comp]').length"),
      "/ 任期:", await ctx.js("document.querySelector('#tenureBar .num').textContent"),
      "/ 打ち手:", await ctx.js("document.querySelectorAll('#seasonCal .hand').length"),
      "/ カレンダー行:", await ctx.js("document.querySelectorAll('#seasonCal .cal').length"));
    await ctx.shot("05-season-hub");

    // 大会カード → 日程表(参照用。打ち手はここには無い)
    await ctx.js(`document.querySelector('#seasonComps [data-comp="league"]').click()`);
    await ctx.wait(300);
    ctx.log("日程:", await ctx.screen(),
      "/ 見出し:", await ctx.js("document.getElementById('schedHead').textContent"),
      "/ 行数:", await ctx.js("document.querySelectorAll('#schedList .cal').length"),
      "/ 次戦マーク:", await ctx.js("!!document.querySelector('#schedList .cal.next')"),
      "/ 打ち手が無いこと:", await ctx.js("document.querySelectorAll('#schedList .hand').length === 0"));
    await ctx.shot("06-schedule-league");

    // カップ戦タブへ切り替えて戻す
    await ctx.js(`document.querySelector('#scr-schedule .comp[data-comp="cup"]').click()`);
    await ctx.wait(250);
    ctx.log("カップ戦:", await ctx.js("document.getElementById('schedHead').textContent"));
    await ctx.shot("07-schedule-cup");
    await ctx.js("document.getElementById('hdBack').click()");
    await ctx.wait(300);

    // 試合は SEASON の任期カレンダーから始める(試合画面 → 再生 → 結果)
    ctx.log("開始ボタン(打ち手なし):", await ctx.js("document.getElementById('calGo').disabled"));
    await ctx.js(`document.querySelector('#seasonCal .hand[data-hand="train"]').click()`);
    await ctx.wait(250);
    ctx.log("打ち手を選んだ後:", await ctx.js("document.getElementById('calGo').disabled"));
    await ctx.js("document.getElementById('calGo').click()");
    await ctx.wait(600);
    await ctx.js("document.getElementById('mSpeed').click()");   // ×2 で少し進める
    await ctx.wait(6000);
    ctx.log("試合画面:", await ctx.screen(),
      "/ スコア:", await ctx.js("document.getElementById('mSc').textContent"),
      "/ 時計:", await ctx.js("document.getElementById('mClock').textContent"),
      "/ 選手:", await ctx.js("document.querySelectorAll('#mSlots .mp').length"),
      "/ 実況:", await ctx.js("document.querySelectorAll('#mFeed div').length"));
    // 両チームの色と向きが合っているか(HOMEは下、AWAYは上)
    ctx.log("  配色/向き:", await ctx.js(`(()=>{
      const g=s=>[...document.querySelectorAll('#mSlots .mp[data-side="'+s+'"]')];
      const H=g('H'),A=g('A');
      // GK は全陣形で枠0。HOMEは下(y大)、AWAYは上(y小)に立つはず
      const gk=a=>+a.find(e=>e.dataset.ix==='0').dataset.y;
      return 'H '+H.length+'人 GK y='+gk(H)+' / A '+A.length+'人 GK y='+gk(A)
        +' / 別の色?'+(H[0].style.background!==A[0].style.background);
    })()`));
    // 選手が枠に張り付かず、かつ陣形が崩壊していないこと(演出の要 → docs/06 §6.18)
    ctx.log("  動き:", await ctx.js(`(()=>{
      const es=[...document.querySelectorAll('#mSlots .mp')];
      let moved=0, far=0, maxd=0;
      for(const e of es){
        const dx=parseFloat(e.style.left)-(+e.dataset.x);
        const dy=parseFloat(e.style.top)-(+e.dataset.y);
        const d=Math.hypot(dx,dy);
        if(d>1)moved++; if(d>22)far++; maxd=Math.max(maxd,d);
      }
      // 大きく離れてよいのは**ボールに関わっている数人だけ**。
      // 全員が離れたら陣形が崩壊している(演出として失敗)
      if(far>4)throw new Error('陣形が崩れている: '+far+'人が枠から22%以上離れた');
      if(moved<es.length*0.7)throw new Error('選手が固まっている: 動いたのは'+moved+'人');
      return moved+'/'+es.length+'人が動いている / ボールに寄った '+far
        +'人 / 最大 '+maxd.toFixed(0)+'%';
    })()`));
    await ctx.shot("07b-match");
    // スキップ → 結果へ
    await ctx.js("document.getElementById('mSkip').click()");
    await ctx.wait(500);
    ctx.log("スキップ後:", await ctx.js("document.getElementById('mClock').textContent"),
      await ctx.js("document.getElementById('mSc').textContent"),
      "/ 実況:", await ctx.js("document.querySelectorAll('#mFeed div').length"), "行");
    await ctx.shot("07c-match-end");
    await ctx.js("document.getElementById('mDone').click()");
    await ctx.wait(400);
    ctx.log("試合結果:", await ctx.screen(),
      await ctx.js("document.getElementById('resultHead').textContent"),
      await ctx.js("document.querySelector('#resultBody .sc').textContent"));
    await ctx.shot("08-result");
    await ctx.js("document.getElementById('btnResultOk').click()");
    await ctx.wait(300);
  }],
  ["タブ巡回", async ctx => {
    for (const [tab, name] of [["cards", "09-cards"], ["deck", "10-deck"], ["season", "11-season"], ["clubhouse", "12-club"]]) {
      await ctx.js(`document.querySelector('#tabs button[data-s="${tab}"]').click()`);
      await ctx.wait(250);
      ctx.log(tab, "→", await ctx.screen(), "/", await ctx.js("document.getElementById('hdTitle').textContent"));
      await ctx.shot(name);
      if (tab === "deck") {
        // ピッチは aspect-ratio:3/4 で形が決まる。px 固定に戻ると歪むのでここで押さえる
        const box = await ctx.js(
          "(()=>{const r=document.getElementById('deckPitch').getBoundingClientRect();"
          + "return Math.round(r.width)+'x'+Math.round(r.height)+' 比'+(r.height/r.width).toFixed(3)})()");
        ctx.log("  ピッチ:", box,
          "/ 選手:", await ctx.js("document.querySelectorAll('#deckSlots .slot').length"),
          "/ 控え:", await ctx.js(
            "document.querySelectorAll('#deckBench .bn:not(.empty)').length + '/'"
            + " + document.querySelectorAll('#deckBench .bn').length"),
          "/ 編成:", await ctx.js("S.squad.filter(Boolean).length + '人'"),
          "/ 重複なし:", await ctx.js(
            "(()=>{const a=S.squad.filter(Boolean);return a.length===new Set(a).size})()"));
        if (!box.endsWith("1.333")) throw new Error("ピッチの縦横比が 3:4 ではない: " + box);
        // 丸の数字は**適性を掛けた実効値**。素のOVRだと不一致の選手のほうが大きく見える
        const disc = await ctx.js(`(()=>{
          const slots=FORMATIONS[S.form], cards=squadCards();
          return slots.map(([sub],i)=>{ const c=cards[i]; if(!c)return null;
            const shown=+document.querySelector('#deckSlots .slot[data-slot="'+i+'"] .sl-disc').textContent
              .replace(/[^0-9]/g,'');
            return { ok: shown===Math.round(c.ovr*slotFit(c,sub)), raw:c.ovr, shown };
          }).filter(Boolean);
        })()`);
        const bad = disc.filter(d => !d.ok);
        ctx.log("  丸の数字:", disc.map(d => d.raw + "→" + d.shown).join(" "),
          "/ 実効値になっている:", bad.length === 0);
        if (bad.length) throw new Error("丸の数字が実効値でない: " + JSON.stringify(bad));
        // 控えの枠もタップで差し替えられる(交代要員を選ぶため)
        await ctx.js(`(()=>{ const e=document.querySelector('#deckBench .bn');
          if(!e)throw new Error('控え枠が無い'); e.click(); })()`);
        await ctx.wait(350);
        ctx.log("  控えのピッカー:", await ctx.js("document.querySelector('#slotModalBody h3').textContent"),
          "/ 適性の色分けなし:", await ctx.js(
            "document.querySelectorAll('#slotModalBody .pk-ovr.v-warn, #slotModalBody .pk-ovr.v-bad').length === 0"));
        await ctx.shot("10h-bench-picker");
        await ctx.js("closeSlot()");
        await ctx.wait(200);

        // 陣形はピッカーから選ぶ。16種すべてに「並べ直したときの総合力」が出る
        await ctx.js("document.getElementById('btnForm').click()");
        await ctx.wait(350);
        ctx.log("  陣形ピッカー:", await ctx.js("document.querySelectorAll('#formModalBody [data-form]').length"),
          "種 / 使用中:", await ctx.js("!!document.querySelector('#formModalBody .pick.on')"));
        await ctx.shot("10g-form-picker");
        // 16種すべてを実際に描いて、選手の枠が重なっていないか実測する。
        // 座標は card-eleven から持ってきたものなので、こちらのピッチで
        // 破綻しないことは実測でしか確かめられない。
        await ctx.js("closeForm()");
        await ctx.wait(150);
        const overlaps = await ctx.js(`(()=>{
          const keep=S.form, out=[];
          for(const f of Object.keys(FORMATIONS)){
            S.form=f; S.squad=refitSquad(); renderDeck();
            const els=[...document.querySelectorAll('#deckSlots .slot')]
              .map(e=>({ p:e.querySelector('.sl-pos').textContent, r:e.getBoundingClientRect() }));
            for(let i=0;i<els.length;i++)for(let j=i+1;j<els.length;j++){
              const a=els[i].r,b=els[j].r;
              const ox=Math.min(a.right,b.right)-Math.max(a.left,b.left);
              const oy=Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top);
              if(ox>2&&oy>2)out.push(f+' '+els[i].p+'×'+els[j].p
                +' ('+Math.round(ox)+'x'+Math.round(oy)+'px)');
            }
          }
          S.form=keep; S.squad=refitSquad(); renderDeck();
          return out;
        })()`);
        ctx.log("  16種の重なり実測:", overlaps.length ? overlaps.join(" / ") : "なし");
        if (overlaps.length) throw new Error("枠が重なっている: " + overlaps.join(" / "));
        await ctx.js("document.getElementById('btnForm').click()");
        await ctx.wait(300);
        // 一番下の陣形へ変更(選手は入れ替わらないこと)
        const xiBefore = await ctx.js("JSON.stringify([...S.squad].sort())");
        await ctx.js("[...document.querySelectorAll('#formModalBody [data-form]')].pop().click()");
        await ctx.wait(350);
        ctx.log("  陣形変更 →", await ctx.js("document.getElementById('deckForm').textContent"),
          "/ 選手:", await ctx.js("document.querySelectorAll('#deckSlots .slot').length"),
          "/ 同じ11人:", await ctx.js("JSON.stringify([...S.squad].sort())") === xiBefore);
        await ctx.shot("10b-deck-formation");
        // 枠をタップ → ピッカー → 選手を入れ替える
        await ctx.js("document.querySelector('#deckSlots .slot[data-slot=\"9\"]').click()");
        await ctx.wait(350);
        const before = await ctx.js(
          "document.querySelector('#deckSlots .slot[data-slot=\"9\"] .sl-name').textContent");
        ctx.log("  ピッカー:", await ctx.js("document.querySelector('#slotModalBody h3').textContent"),
          "/ 候補:", await ctx.js("document.querySelectorAll('#slotModalBody [data-pick]').length"),
          "/ 先頭:", await ctx.js(
            "document.querySelector('#slotModalBody .pk-ovr').textContent"),
          "/ 目減りの色分け:", await ctx.js(
            "[...document.querySelectorAll('#slotModalBody .pk-ovr')]"
            + ".map(e=>e.className.includes('v-bad')?'赤':e.className.includes('v-warn')?'黄':'素')"
            + ".slice(0,8).join('')"),
          "/ 適性バッジが消えている:", await ctx.js(
            "document.querySelectorAll('#slotModalBody .pick .sl-pos').length === 0"));
        await ctx.shot("10d-slot-picker");
        // 左端の「›」は入れ替えず、ピッカーを開いたまま詳細を重ねる
        const pickedBefore = await ctx.js("JSON.stringify(S.squad)");
        await ctx.js("document.querySelectorAll('#slotModalBody [data-info]')[1].click()");
        await ctx.wait(350);
        ctx.log("  › から詳細:", await ctx.js("document.querySelector('#cardModalBody .cm-name').textContent"),
          "/ ピッカーは開いたまま:", await ctx.js("document.getElementById('slotModal').classList.contains('on')"),
          "/ 編成は変わらない:", await ctx.js("JSON.stringify(S.squad)") === pickedBefore);
        await ctx.shot("10f-pick-detail");
        await ctx.js("closeCard()");
        await ctx.wait(250);
        // 先頭(=適性×OVR が最大)を選ぶと、その枠が置き換わる
        await ctx.js("document.querySelector('#slotModalBody [data-pick]').click()");
        await ctx.wait(350);
        const after = await ctx.js(
          "document.querySelector('#deckSlots .slot[data-slot=\"9\"] .sl-name').textContent");
        ctx.log("  枠9:", before, "→", after,
          "/ 重複なし:", await ctx.js(
            "(()=>{const a=S.squad.filter(x=>x!=null);return a.length===new Set(a).size})()"),
          "/ 人数:", await ctx.js("S.squad.filter(x=>x!=null).length"));
        await ctx.shot("10e-slot-assigned");

        // ヘルプ(右端のタブ)。開いて中身が入り、外側タップで閉じること
        await ctx.js("document.getElementById('helpTab').click()");
        await ctx.wait(400);
        ctx.log("  ヘルプ:", await ctx.js("document.getElementById('helpTitle').textContent"),
          "/ 凡例:", await ctx.js("document.querySelectorAll('#helpBody .fit-chip').length"),
          "/ 開:", await ctx.js("document.getElementById('helpDrawer').classList.contains('on')"));
        await ctx.shot("10c-help");
        await ctx.js("document.getElementById('appBody').click()");
        await ctx.wait(350);
        ctx.log("  外側タップで閉じる:",
          await ctx.js("!document.getElementById('helpDrawer').classList.contains('on')"));
        // 枠適性: ポジション名の濃さで表す。3段が実際に塗り分けられているか
        ctx.log("  適性の段:", await ctx.js(
          "[...document.querySelectorAll('#deckSlots .sl-pos')]"
          + ".map(e=>(e.className.split('fit-')[1]||'-')).join('')"),
          "/ 凡例:", await ctx.js("document.querySelectorAll('#deckFit .fit-chip').length"));
      }
      if (tab === "cards") {
        // レアリティの見え方(枠・縁線・ホロ)を一望するため、全段を1枚ずつ並べた検証用グリッドに差し替える
        await ctx.js(`(()=>{
          const rng=mulberry32(11), out=[];
          Object.keys(RARITY).forEach(k=>{
            const c=makeCard(rng,"MF",{rarity:k,club:CLUBS[0].name,nation:"eng"});
            S.player.coll.push(c); out.push(cardTile(c));
          });
          document.getElementById('cardsGrid').innerHTML=out.join('');
          document.getElementById('cardsCount').textContent='検証: 全レアリティ';
        })()`);
        await ctx.wait(300);
        ctx.log("  レアリティ表示:", await ctx.js(
          "[...document.querySelectorAll('#cardsGrid .pcard')].map(e=>e.className.replace('pcard ','')).join(' | ')"));
        await ctx.shot("09c-rarities");
        // LEGENDS の詳細を開く(縁線とホロが拡大表示でも出るか)
        await ctx.js("renderCards()");
        await ctx.wait(200);
        await ctx.js("openCard(S.player.coll[S.player.coll.length-1].id)");
        await ctx.wait(300);
        ctx.log("  詳細のクラス:", await ctx.js("document.getElementById('cardModalBody').className"));
        await ctx.shot("09d-legend-detail");
        await ctx.js("closeCard()");
        await ctx.wait(150);
        // カード見本(未入手の WORLD CLASS / LEGENDS もここで見られる)
        await ctx.js("show('gallery',{push:1})");
        await ctx.wait(350);
        ctx.log("  見本:", await ctx.js(
          "[...document.querySelectorAll('#galleryGrid .pc-crest')].map(e=>e.textContent).join(' ')"),
          "/ 枚数:", await ctx.js("document.querySelectorAll('#galleryGrid .pcard').length"));
        await ctx.shot("09e-gallery");
        // 実在選手カード(イラスト入り)を拡大で確認する
        await ctx.js("openCard(signatureCards()[0])");
        await ctx.wait(350);
        ctx.log("  実在選手:", await ctx.js("document.querySelector('#cardModalBody .cm-name').textContent"),
          "/ イラスト:", await ctx.js("!!document.querySelector('#cardModalBody .pc-img')"));
        await ctx.shot("09f-signature-detail");
        await ctx.js("closeCard()");
        await ctx.wait(150);
        await ctx.js("goBack()");
        await ctx.wait(250);
        // 通常のカードでも詳細が開くこと
        await ctx.js("document.querySelector('#cardsGrid [data-card]').click()");
        await ctx.wait(300);
        ctx.log("  カード詳細:", await ctx.js("document.querySelector('#cardModalBody .cm-name').textContent"),
          "/ クレスト:", await ctx.js("document.querySelector('#cardModalBody .pc-crest').textContent"),
          "/ 能力欄:", await ctx.js("document.querySelectorAll('#cardModalBody .pc-stats div').length"),
          "/ 背景:", await ctx.js("!!document.querySelector('#cardModalBody .cm-card').style.getPropertyValue('--face')"));
        await ctx.shot("09b-card-detail");
        await ctx.js("document.getElementById('cardModalClose').click()");
        await ctx.wait(200);
        ctx.log("  閉じた:", await ctx.js("!document.getElementById('cardModal').classList.contains('on')"));
      }
    }
  }],
  ["ヘッダーとタブが固定されているか", async ctx => {
    // 96行の任期カレンダー = 一番長いページで確かめる
    await ctx.js(`document.querySelector('#tabs button[data-s="season"]').click()`);
    await ctx.wait(300);
    const before = await ctx.js(`(()=>{
      const t=document.getElementById('tabs').getBoundingClientRect();
      const h=document.getElementById('appHead').getBoundingClientRect();
      const b=document.getElementById('appBody');
      return { tabsTop:Math.round(t.top), headTop:Math.round(h.top),
               pageScrollable: document.documentElement.scrollHeight > window.innerHeight + 1,
               bodyScrollable: b.scrollHeight > b.clientHeight };
    })()`);
    ctx.log("初期:", JSON.stringify(before));
    // 本文を大きくスクロールさせる
    await ctx.js("document.getElementById('appBody').scrollTop = 99999");
    await ctx.wait(250);
    const after = await ctx.js(`(()=>{
      const t=document.getElementById('tabs').getBoundingClientRect();
      const h=document.getElementById('appHead').getBoundingClientRect();
      const b=document.getElementById('appBody');
      return { tabsTop:Math.round(t.top), headTop:Math.round(h.top), scrolled:Math.round(b.scrollTop) };
    })()`);
    ctx.log("スクロール後:", JSON.stringify(after));
    ctx.log("→ タブ固定:", before.tabsTop === after.tabsTop,
      "/ ヘッダー固定:", before.headTop === after.headTop,
      "/ 本文がスクロール:", after.scrolled > 0,
      "/ ページ自体はスクロールしない:", !before.pageScrollable);
    await ctx.shot("11b-fixed-chrome");
    await ctx.js("document.getElementById('appBody').scrollTop = 0");
    await ctx.wait(150);
  }],
  ["サブ画面と戻る", async ctx => {
    await ctx.js(`document.querySelector('#tabs button[data-s="season"]').click()`);
    await ctx.wait(200);
    await ctx.js(`document.querySelector('#seasonComps [data-comp="league"]').click()`);
    await ctx.wait(300);
    ctx.log("画面:", await ctx.screen(),
      "/ 戻るボタン:", await ctx.js("!document.getElementById('hdBack').classList.contains('off')"),
      "/ 親タブ点灯:", await ctx.js(`document.querySelector('#tabs button[data-s="season"]').classList.contains('on')`));
    ctx.log("日程の消化行:", await ctx.js("document.querySelectorAll('#schedList .cal.done').length"));
    // 順位表の要約をタップ → 詳細へ
    await ctx.js("document.getElementById('schedStandH').click()");
    await ctx.wait(300);
    ctx.log("順位表:", await ctx.screen());
    await ctx.shot("13-standings");
    await ctx.js("document.getElementById('hdBack').click()");
    await ctx.wait(300);
    ctx.log("戻り先:", await ctx.screen());
    // 任期カレンダー(SEASON)に打ち手と結果が残っているか
    await ctx.js(`document.querySelector('#tabs button[data-s="season"]').click()`);
    await ctx.wait(300);
    ctx.log("カレンダーの過去行:", await ctx.js("document.querySelectorAll('#seasonCal .cal.done').length"),
      "/ 内容:", await ctx.js("(document.querySelector('#seasonCal .cal.done')||{}).textContent"));
    await ctx.shot("12b-tenure-calendar");
  }],
  ["シーズンを最後まで進める", async ctx => {
    for (let i = 0; i < 20; i++) {
      await ctx.js(`document.querySelector('#tabs button[data-s="season"]').click()`);
      await ctx.wait(100);
      const playable = await ctx.js("!!document.getElementById('calGo')");
      if (!playable) break;
      await ctx.js("document.querySelector('#seasonCal .hand').click()");
      await ctx.wait(60);
      await ctx.js("document.getElementById('calGo').click()");
      await ctx.wait(150);
      // 試合画面を経由するので、スキップして結果まで進める
      await ctx.js("document.getElementById('mSkip').click()");
      await ctx.wait(120);
      await ctx.js("document.getElementById('mDone').click()");
      await ctx.wait(120);
      await ctx.js("document.getElementById('btnResultOk').click()");
      await ctx.wait(120);
    }
    await ctx.js(`document.querySelector('#tabs button[data-s="home"]').click()`);
    await ctx.wait(200);
    ctx.log("節:", await ctx.js("document.getElementById('homeSeason').textContent"));
    await ctx.shot("14-season-end");
    await ctx.js("document.getElementById('btnFinishSeason').click()");
    await ctx.wait(600);
    ctx.log("審判後の画面:", await ctx.screen(),
      "/ 名声:", await ctx.js("document.getElementById('offerHead').textContent"));
    await ctx.shot("15-offers-2");
  }],
  ["2つ目のクラブへ就任", async ctx => {
    await ctx.js("document.querySelectorAll('#offerList [data-club]')[0].click()");
    await ctx.wait(600);
    ctx.log("画面:", await ctx.screen(),
      "/ クラブ:", await ctx.js("document.getElementById('hdClubName').textContent"),
      "/ 節:", await ctx.js("document.getElementById('homeSeason').textContent"));
    await ctx.shot("16-second-club");
  }],
  ["リロード → RETURN TO CAREER で再開", async ctx => {
    await ctx.reload();
    await ctx.wait(1500);
    ctx.log("TAP TO START 表示:", await ctx.js("getComputedStyle(document.getElementById('tStart')).display"),
      "/ メニュー表示:", await ctx.js("getComputedStyle(document.getElementById('tMenu')).display"));
    await ctx.shot("17-title-resume");
    // セーブがある間は全画面タップを無効にしてある(誤タップで消さないため)
    await ctx.js("document.getElementById('scr-title').click()");
    await ctx.wait(300);
    ctx.log("画面タップ後(変わらないはず):", await ctx.screen());
    await ctx.js("document.getElementById('tResume').click()");
    await ctx.wait(700);
    ctx.log("再開後:", await ctx.screen(), "/ クラブ:", await ctx.js("document.getElementById('hdClubName').textContent"));
    await ctx.shot("18-continue");
  }],
];

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const profile = path.join(OUT, "chrome-profile");
  if (!has("keep")) fs.rmSync(profile, { recursive: true, force: true });

  const browser = spawn(findBrowser(), [
    "--headless=new", `--remote-debugging-port=${PORT}`, "--disable-gpu",
    "--hide-scrollbars", "--user-data-dir=" + profile, PAGE,
  ], { stdio: "ignore" });

  const ws = new WebSocket(await findTarget());
  await new Promise(r => ws.addEventListener("open", r));
  const send = rpc(ws);

  await send("Page.enable");
  await send("Runtime.enable");
  // 既定は端末枠(874px)+余白が収まる 440x960(低いとタブバーが写らない)。
  // --mobile でスマホ実寸(390x844)に切り替える。
  await send("Emulation.setDeviceMetricsOverride", has("mobile")
    ? { width: 390, height: 844, deviceScaleFactor: 2, mobile: true }
    : { width: 440, height: 960, deviceScaleFactor: 1, mobile: false });

  const problems = [];
  ws.addEventListener("message", ev => {
    const m = JSON.parse(ev.data);
    if (m.method === "Runtime.exceptionThrown") problems.push("例外: " + m.params.exceptionDetails.text);
    if (m.method === "Runtime.consoleAPICalled" && m.params.type === "error")
      problems.push("console.error: " + m.params.args.map(a => a.value).join(" "));
  });

  const ctx = {
    log: (...a) => console.log("   ", ...a),
    wait: sleep,
    reload: () => send("Page.reload"),
    js: async expr => {
      const r = await send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true });
      if (r.exceptionDetails) {
        const d = r.exceptionDetails;
        const detail = (d.exception && (d.exception.description || d.exception.value)) || d.text;
        throw new Error("JS評価に失敗: " + detail + "\n  式: " + expr.trim().slice(0, 160));
      }
      return r.result.value;
    },
    shot: async name => {
      const { data } = await send("Page.captureScreenshot", { format: "png" });
      fs.writeFileSync(path.join(OUT, name + ".png"), Buffer.from(data, "base64"));
      console.log("     → " + name + ".png");
    },
    screen: () => ctx.js("(document.querySelector('.screen.on')||{}).id"),
  };

  await sleep(1200);
  for (let i = 0; i < STEPS.length; i++) {
    const [name, run] = STEPS[i];
    console.log(`[${i + 1}/${STEPS.length}] ${name}`);
    await run(ctx);
  }

  console.log("\nスクリーンショット:", OUT);
  if (problems.length) { console.error("\n⚠ ページ側の問題:\n" + problems.join("\n")); }
  else console.log("ページ側の例外/エラー: なし");

  ws.close(); browser.kill();
  process.exit(problems.length ? 1 : 0);
})().catch(e => { console.error("FAIL:", e.message); process.exit(1); });
