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
    // NEXT MATCH のタイル(→docs/06 §6.8)。**ボタンは無く、タイルごとタップ**して日程へ
    ctx.log("次戦:", await ctx.js(`(()=>{
      const t=document.getElementById('nxTile');
      if(!t)throw new Error('次戦のタイルが無い');
      if(document.getElementById('btnPlay'))throw new Error('試合を進めるボタンが残っている');
      const md=t.querySelector('.nx-md').textContent;
      const tag=t.querySelector('.nx-tag').textContent;
      const hype=t.querySelector('.nx-hype').textContent;
      if(!/SEASON .* MATCHDAY/.test(md))throw new Error('節がタイルの中に無い: '+md);
      if(!hype)throw new Error('煽りが出ていない');
      // **VSが中心**にあること(クラブ名の長さで中心がずれない)
      const vs=t.querySelector('.nx-vs'), sp=vs.querySelector('span');
      const a=vs.getBoundingClientRect(), b=sp.getBoundingClientRect();
      const off=Math.abs((b.left+b.width/2)-(a.left+a.width/2));
      if(off>2)throw new Error('VSが中心にない: '+off.toFixed(1)+'px ずれ');
      return md+' / ['+tag+'] '+hype.replace(/\s+/g,' ');
    })()`));
    await ctx.js("document.getElementById('nxTile').click()");       // 直接は戦わずスケジュールへ
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
    // カップ戦(→docs/03 §3.23)。**条件を満たすまでは出られず、理由が出る**
    ctx.log("  カップ戦:", await ctx.js(`(()=>{
      const cup=CUPS[0];
      const card=document.querySelector('#seasonComps [data-comp="cup"]');
      if(!card)throw new Error('カップの大会カードが無い');
      const before=card.querySelector('.lg').textContent;
      if(cupEnterable())throw new Error('熟練度0でエントリーできてしまう');
      // **開催日は事前にカレンダーへ出す**(→docs/03 §3.23)
      const soon=[...document.querySelectorAll('#seasonCal .cal.cup.soon .cal-n')].map(e=>+e.textContent);
      if(!soon.length)throw new Error('開催予定がカレンダーに出ていない');
      if(soon.some(n=>!CUPS.some(c=>n%c.every===0)))
        throw new Error('開催サイクル外に予定が出ている: '+soon);
      return '条件前「'+before+'」 ／ 開催予定 '+soon.length+'節(第'+soon.slice(0,3).join('/')+'…)';
    })()`));
    await ctx.js("document.getElementById('hdBack').click()");
    await ctx.wait(300);

    // --- カップの一巡を確かめる。**元の状態は最後に戻す**(以降の撮影に影響させない) ---
    await ctx.js("window.__snap=JSON.stringify(S)");
    ctx.log("  エントリー:", await ctx.js(`(()=>{
      const cup=CUPS[0];
      S.club.exp=cup.needExp+400; S.career.node=cup.every; S.career.cup=null;
      renderSeason();
      const hand=document.querySelector('#seasonCal .hand[data-hand="entry"]');
      if(!hand)throw new Error('開催節なのにエントリーの打ち手が出ない');
      hand.click();
      const c=S.career.cup;
      if(!c)throw new Error('エントリーできない');
      if(S.career.node!==cup.every)throw new Error('エントリーで節が進んでしまう');
      const rows=[...document.querySelectorAll('#seasonCal .cal.cup')].map(e=>e.querySelector('b').textContent);
      if(rows.length!==cup.rounds-1)throw new Error('大会の予定が節に並ばない: '+rows.length);
      // **組み合わせ表はこの時点で出来上がっている**(先の回戦は TBD)
      const n=Math.pow(2,cup.rounds);
      if(!c.field||c.field.length!==n)throw new Error('組み合わせ表が作られていない');
      if(cupPairs(c,2))throw new Error('2回戦が最初から決まってしまっている');
      return '節'+cup.every+'で '+cup.name+' へ ／ 予定: '+rows.join(' → ')
        +' ／ 参加 '+n+'クラブ(自分は '+(c.slot+1)+'番)';
    })()`));
    await ctx.shot("07l-cup-entered");

    // 大会の日程(勝ち残り中)
    await ctx.js(`document.querySelector('#seasonComps [data-comp="cup"]').click()`);
    await ctx.wait(300);
    ctx.log("  組み合わせ表:", await ctx.js(`(()=>{
      const cup=CUPS[0];
      const rnd=document.querySelectorAll('#schedList .br-r').length;
      const ms=document.querySelectorAll('#schedList .br-m').length;
      const tbd=document.querySelectorAll('#schedList .br-row.tbd').length;
      const me=document.querySelectorAll('#schedList .br-row.me').length;
      if(rnd!==cup.rounds)throw new Error('回戦の束が足りない: '+rnd);
      if(ms!==Math.pow(2,cup.rounds)-1)throw new Error('試合の数が合わない: '+ms);
      if(!tbd)throw new Error('TBD が出ていない');
      if(me!==1)throw new Error('自クラブの行が1つでない: '+me);
      if(!document.querySelector('#schedList .br-m.next'))throw new Error('次戦が示されていない');
      return rnd+'回戦 / '+ms+'試合 / TBD '+tbd+'枠 ／ '
        +document.querySelector('.cup-res b').textContent;
    })()`));
    await ctx.shot("07m-cup-plan");

    // 1回戦を戦うと**TBDが次の回戦ぶんだけ埋まる**
    ctx.log("  1回戦のあと:", await ctx.js(`(()=>{
      const c=S.career.cup;
      const before=document.querySelectorAll('#schedList .br-row.tbd').length;
      S.career.hand='train'; S.career.comp='cup';
      const out=playCupDay(null);
      renderSchedule();
      const after=document.querySelectorAll('#schedList .br-row.tbd').length;
      if(after>=before)throw new Error('TBD が埋まらない: '+before+' → '+after);
      if(!cupPairs(c,2))throw new Error('2回戦の枠が決まらない');
      return '自分 '+out.my.gf+'-'+out.my.ga+(out.my.win?' 勝ち':' 敗退')
        +' ／ TBD '+before+' → '+after+'枠';
    })()`));
    await ctx.shot("07m2-cup-bracket");

    // 優勝して大会が締まったところ(**賞金は完了節に入る**)
    ctx.log("  大会の決着:", await ctx.js(`(()=>{
      const cup=CUPS[0], c=S.career.cup;
      c.alive=true; c.out=null; c.res.length=0;
      for(let r=1;r<cup.rounds;r++)cupResolveRound(c,r,{gf:2,ga:0,win:true});
      S.career.node=cupLastNode();
      cupResolveRound(c,cup.rounds,{gf:1,ga:0,win:true});
      const coin0=S.club.coins;
      const closed=advanceNode();
      if(!closed||!closed.win)throw new Error('優勝で締まらない');
      renderSchedule();
      return '優勝 '+S.career.cup.champ+' ／ 賞金 +'+(S.club.coins-coin0)
        +' ／ 実績 '+S.player.trophies.length+'件';
    })()`));
    await ctx.shot("07n-cup-result");
    await ctx.js("Object.assign(S,JSON.parse(window.__snap)); save(); renderSeason()");
    await ctx.wait(200);

    await ctx.js("document.getElementById('hdBack').click()");
    await ctx.wait(300);

    // 試合は SEASON の任期カレンダーから始める(試合画面 → 再生 → 結果)
    ctx.log("開始ボタン(打ち手なし):", await ctx.js("document.getElementById('calGo').disabled"));
    await ctx.js(`document.querySelector('#seasonCal .hand[data-hand="train"]').click()`);
    await ctx.wait(250);
    ctx.log("打ち手を選んだ後:", await ctx.js("document.getElementById('calGo').disabled"));
    await ctx.js("document.getElementById('calGo').click()");
    await ctx.wait(900);
    // キックオフのカットイン
    ctx.log("  キックオフ演出:", await ctx.js(
      "document.getElementById('mCut').className + ' / ' + "
      + "(document.querySelector('#mCut .cut-hd')||{}).textContent"));
    // キックオフ時は**両チームとも自陣**にいること
    ctx.log("  キックオフ隊形:", await ctx.js(`(()=>{
      const g=s=>[...document.querySelectorAll('#mSlots .mp[data-side="'+s+'"]')].map(e=>+e.dataset.y);
      // **自分のクラブは常に下**(→docs/06 §6.17)。ホーム/アウェイではなく自分基準で見る
      const me=mMine(), op=me==='H'?'A':'H';
      const My=g(me), Op=g(op);
      const myOver=My.filter(y=>y<50).length, opOver=Op.filter(y=>y>50).length;
      if(myOver||opOver)throw new Error('相手陣に立っている: 自軍 '+myOver+'人 / 相手 '+opOver+'人');
      return '自軍('+me+') y='+Math.min(...My).toFixed(0)+'〜'+Math.max(...My).toFixed(0)
        +' / 相手('+op+') y='+Math.min(...Op).toFixed(0)+'〜'+Math.max(...Op).toFixed(0)
        +' (中央線は50%。どちらも越えていない)';
    })()`));
    await ctx.shot("07a-cutin-kickoff");
    await ctx.wait(9000);
    ctx.log("  カットイン:", await ctx.js("window.__cutN||0"), "回");
    // 各カットインの見た目を確かめる(実戦では出る局面が毎回変わるので直接呼ぶ)
    await ctx.js("document.getElementById('mPlay').click()");   // 一時停止
    await ctx.wait(200);
    ctx.log("  マッチアップの見出し:", await ctx.js(`(()=>{ const H=_M.home,A=_M.away;
      const atk=H.players.find(p=>p.role==='FW'), df=A.players.find(p=>p.role==='DF');
      const dch=(COUNTERS[df.sub]||COUNTERS.CB)[0];
      // 守備側も自分の手を持つ(→docs/07 §7.14)。両者の札が読めることを確かめる
      cutVs({side:'H',label:'裏抜け',ch:'cfRun',vs:df.c.id,dch:dch.id,dlabel:dch.label},
        atk,df,'突破!',true);
      const n=[...document.querySelectorAll('#mCut .cut-fig span')].map(x=>x.textContent);
      // 左右は「自分のチームが左」なので、守備側がどちらに出るかは試合しだい
      if(!n.some(t=>t.indexOf(dch.label)>=0))
        throw new Error('守備側のカットインに守備チャンネルが出ていない: '+n.join(' | '));
      return n.join(' | ');
    })()`));
    await ctx.wait(250);
    await ctx.shot("07d-cutin-vs-1");   // 両者が入ってきたところ
    await ctx.wait(600);
    await ctx.shot("07d-cutin-vs-2");   // 勝敗が表れ、決着語が出たところ
    ctx.log("  シュートの見出し:", await ctx.js(`(()=>{ const H=_M.home;
      const sc=H.players.find(p=>p.role==='FW'), as=H.players.find(p=>p.role==='MF');
      const gk=_M.away.players.find(p=>p.role==='GK');
      // 終点チャンネルの名前が見出しになる(→docs/07 §7.15)
      const fin=(FINISHES[sc.sub]||FINISHES.CMF)[0];
      cutShot({side:'H',type:'goal',hg:1,ag:0,fin:fin.id,flabel:fin.label},sc,gk,'GOAL!!',true,as);
      const hd=document.querySelector('#mCut .cut-hd').textContent;
      if(hd!==fin.label)throw new Error('シュートの見出しが終点チャンネル名でない: '+hd);
      return hd;
    })()`));
    await ctx.wait(300);
    await ctx.shot("07e-cutin-shot");    // まず「シュート!」
    await ctx.wait(1250);
    await ctx.shot("07e-cutin-goal");    // そのあと結果
    // セットプレー(→docs/07 §7.11)。出る局面が毎回変わるので直接呼ぶ
    ctx.log("  セットプレーのカットイン:", await ctx.js(`(()=>{
      const k=spKicker(_M.home,'pk');
      cutSet({side:'H',kind:'pk'},k);
      const hd=document.querySelector('#mCut .cut-hd').textContent;
      if(!document.querySelector('#mCut .cut.sp'))throw new Error('セットプレーの帯が出ていない');
      return hd+' / '+k.c.sur;
    })()`));
    await ctx.wait(400);
    await ctx.shot("07h-cutin-setpiece");
    ctx.log("  退場のカットイン:", await ctx.js(`(()=>{
      const p=_M.away.players.find(q=>q.role==='DF');
      cutCard({side:'A',card:'r',off:true},p);
      if(!document.querySelector('#mCut .cut.red'))throw new Error('退場の帯が赤くない');
      return document.querySelector('#mCut .cut-word').textContent;
    })()`));
    await ctx.wait(400);
    await ctx.shot("07i-cutin-red");
    // 実際の試合でゴールしたとき、ボールがゴールへ入ること
    // シュートの着地点がゴールライン(2%/98%)に届いているか
    ctx.log("  シュートの着地:", await ctx.js(`(()=>{
      const out=[];
      const run=(side,type)=>new Promise(r=>{
        mBallShot({side,type,pos:[50,30]},0);
        setTimeout(()=>{ const b=document.getElementById('mBall');
          out.push(side+'/'+type+' x='+b.style.left+' y='+b.style.top); r(); },60);
      });
      return run('H','goal').then(()=>run('H','save')).then(()=>run('H','miss'))
        .then(()=>run('A','goal')).then(()=>out.join(' | '));
    })()`));
    // ゴールした状態で1枚撮る(ボールがネットの中にあること)
    await ctx.js(`(()=>{ mBallShot({side:'H',type:'goal',pos:[50,30]},0);
      const H=_M.home, sc=H.players.find(p=>p.role==='FW');
      const gk=_M.away.players.find(p=>p.role==='GK');
      cutShot({side:'H',type:'goal',hg:1,ag:0},sc,gk,'GOAL!!',true,null); })()`);
    await ctx.wait(1400);
    await ctx.shot("07g-ball-in-net");
    await ctx.js(`(()=>{ const H=_M.home;
      const a=H.players.find(p=>p.role==='MF'), b=H.players.find(p=>p.role==='FW');
      cutPass({side:'H',label:'スルーパス'},a,b); })()`);
    await ctx.wait(300);
    await ctx.shot("07f-cutin-pass");
    await ctx.js("document.getElementById('mPlay').click()");   // 再開
    await ctx.wait(300);
    ctx.log("試合画面:", await ctx.screen(),
      "/ スコア:", await ctx.js("document.getElementById('mSc').textContent"),
      "/ 時計:", await ctx.js("document.getElementById('mClock').textContent"),
      "/ 選手:", await ctx.js("document.querySelectorAll('#mSlots .mp').length"),
      "/ 実況:", await ctx.js("document.querySelectorAll('#mFeed div').length"));
    // 両チームの色と向きが合っているか(HOMEは下、AWAYは上)
    ctx.log("  配色/向き:", await ctx.js(`(()=>{
      const g=s=>[...document.querySelectorAll('#mSlots .mp[data-side="'+s+'"]')];
      const me=mMine(), op=me==='H'?'A':'H';
      const My=g(me), Op=g(op);
      // GK は全陣形で枠0。**自分のGKは下(y大)・相手のGKは上(y小)**でなければならない
      const gk=a=>+a.find(e=>e.dataset.ix==='0').dataset.y;
      const sh=s2=>getComputedStyle(document.querySelector(
        '#mSlots .mp[data-side="'+s2+'"] .mp-sh')).backgroundColor;
      if(gk(My)<50)throw new Error('自軍のGKが上にいる: y='+gk(My));
      if(gk(Op)>50)throw new Error('相手のGKが下にいる: y='+gk(Op));
      return '自軍('+me+') '+My.length+'人 GK y='+gk(My).toFixed(0)
        +' / 相手('+op+') '+Op.length+'人 GK y='+gk(Op).toFixed(0)
        +' / 影の色が別?'+(sh(me)!==sh(op));
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
      // **ボールに一番近い選手は、枠よりボール側にいる**(→docs/06 §6.18)。
      // ブロックごと平行移動するだけだと、誰もボールに行っていないように見える
      {
        const b=document.getElementById('mBall');
        const bx=parseFloat(b.style.left), by=parseFloat(b.style.top);
        const all=[...document.querySelectorAll('#mSlots .mp')]
          .map(e=>({e, sx:+e.dataset.x, sy:+e.dataset.y,
                    x:parseFloat(e.style.left), y:parseFloat(e.style.top)}))
          .filter(o=>o.e.querySelector('img')||true);
        const d=(a,x,y)=>Math.hypot(a.x-x,a.y-y);
        // **何人かはボールへ詰めている**こと。全員が離れるなら誰も行っていない。
        // 一番近い1人で見ないのは、空きを狙って**あえて離れる**動きもあるため
        // 再開の隊形(キックオフ/得点直後)は**わざと崩さない**ので、そのときは見ない
        let toward=_mRestart?99:0;
        for(const o of _mRestart?[]:all){
          const before=Math.hypot(o.sx-bx,o.sy-by);
          const after=Math.hypot(o.x-bx,o.y-by);
          if(after<before-1)toward++;
        }
        // 何人が詰めるかはボールの位置で変わる。**誰も動いていない**ことだけを弾く
        if(toward<2)throw new Error('誰もボールへ動いていない: '+toward+'人');
      }
      // 点ではなく全身。**足元の影はチームカラー**で、両チームで色が違うこと
      const sh=s2=>getComputedStyle(document.querySelector(
        '#mSlots .mp[data-side="'+s2+'"] .mp-sh')).backgroundColor;
      if(!document.querySelector('#mSlots .mp img'))throw new Error('選手が全身で出ていない');
      if(sh('H')===sh('A'))throw new Error('両チームの影が同じ色: '+sh('H'));
      // 大きく離れてよいのは**ボールに関わっている数人だけ**。
      // 全員が離れたら陣形が崩壊している(演出として失敗)
      if(far>4)throw new Error('陣形が崩れている: '+far+'人が枠から22%以上離れた');
      if(moved<es.length*0.7)throw new Error('選手が固まっている: 動いたのは'+moved+'人');
      return moved+'/'+es.length+'人が動いている / ボールに寄った '+far
        +'人 / 最大 '+maxd.toFixed(0)+'%';
    })()`));
    // オフサイドの絵にならないこと: 自軍の最前線が相手の最終ラインより手前にいる
    ctx.log("  ライン:", await ctx.js(`(()=>{
      const g=s=>[...document.querySelectorAll('#mSlots .mp[data-side="'+s+'"]')]
        .map(e=>({ix:+e.dataset.ix, y:+e.dataset.y}));
      const me=mMine(), op=me==='H'?'A':'H';
      const formOf=s=>(s==='H'?_M.home:_M.away).form;
      const grp=(s,p)=>subGroup(FORMATIONS[formOf(s)][p.ix][0]);
      const myFW=Math.min(...g(me).filter(p=>grp(me,p)==='FW').map(p=>p.y));
      const opDF=Math.min(...g(op).filter(p=>grp(op,p)==='DF').map(p=>p.y));
      if(!(myFW>opDF))
        throw new Error('自軍FW('+myFW.toFixed(0)+')が相手の最終ライン('+opDF.toFixed(0)+')より深い');
      return '自軍の最前線 y='+myFW.toFixed(0)+' > 相手の最終ライン y='+opDF.toFixed(0)
        +' (オフサイドの絵にならない)';
    })()`));
    // スコアボードと実況のスコアが**同じ並び**であること(左=自分)
    ctx.log("  スコアの並び:", await ctx.js(`(()=>{
      const me=mMine();
      const sc=document.getElementById('mSc').textContent.trim();
      const goals=_M.events.filter(e=>e.type==='goal');
      if(!goals.length)return sc+' (まだ得点なし)';
      const line=[...document.querySelectorAll('#mFeed div')].map(d=>d.textContent)
        .find(t=>t.indexOf('ゴール！')>=0)||'';
      if(!line)return sc+' (実況にまだ出ていない)';
      // 実況の行は**その時点のスコア**なので、どのゴールかは特定できない。
      // 「いずれかのゴールの並びと一致する」ことだけを見る(左=自分になっているか)
      const wants=goals.map(g=>me==='A'?g.ag+' - '+g.hg:g.hg+' - '+g.ag);
      if(!wants.some(w=>line.indexOf(w)>=0))
        throw new Error('実況のスコアがスコアボードと逆: 実況「'+line.trim()+'」/ 期待 '+wants.join(' か '));
      return 'スコアボード '+sc+' / 実況「'+line.trim().slice(-9)+'」(左=自分)';
    })()`));
    await ctx.shot("07b-match");
    // 交代タブ(→docs/06 §6.21)。**開くと試合が止まる**
    ctx.log("  交代タブ:", await ctx.js(`(()=>{
      if(document.getElementById('subTab').classList.contains('off'))
        throw new Error('試合中なのに交代タブが出ていない');
      const wasPaused=_mPaused;
      document.getElementById('subTab').click();
      if(!_mPaused)throw new Error('交代タブを開いても試合が止まらない');
      const outs=[...document.querySelectorAll('#subBody [data-out]')];
      const ins=[...document.querySelectorAll('#subBody [data-in]')];
      if(outs.length!==11)throw new Error('ピッチの選手が11人ではない: '+outs.length);
      if(!ins.length)throw new Error('ベンチが出ていない');
      // スタミナの低い順に替えたいので、残量が読めること
      const v=outs.map(e=>e.querySelector('.sb-v').textContent);
      return outs.length+'人 / 控え'+ins.length+'人 / 残量 '+v.slice(0,3).join(' ');
    })()`));
    await ctx.wait(420);
    await ctx.shot("07j-sub");
    ctx.log("  交代の申請:", await ctx.js(`(()=>{
      const T=mMine()==='H'?_M.home:_M.away;
      const go=document.getElementById('subGo');
      const max=TUNING.squad.subMax;
      const label=()=>go.textContent.trim();
      if(label().replace(/[ 　]/g,'')!=='交代する残り3回')
        throw new Error('残り回数がボタンに出ていない: '+label());
      if(!go.disabled)throw new Error('誰も選んでいないのにボタンが押せる');
      const log=[];
      // **枠を使い切るまで連続で積める**。押すたびにリストが入れ替わること
      for(let n=0;n<max;n++){
        const outs=[...document.querySelectorAll('#subBody [data-out]')];
        const ins=[...document.querySelectorAll('#subBody [data-in]')];
        if(!outs.length||!ins.length)throw new Error(n+'回目で候補が尽きた');
        const outName=outs[0].querySelector('.sb-nm').textContent;
        const inName=ins[0].querySelector('.sb-nm').textContent;
        outs[0].click(); ins[0].click();
        if(go.disabled)throw new Error('2人選んでもボタンが押せない');
        go.click();
        // 下げた選手は「交代済み」に落ち、選べなくなっていること
        const still=[...document.querySelectorAll('#subBody [data-out],#subBody [data-in]')]
          .some(e=>e.querySelector('.sb-nm').textContent===outName);
        if(still)throw new Error('下げた選手がまだ選べる: '+outName);
        log.push(inName+'←'+outName);
      }
      if(label().replace(/[ 　]/g,'')!=='交代する残り0回')
        throw new Error('使い切っても残りが0にならない: '+label());
      if(!go.disabled)throw new Error('使い切ってもボタンが押せる');
      // **使い切ってもスタミナ一覧としては見られる**
      if(!document.querySelectorAll('#subBody .sb-r').length)
        throw new Error('枠を使い切ると一覧が消える');
      const pend=_M.orders[T.side].filter(o=>o.type==='sub').length;
      if(pend!==max)throw new Error('積まれた数が合わない: '+pend+'/'+max);
      return log.join(' / ')+' (上限'+max+')';
    })()`));
    await ctx.shot("07k-sub-used");
    ctx.log("  交代タブを閉じる:", await ctx.js(`(()=>{
      document.getElementById('subClose').click();
      if(_mPaused!==false&&!_M.over)throw new Error('閉じても再生に戻らない');
      return '再生に戻った';
    })()`));
    // 最後まで再生して終える(スキップではなく**実際に見終わったときと同じ経路**)。
    // ここで締め忘れると結果画面に試合の中身が渡らないので、over を確かめる。
    ctx.log("自然終了:", await ctx.js(`(()=>{
      while(!matchOver(_M))stepMatch(_M);
      mFinish();
      if(!_M.over)throw new Error('再生を見終わっても _M.over が立たない(結果画面が空になる)');
      return '_M.over=true / イベント '+_M.events.length+' 件';
    })()`));
    await ctx.wait(300);
    ctx.log("スキップ後:", await ctx.js("document.getElementById('mClock').textContent"),
      await ctx.js("document.getElementById('mSc').textContent"),
      "/ 実況:", await ctx.js("document.querySelectorAll('#mFeed div').length"), "行");
    await ctx.shot("07c-match-end");
    await ctx.js("document.getElementById('mDone').click()");
    await ctx.wait(400);
    ctx.log("結果画面:", await ctx.screen(),
      "/ MOM:", await ctx.js("(document.querySelector('#rsMom .pc-name b')||{}).textContent"),
      "/ スタッツ:", await ctx.js("document.querySelectorAll('#rsBars .rs-bar').length"), "項目",
      "/ 採点:", await ctx.js("document.querySelectorAll('#rsList .rs-p').length"), "人",
      "/ 最高評価:", await ctx.js("(document.querySelector('#rsList .rs-rt')||{}).textContent"));
    await ctx.shot("08b-result-stats");
    ctx.log("試合結果:", await ctx.screen(),
      await ctx.js("document.getElementById('resultHead').textContent"),
      await ctx.js("document.getElementById('rsVerdict').textContent"),
      await ctx.js("document.getElementById('rsScore').textContent"));
    await ctx.shot("08-result");
    await ctx.js("document.getElementById('btnResultOk').click()");
    await ctx.wait(300);
  }],
  ["セットプレー(編成の指名 → カットイン)", async ctx => {
    await ctx.js("document.querySelector('#tabs button[data-s=\"deck\"]').click()");
    await ctx.wait(300);
    // キャプテン(→docs/03 §3.20)。指名すると自動から切り替わり、セーブに載る
    ctx.log("キャプテン:", await ctx.js(`(()=>{
      const c=document.querySelector('#deckCaptain .cap');
      if(!c)throw new Error('キャプテン枠が無い');
      const before=c.querySelector('.cap-nm').textContent;
      c.click();
      const rows=[...document.querySelectorAll('#slotModalBody [data-pick]')];
      if(!rows.length)throw new Error('候補が出ない');
      rows[rows.length-1].click();
      const el=document.querySelector('#deckCaptain .cap');
      if(el.classList.contains('auto'))throw new Error('指名しても自動のまま');
      if(S.captain==null)throw new Error('指名がセーブに入っていない');
      return before+' → '+el.querySelector('.cap-nm').textContent;
    })()`));
    await ctx.shot("13e-captain");
    ctx.log("担当枠:", await ctx.js(
      `[...document.querySelectorAll('#deckKickers .kk')].map(k=>k.querySelector('.kk-t').textContent+':'+k.querySelector('.kk-nm').textContent+'('+k.querySelector('.kk-sub').textContent+')').join(' / ')`));
    await ctx.shot("13a-kickers");
    // FK の担当を指名 → 表示が「自動」から「指名」に変わる
    await ctx.js("document.querySelector('#deckKickers [data-kick=\"fk\"]').click()");
    await ctx.wait(250);
    await ctx.shot("13b-kicker-pick");
    ctx.log("指名後:", await ctx.js(`(()=>{
      const rows=[...document.querySelectorAll('#slotModalBody [data-pick]')];
      rows[rows.length-1].click();
      const k=document.querySelector('#deckKickers [data-kick="fk"]');
      if(k.classList.contains('auto'))throw new Error('指名しても自動のままになっている');
      if(S.kickers.fk==null)throw new Error('指名がセーブに入っていない');
      return k.querySelector('.kk-nm').textContent+' / '+k.querySelector('.kk-sub').textContent;
    })()`));
  }],
  ["スカウト(コインでパックを引く)", async ctx => {
    await ctx.js(`document.querySelector('#tabs button[data-s="home"]').click()`);
    await ctx.wait(250);
    ctx.log("HOMEのタイル:", await ctx.js(`(()=>{
      const t=[...document.querySelectorAll('.tiles .tile')];
      if(t.length!==2)throw new Error('タイルが2枚ではない: '+t.length);
      return t.map(e=>e.querySelector('.tile-t').textContent+'('
        +e.querySelector('.tile-s').textContent+')').join(' / ');
    })()`));
    await ctx.shot("19-home-tiles");
    await ctx.js("document.getElementById('tileScout').click()");
    await ctx.wait(300);
    ctx.log("スカウト:", await ctx.screen(), "/", await ctx.js(
      "document.getElementById('scoutCoins').textContent"),
      "/ 種類:", await ctx.js("document.querySelectorAll('#scoutList .pk-row').length"));
    await ctx.shot("20-scout");
    ctx.log("開封:", await ctx.js(`(()=>{
      const S0=S.club.coins, N0=S.player.coll.length;
      // コインが足りるように積んでおく(検証用。ゲーム内の経路ではない)
      S.club.coins=99999; renderScout();
      const btn=document.querySelector('#scoutList [data-pack="focus"]');
      if(btn.disabled)throw new Error('コインが足りているのに押せない');
      btn.click();
      const got=document.querySelectorAll('#scoutOpen .pcard');
      const pk=TUNING.scout.find(p=>p.id==='focus');
      if(got.length!==pk.cards)throw new Error('出た枚数が違う: '+got.length);
      if(S.player.coll.length!==N0+pk.cards)throw new Error('所持カードが増えていない');
      if(S.club.coins!==99999-pk.cost)throw new Error('コインが引かれていない');
      // **必ず1枚は REGULAR 以上**
      const rank=k=>RAR_KEYS.indexOf(k);
      const last=S.player.coll.slice(-pk.cards);
      if(!last.some(c=>rank(c.rarity)>=rank('REG')))
        throw new Error('確定枠が効いていない: '+last.map(c=>c.rarity).join(','));
      S.club.coins=S0;
      return last.map(c=>c.rarity).join(' / ')+' / 残 '+fmtNum(S.club.coins);
    })()`));
    await ctx.wait(900);
    await ctx.shot("21-scout-open");

    // プロスカウト(→docs/03 §3.26)。**3枚とも SPECIALS 以上**で、まれに WORLD CLASS
    ctx.log("プロスカウト:", await ctx.js(`(()=>{
      const S0=S.club.coins;
      const pk=TUNING.scout.find(p=>p.id==='pro');
      S.club.coins=99999; renderScout();
      const btn=document.querySelector('#scoutList [data-pack="pro"]');
      if(!btn)throw new Error('プロスカウトの行が無い');
      if(btn.disabled)throw new Error('コインが足りているのに押せない');
      // WORLD CLASS が出るまで引き直して、虹ホロのカードを撮る
      let last=null;
      for(let i=0;i<40;i++){
        S.club.coins=99999; renderScout();
        document.querySelector('#scoutList [data-pack="pro"]').click();
        last=S.player.coll.slice(-pk.cards);
        if(last.some(c=>c.rarity==='WC'))break;
      }
      if(last.some(c=>c.rarity!=='SPE'&&c.rarity!=='WC'))
        throw new Error('SPECIALS 未満が出た: '+last.map(c=>c.rarity).join(','));
      if(last.some(c=>c.sig))throw new Error('実在選手カードが出た');
      S.club.coins=S0;
      return last.map(c=>c.rarity+':'+c.ovr).join(' / ');
    })()`));
    await ctx.wait(900);
    await ctx.shot("21b-scout-pro");
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
        // 絵の引き当て(→docs/03 §3.19)。段×ポジションのプールから、IDで決まる
        ctx.log("  絵の引き当て:", await ctx.js(`(()=>{
          const cs=availableCards();
          const gk=cs.find(c=>c.pos==='GK'), fp=cs.find(c=>c.pos!=='GK');
          const key=c=>artKeyOf(c);
          if(gk&&!/^(any|std|reg|spe)-gk-/.test(key(gk)))
            throw new Error('GKにGK以外の絵が付いた: '+key(gk));
          if(fp&&/-gk-/.test(key(fp)))
            throw new Error('外野にGKの絵が付いた: '+key(fp));
          // 同じカードなら何度引いても同じ絵(セーブに持たずIDから決める)
          if(fp&&key(fp)!==key(fp))throw new Error('引き当てが安定しない');
          const uniq=new Set(cs.map(key)).size;
          if(uniq<3)throw new Error('絵が偏りすぎ: '+uniq+'種');
          return (gk?key(gk):'-')+' / '+(fp?key(fp):'-')+' / '+cs.length+'枚で'+uniq+'種';
        })()`));
        // OVR の下のポジション(→docs/06 §6.13)。右端が OVR と揃っていること
        ctx.log("  ポジション表記:", await ctx.js(`(()=>{
          const c=document.querySelector('#cardsGrid .pcard');
          const ovr=c.querySelector('.pc-ovr').getBoundingClientRect();
          const pos=c.querySelector('.pc-pos b');
          if(!pos)throw new Error('OVRの下にポジションが無い');
          const pr=pos.getBoundingClientRect();
          if(Math.abs(pr.right-ovr.right)>2)
            throw new Error('右端がOVRと揃っていない: '+pr.right.toFixed(1)+' / '+ovr.right.toFixed(1));
          if(pr.top<ovr.bottom-1)throw new Error('ポジションがOVRより上にある');
          // 名前帯はクラブだけ(ポジションを二重に出さない)
          const band=c.querySelector('.pc-name span').textContent;
          if(/^(GK|CB|LSB|RSB|DMF|CMF|OMF|LMF|RMF|CF|ST|LWG|RWG)/.test(band))
            throw new Error('名前帯にポジションが残っている: '+band);
          const plus=[...document.querySelectorAll('#cardsGrid .pc-pos i')].length;
          return pos.textContent+' / 名前帯「'+band+'」/ サブ持ち '+plus+'枚';
        })()`));
        // 段のデザイン文字(→docs/06 §6.13)。ホロを持つ段だけに出て、地の一部として敷く
        ctx.log("  段のデザイン文字:", await ctx.js(`(()=>{
          const g=[...document.querySelectorAll('#cardsGrid .pc-grade')];
          const holo=[...document.querySelectorAll('#cardsGrid .pcard')]
            .filter(e=>/holo-/.test(e.className)).length;
          if(g.length!==holo)
            throw new Error('ホロの段の数と一致しない: 文字'+g.length+' / ホロ'+holo);
          for(const e of g){
            const z=+getComputedStyle(e).zIndex;
            if(z!==1)throw new Error('段の文字が地の上に出ている: z='+z);
          }
          // 選手が一番上・段の文字が一番下、という重なり順を数字で押さえる
          const art=document.querySelector('#cardsGrid .pc-art');
          const st=document.querySelector('#cardsGrid .pc-stats');
          const za=+getComputedStyle(art).zIndex, zs=+getComputedStyle(st).zIndex;
          if(!(za>zs))throw new Error('選手が文字より下にいる: 選手'+za+' / 文字'+zs);
          return ([...new Set(g.map(e=>e.textContent))].join(' / ')||'ホロの段が無い')
            +' / '+g.length+'枚 / 選手z='+za+' 文字z='+zs;
        })()`));
        // 通常のカードでも詳細が開くこと
        await ctx.js("document.querySelector('#cardsGrid [data-card]').click()");
        await ctx.wait(300);
        ctx.log("  カード詳細:", await ctx.js("document.querySelector('#cardModalBody .cm-name').textContent"),
          "/ クレスト:", await ctx.js("document.querySelector('#cardModalBody .pc-crest').textContent"),
          "/ 能力欄:", await ctx.js("document.querySelectorAll('#cardModalBody .pc-stats div').length"),
          "/ 背景:", await ctx.js("!!document.querySelector('#cardModalBody .cm-card').style.getPropertyValue('--face')"));
        // **明るい地の段(ST/WC)で能力ラベルとクラブ名が読めること**(→docs/06 §6.13)。
        // 白い地に白を混ぜると消えるので、段ごとに色を持たせている
        ctx.log("  明るい地の可読性:", await ctx.js(`(()=>{
          // 返る形は環境で変わる(oklch(...) / rgb(...))。**明度だけ**を取り出す。
          // テンプレートリテラルの中なので、正規表現に \\d 等の**バックスラッシュを使わない**
          const lum=c=>{
            const m=c.split(/[^0-9.]+/).filter(x=>x.length).map(Number);
            if(c.indexOf('oklch')===0)return m[0];          // oklch の L はそのまま明度
            if(m.length>=3)return (0.2126*m[0]+0.7152*m[1]+0.0722*m[2])/255;
            return 1;
          };
          const out=[];
          for(const rar of ['STD','WC']){
            const card=makeCard(mulberry32(7),'MF',{rarity:rar});
            card.club='テストクラブ';
            const d=document.createElement('div');
            d.className='pcard '+rarClass(card); d.style.position='fixed'; d.style.left='-9999px';
            d.innerHTML=cardFace(card); document.body.appendChild(d);
            const lab=getComputedStyle(d.querySelector('.pc-stats span')).color;
            const sub=getComputedStyle(d.querySelector('.pc-name span')).color;
            d.remove();
            // 地は白に近いので、文字は**十分に暗い**必要がある
            if(!(lum(lab)<=0.55))throw new Error(rar+' の能力ラベルが明るすぎる: '+lab);
            if(!(lum(sub)<=0.55))throw new Error(rar+' のクラブ名が明るすぎる: '+sub);
            out.push(rar+' ラベル['+lab+'] クラブ['+sub+']');
          }
          return out.join(' / ');
        })()`));
        // スキルの効果は**タップで浮かせる**(→docs/03 §3.21)
        ctx.log("  スキルの吹き出し:", await ctx.js(`(()=>{
          const chips=[...document.querySelectorAll('#cardModalBody .skill')];
          const pop=document.getElementById('skPop');
          if(!chips.length)throw new Error('スキルが出ていない');
          if(!pop.hidden)throw new Error('最初から吹き出しが開いている');
          if(chips[0].textContent.indexOf('やすい')>=0)
            throw new Error('効果が常時出たままになっている');
          chips[0].click();
          if(pop.hidden||!pop.textContent)throw new Error('タップしても出ない');
          if(!chips[0].classList.contains('on'))throw new Error('タップした札が光らない');
          const w=document.querySelector('#cardModalBody .skills').getBoundingClientRect();
          const r=pop.getBoundingClientRect();
          if(r.left<w.left-1||r.right>w.right+1)
            throw new Error('吹き出しが枠からはみ出している');
          const t=pop.textContent;
          chips[0].click();
          if(!pop.hidden)throw new Error('もう一度タップしても閉じない');
          // 別の札を押したら中身が入れ替わる
          if(chips[1]){ chips[1].click();
            if(pop.textContent===t&&chips.length>1&&chips[0].textContent!==chips[1].textContent)
              throw new Error('別の札でも中身が変わらない'); }
          return chips.length+'枚 / 「'+pop.textContent+'」';
        })()`));
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
    // カップの節が割り込むので、リーグ14節ぶんより多く回す。
    // 打ち手は**エントリー以外**を選ぶ(ここで見たいのはリーグの決着)
    for (let i = 0; i < 40; i++) {
      await ctx.js(`document.querySelector('#tabs button[data-s="season"]').click()`);
      await ctx.wait(100);
      const playable = await ctx.js("!!document.getElementById('calGo')");
      if (!playable) break;
      await ctx.js("document.querySelector('#seasonCal .hand:not(.cup)').click()");
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
    // 全日程が終わると、次戦のタイルの代わりに「シーズンを終える」が出る
    ctx.log("節:", await ctx.js(
      "document.getElementById('homeNext').textContent.replace(/\s+/g,' ').slice(0,40)"));
    await ctx.shot("14-season-end");
    await ctx.js("document.getElementById('btnFinishSeason').click()");
    await ctx.wait(600);
    // **クラブは替わらない**。総括を見て次の部へ進む(→docs/03 §3.24)
    ctx.log("審判後の画面:", await ctx.screen(),
      "/", await ctx.js("document.getElementById('boardHead').textContent"),
      "/", await ctx.js("document.querySelector('#boardMove b').textContent"),
      "/ オーナー:", await ctx.js("document.querySelector('#boardOwner b').textContent"));
    await ctx.shot("15-board-review");
  }],
  ["昇降格して次のシーズンへ", async ctx => {
    const before = await ctx.js("S.club.id+':'+S.world.div+':'+S.world.season");
    await ctx.js("document.getElementById('boardGo').click()");
    await ctx.wait(700);
    ctx.log("次のシーズン:", await ctx.screen(),
      "/", before, "→", await ctx.js("S.club.id+':'+S.world.div+':'+S.world.season"));
    ctx.log("  同じクラブか:", await ctx.js(`(()=>{
      const h=S.player.history;
      if(h.length<2)throw new Error('在任記録が積まれていない');
      if(h[0].clubId!==h[1].clubId)throw new Error('シーズンをまたいでクラブが替わった');
      if(S.world.matchday!==1)throw new Error('節が1に戻っていない');
      // 3部とも8クラブのまま入れ替わっている
      const all=DIVS.flatMap(d=>divClubs(d));
      if(all.length!==24||new Set(all).size!==24)throw new Error('部の所属が壊れている');
      if(!divClubs().includes(S.club.id))throw new Error('自クラブが自分の部に居ない');
      return h[0].result+' → '+divName(S.world.div)+' / '+divClubs().length+'クラブ';
    })()`));
    await ctx.shot("16-next-division");
    // 順位表に昇格圏・降格圏が出る
    await ctx.js(`document.querySelector('#tabs button[data-s="season"]').click()`);
    await ctx.wait(200);
    await ctx.js(`document.querySelector('#seasonComps [data-comp="league"]').click()`);
    await ctx.wait(250);
    await ctx.js("document.getElementById('schedStandH').click()");
    await ctx.wait(300);
    ctx.log("  順位表:", await ctx.js("document.getElementById('standHead').textContent"),
      "/ 昇格圏", await ctx.js("document.querySelectorAll('#standTbl tr.up').length"),
      "/ 降格圏", await ctx.js("document.querySelectorAll('#standTbl tr.down').length"),
      "/", await ctx.js("document.getElementById('standNote').textContent"));
    await ctx.shot("16b-standings-zones");
    await ctx.js(`document.querySelector('#tabs button[data-s="home"]').click()`);
    await ctx.wait(200);
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
