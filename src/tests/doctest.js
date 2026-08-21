// ================= ドキュメントの検査 =================
// docs は**コードから参照される**(「→docs/03 §3.54」の形)。
// 番号が重複したり、リンクが切れたり、参照先が消えたりすると、
// **読み手が別の節に連れていかれる**。人が気づけないので機械で見張る。
"use strict";
const assert = require("assert");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..", "..");
const DOCS = path.join(ROOT, "docs");
const files = fs.readdirSync(DOCS).filter(f => f.endsWith(".md"));
const text = Object.fromEntries(files.map(f =>
  [f, fs.readFileSync(path.join(DOCS, f), "utf8")]));

// ---------- 節の見出しを集める ----------
// 「### 3.54b タイトル」の形。番号は**文書をまたいで参照される識別子**なので、
// 同じ文書の中で重複してはいけない
const heads = {};                       // ファイル → Set(節番号)
for (const f of files) {
  const seen = new Map();
  // **見出しの深さは揃っていない**。08 は ## を節に使い、3.2.2 は #### で書かれている。
  // 番号が識別子なので、深さに関係なく「番号つきの見出し」を全部拾う
  for (const m of text[f].matchAll(/^#{2,4} (\d+(?:\.\d+)+[a-z]?) (.*)$/gm)) {
    const n = m[1], title = m[2].trim();
    if (seen.has(n))
      assert.fail(f + " に節 " + n + " が2つある:\n    " + seen.get(n) + "\n    " + title);
    seen.set(n, title);
  }
  heads[f] = seen;
}
const total = Object.values(heads).reduce((n, m) => n + m.size, 0);
console.log("節の番号OK", files.length, "文書 /", total, "節 / 重複なし");

// ---------- 文書どうしのリンク ----------
let links = 0;
for (const f of files) {
  for (const m of text[f].matchAll(/\]\((\d\d-[a-z0-9-]+\.md)(#[^)]*)?\)/g)) {
    links++;
    assert.ok(files.includes(m[1]), f + " のリンク先が無い: " + m[1]);
  }
}
console.log("文書リンクOK", links, "本 / 切れなし");

// ---------- コードからの参照(→docs/NN §X.Y) ----------
// **番号だけの参照も拾う**(「→§3.54」)。同じ文書の中を指している
const SRC = ["src/js", "src/css", "src/tests", "tools"];
const code = [];
const walk = d => {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) { if (e.name !== "__pycache__") walk(p); continue; }
    if (!/\.(js|css|py)$/.test(e.name) || e.name.startsWith("_tmp_")) continue;
    code.push(p);
  }
};
for (const d of SRC) walk(path.join(ROOT, d));

const docOf = n => files.find(f => f.startsWith(String(n).padStart(2, "0") + "-"));
const bad = [];
let refs = 0;
for (const p of code) {
  const s = fs.readFileSync(p, "utf8");
  const rel = path.relative(ROOT, p).split(path.sep).join("/");
  // 「docs/03 §3.54」「docs/03-game-design.md §3.54」の形
  for (const m of s.matchAll(/docs\/(\d\d)[a-z0-9-]*(?:\.md)?\s*§(\d+(?:\.\d+)+[a-z]?)/g)) {
    refs++;
    const f = docOf(m[1]);
    if (!f) { bad.push(rel + " → docs/" + m[1] + " という文書が無い"); continue; }
    if (!heads[f].has(m[2])) bad.push(rel + " → " + f + " に §" + m[2] + " が無い");
  }
}
assert.ok(!bad.length, "参照先が無い(" + bad.length + "件):\n  " + bad.slice(0, 12).join("\n  "));
console.log("コードからの参照OK", refs, "件 / すべて実在する節を指している");

// ---------- 決定台帳(→docs/05) ----------
// **決定は必ず行き先を持つ**。「決定」と書いてあるのに参照先が無いと辿れない
{
  const s = text["05-decisions-backlog.md"] || "";
  const open = (s.match(/^- \[ \] /gm) || []).length;
  const done = (s.match(/^- \[x\] /gm) || []).length;
  assert.ok(open + done > 0, "バックログが空");
  console.log("バックログOK 未着手", open, "件 / 片付いた", done, "件");
}

console.log("\nすべて通過");
