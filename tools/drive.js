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
      "/ 節タイル:", await ctx.js("!!document.getElementById('calCur')"),
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
      S.career.chat=null; S.career.hand=null; S.career.comp=null;
      renderSeason();
      // **エントリーはクラブチャットの中**(→docs/03 §3.29)
      show('chat');
      const yes=[...document.querySelectorAll('#chatAsk [data-pick]')].find(b=>b.dataset.pick==='yes');
      if(!yes)throw new Error('チャットにエントリーの選択肢が出ない');
      yes.click();
      // **エントリーしても打ち手は別に選ぶ**(→docs/03 §3.23)。会話が飛ばない
      if(S.career.chat.step!=='hand')
        throw new Error('エントリーの後に打ち手を聞いていない: '+S.career.chat.step);
      if(S.career.hand)throw new Error('エントリーが打ち手を埋めている: '+S.career.hand);
      renderSeason();                       // 予定はカレンダー側に出るので描き直す
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
    // 組み合わせ表の枠からも相手を下見できる(→docs/03 §3.34)。
    // **その回戦で当たったときの相手**が出る(回戦が上がるほど強くなる)
    ctx.log("  カップの下見:", await ctx.js(`(()=>{
      const rows=[...document.querySelectorAll('#schedList .br-row')];
      if(rows.some(r=>r.classList.contains('me')&&r.classList.contains('foe')))
        throw new Error('自クラブの枠が下見できてしまう');
      if(rows.some(r=>r.classList.contains('tbd')&&r.classList.contains('foe')))
        throw new Error('TBD の枠が下見できてしまう');
      return rows.filter(r=>r.classList.contains('foe')).length+'枠が下見できる';
    })()`));
    await ctx.js("document.querySelector('#schedList .br-row.foe').click()");
    await ctx.wait(500);
    ctx.log("  カップの相手:", await ctx.js(`(()=>{
      if(document.querySelector('.screen.on').id!=='scr-foe')throw new Error('下見に行けない');
      // **下見が嘘をつかないこと**。次戦の枠を開いたら、試合で出てくる11人と一致する
      const f=cupFixtureOf();
      if(!f)throw new Error('次戦が無い');
      openFoe({ kind:'cup', cup:f.cup, round:f.round, slot:f.foe });
      const shown=[...document.querySelectorAll('#foeSlots .sl-name')].map(e=>e.textContent);
      const real=f.side.cards.slice(0,11).map(c=>shortName(c));
      if(shown.join(',')!==real.join(','))
        throw new Error('下見と試合の11人が違う ／ 下見 '+shown.join(',')+' ／ 試合 '+real.join(','));
      return document.getElementById('foeName').textContent
        +' ／ '+document.getElementById('foeCoach').textContent
        +' ／ '+document.getElementById('foeForm').textContent.trim()
        +' ／ 試合に出てくる11人と一致';
    })()`));
    await ctx.shot("07m2-cup-foe");
    await ctx.js("document.getElementById('hdBack').click()");
    await ctx.wait(300);

    // 1回戦を戦うと**TBDが次の回戦ぶんだけ埋まる**
    // PK戦(→docs/03 §3.33)。引き分けたノックアウトはその場で決着を見せる
    ctx.log("  PK戦:", await ctx.js(`(()=>{
      // 引き分けになるたねを探して、その試合を画面に載せる
      const side=()=>matchSide(S.club.id);
      let seed=null;
      for(let i=1;i<200&&seed===null;i++){
        const M=finishMatch(createMatch(side(),side(),i,{ko:true}));
        if(M.pso)seed=i;
      }
      if(!seed)throw new Error('引き分けるたねが見つからない');
      _M=finishMatch(createMatch(side(),side(),seed,{ko:true}));
      _M.fixture={ h:S.club.id, a:null, cup:'kings', round:1, label:'テスト' };
      show('match'); mReset(); mFinish();
      const rows=document.querySelectorAll('#psoRows .pso-r');
      if(document.getElementById('psoBox').hidden)throw new Error('PK戦の欄が出ない');
      window.__psoWait=_M.events.filter(e=>e.type==='pso').length;
      return 'PK '+_M.pso.hg+'-'+_M.pso.ag+' / '+window.__psoWait+'本を1本ずつ表示';
    })()`));
    // 本数は毎回変わる(サドンデスもある)ので、**出そろうまで待つ**
    for (let i = 0; i < 40; i++) {
      // 決着の帯が出るのは**最後の1本のさらに次のコマ**なので、そこまで待つ
      const done = await ctx.js("!!document.getElementById('psoSum').textContent.trim()");
      if (done) break;
      await ctx.wait(700);
    }
    await ctx.wait(300);
    ctx.log("  PK戦の決着:", await ctx.js(`(()=>{
      const rows=document.querySelectorAll('#psoRows .pso-r').length;
      const sum=document.getElementById('psoSum').textContent.trim();
      if(rows!==window.__psoWait)throw new Error('全部出ていない: '+rows+'/'+window.__psoWait);
      if(!sum)throw new Error('決着が出ていない');
      if(document.getElementById('mDone').style.display==='none')
        throw new Error('結果へ進めない');
      return rows+'本 → '+sum.replace(/\s+/g,' ');
    })()`));
    await ctx.shot("07o-pso");
    await ctx.js("(()=>{mReset();show('season');})()");
    await ctx.wait(200);

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
      const fame0=S.player.fame;
      const closed=advanceNode();
      if(!closed||!closed.win)throw new Error('優勝で締まらない');
      // **賞金も名声も完了節に入る**(→docs/03 §3.9)
      if(closed.fame!==cup.fame[0])throw new Error('優勝の名声が入らない: '+closed.fame);
      if(S.player.fame-fame0!==closed.fame)throw new Error('名声が反映されていない');
      renderSchedule();
      const box=document.querySelector('.cup-res .lg').textContent;
      if(!box.includes('名声'))throw new Error('結果に名声が出ていない: '+box);
      return '優勝 '+S.career.cup.champ+' ／ 賞金 +'+(S.club.coins-coin0)
        +' ／ 名声 +'+closed.fame+' ／ 実績 '+S.player.trophies.length+'件';
    })()`));
    await ctx.shot("07n-cup-result");
    await ctx.js("Object.assign(S,JSON.parse(window.__snap)); save(); renderSeason()");
    await ctx.wait(200);

    await ctx.js("document.getElementById('hdBack').click()");
    await ctx.wait(300);

    // 試合は SEASON の任期カレンダーから始める(試合画面 → 再生 → 結果)
    // 節の進行は**クラブチャット**(→docs/03 §3.29)。秘書とのやり取りで打ち手まで決める
    await ctx.js("S.career.chat=null; S.career.hand=null; S.career.comp=null; renderSeason()");
    await ctx.js("document.getElementById('calCur').click()");
    await ctx.wait(400);
    ctx.log("クラブチャット:", await ctx.screen(),
      "/", await ctx.js("document.getElementById('chatSub').textContent"),
      "/ 発言", await ctx.js("document.querySelectorAll('#chatLog .ch-row').length"),
      "/ 選択肢", await ctx.js("document.querySelectorAll('#chatAsk [data-pick]').length"));
    await ctx.shot("05b-chat");
    ctx.log("  秘書との段取り:", await ctx.js(`(()=>{
      const pick=v=>{
        const b=[...document.querySelectorAll('#chatAsk [data-pick]')]
          .find(x=>v==null||x.dataset.pick===String(v))||document.querySelector('#chatAsk [data-pick]');
        if(!b)throw new Error('選択肢が出ていない: step='+S.career.chat.step);
        try{ b.click(); }catch(e){ throw new Error('選択で例外: '+e.message); }
        return b.textContent;
      };
      const steps=[];
      let guard=0;
      while(S.career.chat.step&&S.career.chat.step!=='ready'&&guard++<8){
        const st=S.career.chat.step;
        steps.push(st+':'+pick(st==='hand'?'train':null).slice(0,10));
      }
      if(S.career.chat.step!=='ready')throw new Error('準備完了まで進まない');
      if(!S.career.hand)throw new Error('打ち手が決まっていない');
      // **差し込みの取りこぼしが無いこと**(実際に「{t} をやろう。」が出ていた)
      const leak=S.career.chat.log.find(m=>/\{\w+\}/.test(m.t));
      if(leak)throw new Error('置き換え漏れ: '+leak.t);
      // **監督は単語で返さない**。文になっているか
      const said=S.career.chat.log.filter(m=>m.w==='mgr');
      const word=said.find(m=>!/[。！？]$/.test(m.t));
      if(word)throw new Error('監督が単語で返している: '+word.t);
      if(!document.getElementById('chatGo'))throw new Error('試合へ向かうボタンが無い');
      // **訓練は経験点になる**(→docs/03 §3.30)
      const sel=S.career.chat.sel, t=trainById(sel.menu);
      const got=trainExp(sel.who,t.stat);
      if(sel.res!=='fail'&&!got)throw new Error('成功したのに経験点が入っていない');
      if(sel.res==='fail'&&sel.gain)throw new Error('失敗なのに経験点が入っている');
      const G=TUNING.train;
      if(sel.gain&&(sel.gain<G.okLo||sel.gain>G.greatHi))
        throw new Error('経験点の幅が定義外: '+sel.gain);
      return steps.join(' → ')+' / 打ち手 '+S.career.hand
        +' / '+t.stat.toUpperCase()+' '+sel.res+' +'+(sel.gain||0)+'(累計'+got+')';
    })()`));
    await ctx.wait(200);
    await ctx.shot("05c-chat-ready");
    // 交流と休息の分岐(→docs/03 §3.29)。交流は相方をもう1人選ぶ / 休息は選択肢なし
    ctx.log("  交流と休息:", await ctx.js(`(()=>{
      const run=hand=>{
        S.career.chat=null; S.career.hand=null; S.career.comp=null;
        renderChat();
        const steps=[];
        let guard=0;
        while(S.career.chat.step&&S.career.chat.step!=='ready'&&guard++<8){
          const st=S.career.chat.step;
          const bs=[...document.querySelectorAll('#chatAsk [data-pick]')];
          const b=st==='cup'?bs.find(x=>x.dataset.pick==='no')
            :st==='hand'?bs.find(x=>x.dataset.pick===hand):bs[0];
          if(!b)throw new Error(hand+' の '+st+' で選択肢が出ない');
          b.click(); renderChat();
          steps.push(st);
        }
        if(S.career.chat.step!=='ready')throw new Error(hand+' が準備完了まで進まない');
        return hand+'['+steps.join('>')+']';
      };
      const bond=run('bond'), rest=run('rest');
      // 交流は who と who2 の2人、休息はどちらも聞かれない
      if(!bond.includes('who>who2'))throw new Error('交流で相方を聞いていない: '+bond);
      if(rest.includes('who'))throw new Error('休息で選手を聞いている: '+rest);
      const sel=S.career.chat.sel;
      if(sel.hand!=='rest')throw new Error('打ち手が反映されていない');
      return bond+' / '+rest;
    })()`));
    await ctx.wait(200);
    await ctx.shot("05d-chat-rest");
    // ケガと休息(→docs/03 §3.32)。治療中なら CLUB NEWS と秘書が知らせる
    ctx.log("  ケガと休息:", await ctx.js(`(()=>{
      const id=S.squad.find(Boolean), C=TUNING.cond;
      S.career.cond={}; S.career.hurt={};
      const left=condInjure(id,mulberry32(7));
      if(condOf(id)!==0)throw new Error('ケガの段にならない');
      // CLUB NEWS に「治療中」が出る
      show('home');
      const news=document.getElementById('homeNews').textContent;
      if(!news.includes('治療中'))throw new Error('CLUB NEWS に治療中が出ない');
      if(!news.includes(left+'節'))throw new Error('回復までの節数が出ない: '+news.slice(0,40));
      // 秘書が休息を促す
      S.career.chat=null; S.career.hand=null; S.career.comp=null;
      show('chat');
      let g=0;
      while(S.career.chat.step&&S.career.chat.step!=='hand'&&g++<4){
        const bs=[...document.querySelectorAll('#chatAsk [data-pick]')];
        ((bs.find(x=>x.dataset.pick==='no'))||bs[0]).click(); renderChat();
      }
      if(!S.career.chat.log.some(m=>m.t.includes('治療中')))
        throw new Error('秘書が休息を促していない');
      // 休息するとケガが治る
      document.querySelector('#chatAsk [data-pick="rest"]').click(); renderChat();
      if(condOf(id)!==1)throw new Error('休息でケガが1段よくならない: '+condOf(id));
      if(hurtList().length)throw new Error('治療中から外れていない');
      // 差し込みの取りこぼしが無いこと(実際に {h} が残っていた)
      const bad=S.career.chat.log.find(m=>/\{[a-z]\}/.test(m.t));
      if(bad)throw new Error('置き換え漏れ: '+bad.t);
      S.career.cond={}; S.career.hurt={};
      return '治療'+left+'節 → CLUB NEWS と秘書が知らせ、休息で復帰';
    })()`));
    await ctx.wait(200);
    await ctx.shot("05g-chat-rest-heal");

    // 覚醒イベント(→docs/03 §3.30)。経験点を積んでから呼ぶと2択になる
    ctx.log("  覚醒:", await ctx.js(`(()=>{
      const G=TUNING.train, id=S.squad.find(Boolean);
      S.career.train={}; trainAdd(id,'tec',G.need);
      S.career.chat=null; S.career.hand=null; S.career.comp=null;
      renderChat();
      const pick=want=>{
        const bs=[...document.querySelectorAll('#chatAsk [data-pick]')];
        const b=(want&&bs.find(x=>x.dataset.pick===want))||bs[0];
        if(!b)throw new Error('選択肢が無い: '+S.career.chat.step);
        b.click(); renderChat(); return b;
      };
      // **選手を選ぶ段まで進める**(カップの開催節かどうかで段の数が変わる)
      let guard=0;
      while(S.career.chat.step&&S.career.chat.step!=='who'&&guard++<6){
        const st=S.career.chat.step;
        pick(st==='cup'?'no':st==='hand'?'train':null);
      }
      if(S.career.chat.step!=='who')throw new Error('選手を選ぶ段に来ない: '+S.career.chat.step);
      // 覚醒する選手は一覧で「覚醒」と分かる
      // **一覧に★とチャンスが並ぶ**(→docs/03 §3.30)
      const other=S.squad.filter(Boolean).find(x=>x!==id);
      if(other)trainAwake(other,'pow');            // ★を持つ選手を1人作る
      renderChat();
      const rows=[...document.querySelectorAll('#chatAsk [data-pick]')];
      const row=rows.find(b=>b.dataset.pick===String(id));
      if(!row)throw new Error('選手一覧に居ない');
      // **合図は枠の光だけ**(文字では書かない → docs/03 §3.30)
      if(!row.classList.contains('hot'))throw new Error('覚醒できる選手の枠が光らない');
      if(row.textContent.includes('覚醒'))throw new Error('「覚醒」と書いてしまっている');
      if(!row.querySelector('.gl-abbr'))throw new Error('段のタグが無い');
      const starRow=rows.find(b=>b.dataset.pick===String(other));
      if(other&&(!starRow||!starRow.querySelector('.awk')))
        throw new Error('一覧に★が並んでいない');
      window.__whoList='★あり '+(starRow?starRow.querySelector('.awk').textContent:'-')
        +' / 覚醒 '+rows.filter(b=>b.classList.contains('hot')).length+'人';
      row.click(); renderChat();
      // 監督の発言は名前だけ(★は口に出さない)
      const said=S.career.chat.log.filter(m=>m.w==='mgr').pop();
      if(said&&said.t.includes('★'))throw new Error('★まで発言している: '+said.t);
      // 通常のメニューではなく2択が出る
      const opts=[...document.querySelectorAll('#chatAsk [data-pick]')];
      if(opts.length!==AWAKES.length)
        throw new Error('覚醒の2択ではない: '+opts.length+'択');
      if(!S.career.chat.log.some(m=>m.t===CHAT.awakeAsk))
        throw new Error('覚醒の台詞が出ていない');
      const star0=trainStar(id), exp0=trainExp(id,'tec');
      opts[0].click(); renderChat();
      const res=S.career.chat.sel.res;
      if(res==='awake'){
        if(trainStar(id)!==star0+1)throw new Error('★が増えていない');
        if(trainUp(id,'tec')!==1)throw new Error('裏パラが上がっていない');
        if(trainExp(id,'tec')!==0)throw new Error('経験点が戻っていない');
      }else{
        if(trainStar(id)!==star0)throw new Error('失敗なのに★が増えた');
        if(trainExp(id,'tec')!==exp0)throw new Error('失敗で経験点が消えた');
      }
      return (res==='awake'?'成功 ★'+trainStar(id)+' / TEC裏+'+trainUp(id,'tec')
        :'失敗 経験点 '+trainExp(id,'tec')+' を保留')+' ／ '+opts.length+'択'
        +' ／ 一覧 '+window.__whoList;
    })()`));
    await ctx.wait(200);
    await ctx.shot("05e-chat-awake");
    // 選手を選ぶ一覧(★と覚醒が並ぶ)
    await ctx.js(`(()=>{
      const G=TUNING.train, id=S.squad.find(Boolean);
      const other=S.squad.filter(Boolean).find(x=>x!==id);
      S.career.train={}; trainAdd(id,'tec',G.need);
      if(other){ trainAwake(other,'pow'); trainAwake(other,'atk'); }
      S.career.chat=null; S.career.hand=null; S.career.comp=null;
      renderChat();
      let g=0;
      while(S.career.chat.step&&S.career.chat.step!=='who'&&g++<6){
        const st=S.career.chat.step;
        const bs=[...document.querySelectorAll('#chatAsk [data-pick]')];
        const want=st==='cup'?'no':st==='hand'?'train':null;
        ((want&&bs.find(x=>x.dataset.pick===want))||bs[0]).click(); renderChat();
      }
    })()`);
    await ctx.wait(250);
    await ctx.shot("05f-chat-who");
    // ★はカードの名前の右に出る。**表示の数値は変えない**(→docs/03 §3.30)
    ctx.log("  覚醒の★:", await ctx.js(`(()=>{
      const id=S.squad.find(Boolean), c=cardById(id);
      const tec0=c.tec;
      trainAwake(id,'tec'); trainAwake(id,'atk');
      openCard(cardById(id));
      const nm=document.querySelector('.pc-name .awk');
      const star=nm?nm.textContent:'';
      if(star.length!==trainStar(id))throw new Error('★の数が合わない: "'+star+'"');
      // 内訳は**バーの右の★**で読む(→docs/03 §3.30)。枠に文字で書き出さない
      if(cardById(id).tec!==tec0)throw new Error('カードの数値が変わっている');
      const tec=[...document.querySelectorAll('.bars .bar')]
        .find(b=>b.textContent.indexOf('TEC')===0);
      if(tec.querySelector('s').textContent!=='★')
        throw new Error('TECの★が1つになっていない');
      S.career.train={};
      return '★'+star.length+' ／ 表示 '+tec0+' のまま ／ 内訳はバー右の★';
    })()`));
    await ctx.js("(()=>{S.career.chat=null;show('season');})()");
    await ctx.wait(200);
    // 訓練に戻してから試合へ
    await ctx.js(`(()=>{
      S.career.chat=null; S.career.hand=null; S.career.comp=null; renderChat();
      let guard=0;
      while(S.career.chat.step&&S.career.chat.step!=='ready'&&guard++<8){
        const bs=[...document.querySelectorAll('#chatAsk [data-pick]')];
        const st=S.career.chat.step;
        const b=st==='cup'?bs.find(x=>x.dataset.pick==='no')
          :st==='hand'?bs.find(x=>x.dataset.pick==='train'):bs[0];
        b.click(); renderChat();
      }
    })()`);
    await ctx.wait(200);
    await ctx.js("document.getElementById('chatGo').click()");
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
    // 采配(→docs/03 §3.28)。**交代の反対側**のタブ。開くと止まり、選ぶと閉じて再開する
    ctx.log("  采配タブ:", await ctx.js(`(()=>{
      const tab=document.getElementById('ordTab');
      if(!tab||tab.classList.contains('off'))throw new Error('指示タブが出ていない');
      const r=tab.getBoundingClientRect(), sr=document.getElementById('subTab').getBoundingClientRect();
      if(r.left>=sr.left)throw new Error('指示タブが交代タブの反対側にない');
      tab.click();
      if(!document.getElementById('ordDrawer').classList.contains('on'))throw new Error('開かない');
      if(!_mPaused)throw new Error('開いても試合が止まらない');
      const btns=[...document.querySelectorAll('#ordPad .od-b')];
      if(btns.length!==ORDERS.length)throw new Error('指示の数が合わない: '+btns.length);
      return btns.length+'手 / 指示タブ x='+Math.round(r.left)+' 交代タブ x='+Math.round(sr.left);
    })()`));
    await ctx.wait(450);                       // 引き出しが出切るまで待つ
    await ctx.shot("07l-order");
    ctx.log("  指示を出す:", await ctx.js(`(()=>{
      document.querySelector('#ordPad [data-ord="attack"]').click();
      if(document.getElementById('ordDrawer').classList.contains('on'))throw new Error('閉じない');
      if(_mPaused)throw new Error('再開しない');
      if(S.order!=='attack')throw new Error('指示が保存されていない');
      // **次のティックの頭で効く**(再開したループが先に1ティック進めることもある)。
      // 元の縦位置 y0 と比べる
      const T=_M.home.side===mMine()?_M.home:_M.away;
      stepMatch(_M);
      if(T.order!=='attack')throw new Error('チームに反映されない');
      const moved=T.players.filter(p=>p.role!=='GK'&&p.y<p.y0).length;
      const gk=T.players.filter(p=>p.role==='GK'&&p.y!==p.y0).length;
      if(moved<8)throw new Error('陣形が上がっていない: '+moved+'人');
      if(gk)throw new Error('GKまで前に出ている');
      return 'attack / 前に出た '+moved+'人 / ATK×'+TUNING.order.buf;
    })()`));
    await ctx.wait(500);
    await ctx.shot("07l2-order-attack");
    ctx.log("  指示を解除:", await ctx.js(`(()=>{
      document.getElementById('ordTab').click();
      document.querySelector('#ordPad [data-ord="attack"]').click();
      stepMatch(_M);
      const T=_M.home.side===mMine()?_M.home:_M.away;
      if(T.order)throw new Error('解除できない');
      return '指示なしに戻る';
    })()`));
    await ctx.wait(300);
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
      `[...document.querySelectorAll('#deckKickers .kk')].map(k=>k.querySelector('.cap-band').textContent+':'+k.querySelector('.cap-nm').textContent+'('+k.querySelector('.cap-sub').textContent.trim()+')').join(' / ')`));
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
      return k.querySelector('.cap-nm').textContent+' / '+k.querySelector('.cap-sub').textContent.trim();
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
        // 数値は**適性を掛けた実効値**。素のOVRだと不一致の選手のほうが大きく見える
        const disc = await ctx.js(`(()=>{
          const slots=FORMATIONS[S.form], cards=squadCards();
          return slots.map(([sub],i)=>{ const c=cards[i]; if(!c)return null;
            const el=document.querySelector('#deckSlots .slot[data-slot="'+i+'"]');
            const shown=+el.querySelector('.sl-ovr').textContent.replace(/[^0-9]/g,'');
            // **丸ではなく立ち絵**(→docs/06 §6.15)。貸与の C は編成では出さない
            const fig=el.querySelector('.sl-fig img');
            if(!fig)throw new Error('立ち絵が出ていない: 枠'+i);
            if(el.querySelector('.sl-loan'))throw new Error('貸与のCが残っている: 枠'+i);
            return { ok: shown===Math.round(c.ovr*slotFit(c,sub)), raw:c.ovr, shown };
          }).filter(Boolean);
        })()`);
        const bad = disc.filter(d => !d.ok);
        ctx.log("  枠の数値:", disc.map(d => d.raw + "→" + d.shown).join(" "),
          "/ 実効値になっている:", bad.length === 0);
        if (bad.length) throw new Error("枠の数値が実効値でない: " + JSON.stringify(bad));
        // 控え・キャプテン・セットプレー担当も立ち絵(→docs/06 §6.15)
        ctx.log("  立ち絵:", await ctx.js(`(()=>{
          const n=s=>document.querySelectorAll(s).length;
          const bn=n('#deckBench .bn:not(.empty) .bn-fig img');
          const cap=n('#deckCaptain .cap-fig img'), kk=n('#deckKickers .cap-fig img');
          if(!bn)throw new Error('控えが立ち絵でない');
          if(!cap)throw new Error('キャプテンが立ち絵でない');
          if(kk!==3)throw new Error('セットプレー担当が立ち絵でない: '+kk);
          // **キャプテンと同じタイル**であること(→docs/06 §6.15)
          if(n('#deckKickers .ptile')!==3)throw new Error('タイル型になっていない');
          if(!n('#deckCaptain .ptile'))throw new Error('キャプテンがタイルでない');
          return '控え'+bn+'人 / CAP'+cap+' / キッカー'+kk+' / 同じタイル';
        })()`));
        // 連携の線(→docs/03 §3.31)。**しきい値を超えた組だけ**が結ばれる
        ctx.log("  連携の線:", await ctx.js(`(()=>{
          const B=TUNING.bond, ids=S.squad.slice(0,TUNING.squad.starters).filter(Boolean);
          S.career.bond={};
          renderDeck();
          if(document.querySelectorAll('#deckLinks line').length)
            throw new Error('連携が無いのに線が出ている');
          // 3組だけ、段をずらして結ぶ
          bondAdd(ids[0],ids[1],Math.ceil((B.t1+2)/2));
          bondAdd(ids[2],ids[3],Math.ceil((B.t2+2)/2));
          bondAdd(ids[4],ids[5],Math.ceil((B.t3+2)/2));
          renderDeck();
          const cls=[...document.querySelectorAll('#deckLinks line')]
            .map(e=>e.getAttribute('class')).sort();
          if(cls.length!==3)throw new Error('線の数が合わない: '+cls.length);
          if(cls.join(',')!=='lk t1,lk t2,lk t3')throw new Error('太さの段が違う: '+cls);
          const w=cls.map(c=>getComputedStyle(
            document.querySelector('#deckLinks .'+c.split(' ')[1])).strokeWidth);
          // **線の端が本当にその選手の上にあるか**を実測する
          const at=k=>{
            const el=document.querySelector('#deckSlots .slot[data-slot="'+k+'"]');
            const r=el.getBoundingClientRect();
            return { x:r.left+r.width/2, y:r.top+r.height/2 };
          };
          const svg=document.getElementById('deckLinks');
          const sr=svg.getBoundingClientRect();
          const pt=(vx,vy)=>({ x:sr.left+sr.width*vx/100, y:sr.top+sr.height*vy/100 });
          const want=[[0,1],[2,3],[4,5]];
          const lines=[...svg.querySelectorAll('line')];
          const bad=[];
          want.forEach(([i,j])=>{
            const A=at(i), Bp=at(j);
            const hit=lines.find(l=>{
              const p1=pt(+l.getAttribute('x1'),+l.getAttribute('y1'));
              const p2=pt(+l.getAttribute('x2'),+l.getAttribute('y2'));
              const d=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
              return (d(p1,A)<14&&d(p2,Bp)<14)||(d(p1,Bp)<14&&d(p2,A)<14);
            });
            if(!hit)bad.push(i+'-'+j);
          });
          if(bad.length)throw new Error('線が選手を結んでいない: '+bad.join(' ')
            +' / 枠の中心 '+want.map(([i])=>Math.round(at(i).x)+','+Math.round(at(i).y)).join(' ')
            +' / 線の端 '+lines.map(l=>l.getAttribute('x1')+','+l.getAttribute('y1')).join(' '));
          return '3本 / 太さ '+w.join(' < ')+' / 端点が枠の中心に一致';
        })()`));
        await ctx.wait(200);
        await ctx.shot("10j-deck-links");
        await ctx.js("(()=>{S.career.bond={};renderDeck();})()");
        // 控えは**5枠が画面幅に収まる**(→docs/06 §6.15)
        ctx.log("  控えの並び:", await ctx.js(`(()=>{
          const wrap=document.getElementById('deckBench');
          const r=wrap.getBoundingClientRect();
          const bs=[...wrap.querySelectorAll('.bn')];
          if(bs.length!==TUNING.squad.bench)throw new Error('控えの枠が5つでない');
          if(wrap.scrollWidth>Math.ceil(r.width)+1)
            throw new Error('横にはみ出している: '+wrap.scrollWidth+' > '+Math.round(r.width));
          const last=bs[bs.length-1].getBoundingClientRect();
          if(last.right>r.right+1)throw new Error('5人目が枠の外に出ている');
          // ピッチのすぐ下に居ること
          const pitch=document.getElementById('deckPitch').getBoundingClientRect();
          const row=[...document.querySelectorAll('#scr-deck .row')][0].getBoundingClientRect();
          if(!(r.top>pitch.bottom&&r.top<row.top))
            throw new Error('控えがピッチの直下にない');
          return bs.length+'枠 / 幅 '+Math.round(r.width)+'px に収まる / ピッチ直下';
        })()`));
        // 控え・CAP・キッカーは画面の下側にあるので、送って撮る
        await ctx.js("document.getElementById('appBody').scrollTop=99999");
        await ctx.wait(250);
        await ctx.shot("10i-deck-bench");
        await ctx.js("document.getElementById('appBody').scrollTop=0");
        await ctx.wait(150);
        // 覚醒の★は名前の下に出る
        ctx.log("  ★の位置:", await ctx.js(`(()=>{
          const id=S.squad.find(Boolean);
          trainAwake(id,'atk'); trainAwake(id,'tec'); renderDeck();
          const slot=[...document.querySelectorAll('#deckSlots .slot')]
            .find(e=>+e.dataset.card===id);
          const st=slot&&slot.querySelector('.fig-star');
          if(!st)throw new Error('★が出ていない');
          const nm=slot.querySelector('.sl-name');
          if(nm.compareDocumentPosition(st)!==Node.DOCUMENT_POSITION_FOLLOWING)
            throw new Error('★が名前の下にない');
          S.career.train={}; renderDeck();
          return '名前の下に '+st.textContent;
        })()`));
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
        // 経験点は**バーそのものを左から塗って**見せる(→docs/03 §3.30)。数字を並べると
        // 能力に足されているように読め、細い線＋添え書きは説明しないと伝わらなかった
        ctx.log("  経験点の見え方:", await ctx.js(`(()=>{
          const id=S.player.coll[0]&&S.player.coll[0].id;
          if(!id)throw new Error('手持ちカードが無い');
          const body=document.getElementById('cardModalBody');
          const bar=()=>[...body.querySelectorAll('.bar')].find(b=>b.textContent.indexOf('TEC')===0);
          S.career.train={}; trainAdd(id,'tec',9);
          openCard(cardById(id));
          if(body.className.indexOf('holo')>=0)
            throw new Error('詳細シートにホロが掛かっている: '+body.className);
          if(body.querySelector('.cm-note'))throw new Error('添え書きが残っている');
          if(body.querySelector('.cm-awk'))throw new Error('覚醒の枠が残っている');
          const u=body.querySelector('.bar .tr u');
          if(!u)throw new Error('経験点の塗りが出ていない');
          if(u.style.width!=='90%')throw new Error('経験点9/10が90%になっていない: '+u.style.width);
          if(body.querySelector('.bar .tr em'))throw new Error('目盛りが残っている');
          const num=bar().querySelector('b').textContent.trim();
          if(num!==String(cardById(id).tec))
            throw new Error('能力欄に余計な文字がある: "'+num+'"');
          if(bar().querySelector('.tr.rdy'))throw new Error('9点で満タンの光が出ている');
          if(body.querySelector('.bars s'))throw new Error('★が無いのに枠が出ている');
          // 満タン=覚醒できる合図。バーが光る
          document.getElementById('cardModalClose').click();
          trainAdd(id,'tec',1); openCard(cardById(id));
          if(!bar().querySelector('.tr.rdy'))throw new Error('満タンなのに光っていない');
          if(bar().querySelector('.tr u').style.width!=='100%')throw new Error('満タンで塗り切れていない');
          // 覚醒すると★がバーの右に伸び、経験点は0に戻る
          document.getElementById('cardModalClose').click();
          trainAwake(id,'tec'); trainAwake(id,'tec'); openCard(cardById(id));
          const st=bar().querySelector('s');
          if(!st||st.textContent!=='★★')throw new Error('★がバーの右に出ていない: '+(st&&st.textContent));
          // **★のために桁を空けない**。覚醒していない能力の行には要素ごと出ない
          const atk=[...body.querySelectorAll('.bar')].find(b=>b.textContent.indexOf('ATK')===0);
          if(atk.querySelector('s'))throw new Error('覚醒していない能力に★の枠が出ている');
          if(getComputedStyle(st).position!=='absolute')throw new Error('★がバーに重なっていない');
          return '9点=90%塗り / 満タンで発光 / ★★はTECのバーの上だけ';
        })()`));
        // **目で見る**: 塗りかけ・満タンの発光・★の並びが1枚に収まった状態を撮る
        await ctx.js(`(()=>{
          const id=S.player.coll[0].id;
          trainAdd(id,'atk',10); trainAdd(id,'spd',4); trainAdd(id,'def',7);
          openCard(cardById(id));
        })()`);
        await ctx.wait(400);
        await ctx.shot("09g-exp-bar");
        await ctx.js("(()=>{document.getElementById('cardModalClose').click();S.career.train={};})()");
        await ctx.wait(200);
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
    // 右端の柱(→docs/06 §6.16)。契約と日程はSEASONにいる間だけ生える
    ctx.log("  右端の柱:", await ctx.js(`(()=>{
      const on=[...document.querySelectorAll('#sideTabs > div')]
        .filter(t=>!t.classList.contains('off')).map(t=>t.textContent);
      if(on.join('/')!=='契約/日程/HELP')throw new Error('柱の並びが違う: '+on.join('/'));
      return on.join(' → ');
    })()`));
    await ctx.js("document.getElementById('contractTab').click()");
    await ctx.wait(400);
    ctx.log("  契約タブ:", await ctx.js(`(()=>{
      if(!document.getElementById('sideDrawer').classList.contains('on'))
        throw new Error('引き出しが開かない');
      if(document.getElementById('seasonComps').hidden===false)
        throw new Error('契約なのに大会が出ている');
      return document.getElementById('sideTitle').textContent
        +' / '+document.querySelectorAll('#seasonBox .kv').length+'項目';
    })()`));
    await ctx.shot("12c-tab-contract");
    // 別のタブを押したら中身が入れ替わる(いったん閉じなくてよい)
    await ctx.js("document.getElementById('compTab').click()");
    await ctx.wait(400);
    ctx.log("  日程タブ:", await ctx.js(`(()=>{
      if(document.getElementById('seasonBox').hidden===false)
        throw new Error('大会なのに契約が出ている');
      return document.getElementById('sideTitle').textContent
        +' / '+document.querySelectorAll('#seasonComps [data-comp]').length+'件';
    })()`));
    await ctx.shot("12d-tab-comps");
    // **進行バーは上に貼り付く**。記録をどこまで送っても任期の現在地が見えている
    ctx.log("  進行バーの追従:", await ctx.js(`(()=>{
      const body=document.getElementById('appBody'), bar=document.getElementById('tenureBar');
      const top0=bar.getBoundingClientRect().top;
      body.scrollTop=600;
      const top1=bar.getBoundingClientRect().top;
      const headBottom=document.getElementById('appHead').getBoundingClientRect().bottom;
      if(top1<headBottom-1)throw new Error('進行バーがヘッダーの下に隠れた');
      if(top1>top0+1)throw new Error('進行バーが動いていない(貼り付いていない?)');
      return '600px送って '+Math.round(top0)+'px → '+Math.round(top1)+'px で止まる';
    })()`));
    await ctx.shot("12e-sticky-bar");
    await ctx.js("document.getElementById('appBody').scrollTop=0");
    await ctx.wait(200);
    await ctx.js(`document.querySelector('#seasonComps [data-comp="league"]').click()`);
    await ctx.wait(300);
    if(await ctx.js("document.getElementById('sideDrawer').classList.contains('on')"))
      throw new Error('画面が変わったのに引き出しが開いたまま');
    ctx.log("画面:", await ctx.screen(),
      "/ 戻るボタン:", await ctx.js("!document.getElementById('hdBack').classList.contains('off')"),
      "/ 親タブ点灯:", await ctx.js(`document.querySelector('#tabs button[data-s="season"]').classList.contains('on')`));
    ctx.log("日程の消化行:", await ctx.js("document.querySelectorAll('#schedList .cal.done').length"));
    // 対戦表から相手の下見へ(→docs/03 §3.34)。**編成画面と同じ形**で出る
    await ctx.js("document.querySelector('#schedList .cal.foe').click()");
    await ctx.wait(500);
    ctx.log("  相手の下見:", await ctx.js(`(()=>{
      if(document.querySelector('.screen.on').id!=='scr-foe')throw new Error('下見に行けない');
      const n=document.querySelectorAll('#foeSlots .slot').length;
      const b=document.querySelectorAll('#foeBench .bn').length;
      const k=document.querySelectorAll('#foeKickers .kk').length;
      if(n!==11)throw new Error('ピッチが11人でない: '+n);
      if(b!==TUNING.squad.bench)throw new Error('控えの数が編成画面と違う: '+b);
      if(k!==3)throw new Error('セットプレーの枠が3つでない: '+k);
      if(document.querySelector('#foePitch .pt-links'))throw new Error('連携線が出ている');
      if(!/^監督 /.test(document.getElementById('foeCoach').textContent))
        throw new Error('監督名が出ていない: '+document.getElementById('foeCoach').textContent);
      // **下見が嘘をつかないこと**。試合エンジンに渡る11人と並びまで一致する
      const shown=[...document.querySelectorAll('#foeSlots .sl-name')].map(e=>e.textContent);
      const id=document.querySelector('#schedList .cal.foe').dataset.club;
      const real=matchSide(id).cards.slice(0,11).map(c=>shortName(c));
      if(shown.join(',')!==real.join(','))
        throw new Error('下見と試合の11人が違う: '+shown.join(',')+' / '+real.join(','));
      return document.getElementById('foeName').textContent
        +' ／ '+document.getElementById('foeCoach').textContent
        +' ／ '+document.getElementById('foeForm').textContent.trim()
        +' ／ 総合 '+document.getElementById('foePower').textContent;
    })()`));
    await ctx.shot("13b-foe-squad");
    // 選手をタップすると詳細が開き、**相手の選手だと分かる**
    await ctx.js("document.querySelector('#foeSlots .slot').click()");
    await ctx.wait(400);
    ctx.log("  相手の選手カード:", await ctx.js(`(()=>{
      const own=document.querySelector('.cm-own');
      if(!own)throw new Error('カード詳細が開かない');
      if(own.textContent.indexOf('自分のカード')>=0)throw new Error('自分のカード扱いになっている');
      return own.textContent.trim();
    })()`));
    await ctx.shot("13c-foe-card");
    await ctx.js("document.getElementById('cardModalClose').click()");
    await ctx.wait(200);
    // 同じ相手をもう一度開いても同じ11人(決定的に作られている)
    ctx.log("  下見は決定的:", await ctx.js(`(()=>{
      const nm=()=>[...document.querySelectorAll('#foeSlots .sl-name')].map(e=>e.textContent).join(',');
      const a=nm(); renderFoe(); const b=nm();
      if(a!==b)throw new Error('開くたびに11人が変わる');
      return a.split(',').slice(0,3).join(' / ')+' … 何度開いても同じ';
    })()`));
    await ctx.js("document.getElementById('hdBack').click()");
    await ctx.wait(300);
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
      const playable = await ctx.js("!!document.getElementById('calCur')");
      if (!playable) break;
      // チャットを一気に進める(選択肢は先頭を選び、カップは見送る)
      await ctx.js(`(()=>{
        S.career.chat=null; show('chat');
        let guard=0;
        while(S.career.chat.step&&S.career.chat.step!=='ready'&&guard++<8){
          const st=S.career.chat.step;
          const want=st==='cup'?'no':null;
          const bs=[...document.querySelectorAll('#chatAsk [data-pick]')];
          const b=(want&&bs.find(x=>x.dataset.pick===want))||bs[0];
          if(!b)break;
          b.click();
        }
      })()`);
      await ctx.wait(80);
      await ctx.js("(()=>{const g=document.getElementById('chatGo'); if(g)g.click();})()");
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
