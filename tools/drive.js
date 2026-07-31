#!/usr/bin/env node
/**
 * pftb を headless Chrome で起動し、画面を遷移させながらスクリーンショットを撮る。
 *
 *   node tools/drive.js                 # 既定のスモークフローを実行
 *   node tools/drive.js --out=<dir>     # スクリーンショットの出力先(既定: OSのtemp/pftb-shots)
 *   node tools/drive.js --port=9333     # DevTools のポート
 *   node tools/drive.js --keep          # 終了後もプロファイルを残す(状態を引き継いで再実行したいとき)
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
const PAGE = "file:///" + path.join(ROOT, "index.html").replace(/\\/g, "/");

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
    ctx.log("画面:", await ctx.screen());
    const fonts = await ctx.js(`(async()=>{await document.fonts.ready;return [...document.fonts].map(f=>f.family+':'+f.status).join(', ')})()`);
    ctx.log("フォント:", fonts);
    await ctx.shot("01-title");
  }],
  ["就任契約書へ", async ctx => {
    await ctx.js("document.getElementById('scr-title').click()");
    await ctx.wait(400);
    ctx.log("画面:", await ctx.screen(), "/ 締結日:", await ctx.js("document.getElementById('ctDate').textContent"));
    await ctx.shot("02-contract");
  }],
  ["未記入で署名(弾かれること)", async ctx => {
    await ctx.js("document.getElementById('ctSign').click()");
    await ctx.wait(300);
    ctx.log("画面:", await ctx.screen(), "/ toast:", await ctx.js("document.getElementById('toast').textContent"));
  }],
  ["記入して署名 → ホーム", async ctx => {
    await ctx.js(`document.getElementById('ctCoach').value='C. モレッティ';
                  document.getElementById('ctClub').value='AC SOLENNE';
                  document.getElementById('ctSign').click()`);
    await ctx.wait(600);
    ctx.log("画面:", await ctx.screen(), "/ ヘッダー:", await ctx.js("document.getElementById('hdClubName').textContent"));
    await ctx.shot("03-home");
  }],
  ["タブ巡回", async ctx => {
    for (const [tab, name] of [["cards", "04-cards"], ["deck", "05-deck"], ["season", "06-season"], ["clubhouse", "07-club"]]) {
      await ctx.js(`document.querySelector('#tabs button[data-s="${tab}"]').click()`);
      await ctx.wait(250);
      ctx.log(tab, "→", await ctx.screen(), "/", await ctx.js("document.getElementById('hdTitle').textContent"));
      await ctx.shot(name);
    }
  }],
  ["サブ画面と戻る", async ctx => {
    await ctx.js(`document.querySelector('#tabs button[data-s="season"]').click()`);
    await ctx.wait(200);
    await ctx.js("document.getElementById('btnSchedule').click()");
    await ctx.wait(300);
    ctx.log("画面:", await ctx.screen(),
      "/ 戻るボタン:", await ctx.js("!document.getElementById('hdBack').classList.contains('off')"),
      "/ 親タブ点灯:", await ctx.js(`document.querySelector('#tabs button[data-s="season"]').classList.contains('on')`));
    await ctx.shot("08-schedule");
    await ctx.js("document.getElementById('hdBack').click()");
    await ctx.wait(300);
    ctx.log("戻り先:", await ctx.screen());
  }],
  ["リロードして続きから", async ctx => {
    await ctx.reload();
    await ctx.wait(1500);
    ctx.log("タイトル注記:", await ctx.js("document.getElementById('tFoot').textContent"));
    await ctx.js("document.getElementById('scr-title').click()");
    await ctx.wait(600);
    ctx.log("画面:", await ctx.screen(), "/ クラブ:", await ctx.js("document.getElementById('hdClubName').textContent"));
    await ctx.shot("09-continue");
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
  // 端末枠(874px)+bodyの余白が収まる高さ。低いとタブバーが写らない。
  await send("Emulation.setDeviceMetricsOverride", { width: 440, height: 960, deviceScaleFactor: 1, mobile: false });

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
      if (r.exceptionDetails) throw new Error("JS評価に失敗: " + r.exceptionDetails.text);
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
