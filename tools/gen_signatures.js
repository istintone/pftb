// ================= 実在選手カードの一覧を書き出す =================
// **手で書かない**。カードは足すたびに増えるので、手書きの表は必ず古くなる
// (実際、docs/08 §8.8 の「12枚」は26枚になっても直っていなかった)。
// data.js / signatures.js から組み立てて docs/09-signatures.md を作る。
//
//     node tools/gen_signatures.js          書き出す
//     node tools/gen_signatures.js --check  食い違っていたら落ちる(doctest が使う)
"use strict";
const fs = require("fs");
const path = require("path");
const { setup } = require("../src/tests/_setup.js");

const ROOT = path.join(__dirname, "..");
const OUT = path.join(ROOT, "docs", "09-signatures.md");
const E = setup({ timeoutFlat: 0, tmpName: "_tmp_gensig.js" });

const K = ["atk", "def", "pow", "tec", "spd", "sta"];
const ovrOf = d => K.reduce((a, k) => a + d[k], 0);
const esc = s => String(s).replace(/\|/g, "\|");

// ---------- 固有スキルの効果を1行で書く ----------
// SKILL_FX の形をそのまま人が読める順に並べる(層 → 群 → 倍率)
function fxLine(name) {
  const f = E.SKILL_FX[name];
  if (!f) return "—";
  const one = x => {
    const at = x.at + (x.grp ? " / " + x.grp : "");
    const v = [];
    if (x.w) v.push("W×" + x.w.toFixed(2));
    if (x.s) v.push("S×" + x.s.toFixed(2));
    if (x.k) v.push("k×" + x.k.toFixed(2));
    return "`" + at + "` " + v.join(" ") + (x.when ? "（" + x.when + "限定）" : "");
  };
  return (f.fx || [f]).map(one).join(" ／ ");
}

// ---------- クラブごとにまとめる ----------
// **同じクラブの札は一緒に見たい**。メモラビリア(→docs/03 §3.55)を組むときに
// 「このクラブで11人そろうか」を数えるのがこの表のいちばんの用途
const byClub = new Map();
for (const d of E.SIGNATURES) {
  if (!byClub.has(d.club)) byClub.set(d.club, []);
  byClub.get(d.club).push(d);
}
const clubs = [...byClub.entries()].sort((a, b) =>
  b[1].length - a[1].length || a[0].localeCompare(b[0], "ja"));

const L = [];
L.push("# 9. 実在選手カードと固有スキル");
L.push("");
L.push("> **この文書は `tools/gen_signatures.js` が書き出しています。手で編集しないでください。**");
L.push("> カードを足したら `node tools/gen_signatures.js` を走らせ直します");
L.push("> (`doctest.js` が食い違いを見張っています)。");
L.push("> 設計の考え方は [03. §3.13](03-game-design.md)、スキルの物差しは [08. スキル](08-skills.md)。");
L.push("");
L.push("---");
L.push("");
L.push("## 9.1 数えかた");
L.push("");
const rar = {};
for (const d of E.SIGNATURES) rar[d.rarity] = (rar[d.rarity] || 0) + 1;
L.push("| 段 | 枚数 | OVR の域 | 札の枚数 |");
L.push("|---|---|---|---|");
for (const k of ["WC", "LEG"]) {
  if (!rar[k]) continue;
  const R = E.RARITY[k];
  L.push("| " + R.label + " | " + rar[k] + " | " + R.ovr[0] + "〜" + R.ovr[1]
    + " | " + R.skills + " |");
}
L.push("");
L.push("**全" + E.SIGNATURES.length + "枚 / " + clubs.length + "クラブ。**");
L.push("OVR は6能力の単純な合計です(→[03. §3.53](03-game-design.md))。");
L.push("");
L.push("---");
L.push("");
L.push("## 9.2 クラブ別の顔ぶれ");
L.push("");
L.push("**11人そろうクラブはメモラビリア(→[03. §3.55](03-game-design.md))が組めます。**");
L.push("");
for (const [club, list] of clubs) {
  list.sort((a, b) => ovrOf(b) - ovrOf(a));
  const mem = E.MEMORABILIA.find(m => m.club === club);
  L.push("### " + club + "（" + list.length + "枚"
    + (mem ? " ・ " + mem.name : "") + "）");
  L.push("");
  L.push("| 段 | 選手 | 枠 | OVR | ATK | DEF | POW | TEC | SPD | STA | 固有スキル |");
  L.push("|---|---|---|---|---|---|---|---|---|---|---|");
  for (const d of list) {
    L.push("| " + E.RARITY[d.rarity].abbr
      + " | " + esc(d.name)
      + " | " + d.subs.join("/")
      + " | **" + ovrOf(d) + "**"
      + " | " + K.map(k => d[k]).join(" | ")
      + " | " + esc(d.skills[0]) + " |");
  }
  L.push("");
}
L.push("---");
L.push("");
L.push("## 9.3 固有スキル");
L.push("");
L.push("**1枚で2つ働きます。** 汎用の札(→[08. §8.4](08-skills.md))と違い、");
L.push("抽選プールには入りません。強さは成分ごとに [08. §8.6④](08-skills.md) の帯へ収めます。");
L.push("");
L.push("| スキル | 持ち主 | 技名 | 効果 |");
L.push("|---|---|---|---|");
const sigSkills = Object.keys(E.SKILL_FX).filter(n => E.SKILL_FX[n].sig);
for (const n of sigSkills) {
  const f = E.SKILL_FX[n];
  const owner = E.SIGNATURES.find(d => d.id === f.sig);
  L.push("| " + esc(n)
    + " | " + (owner ? esc(owner.short) + "（" + owner.club + "）" : "**" + f.sig + " が居ない**")
    + " | " + (f.move ? esc(f.move) : "—")
    + " | " + fxLine(n) + " |");
}
L.push("");
L.push("**" + sigSkills.length + "種。カード1枚につき1つ**なので、枚数と同じ数だけあります。");
L.push("技名を持つ札は、その局面のチャンネル名が技名に変わります");
L.push("(→[03. §3.41](03-game-design.md))。");
L.push("");
L.push("---");
L.push("");
L.push("## 9.4 枠ごとの厚み");
L.push("");
L.push("**薄い枠は、メモラビリアを組むときに埋まりません。**");
L.push("");
const bySub = {};
for (const d of E.SIGNATURES) for (const s of d.subs) bySub[s] = (bySub[s] || 0) + 1;
L.push("| 枠 | 枚数 |");
L.push("|---|---|");
// SUBPOS はポジションごとの枠の並び。**重複を外して**順序どおりに数える
const subs = [...new Set([].concat(...Object.values(E.SUBPOS)))];
for (const s of subs) L.push("| " + s + " | " + (bySub[s] || "**0**") + " |");
L.push("");
L.push("[← 前: 8. スキル](08-skills.md) ｜ [↑ 索引](../SPEC.md)");
L.push("");

const text = L.join("\n");
if (process.argv.includes("--check")) {
  const cur = fs.existsSync(OUT) ? fs.readFileSync(OUT, "utf8") : "";
  if (cur !== text) {
    console.error("docs/09-signatures.md が古くなっています。"
      + "`node tools/gen_signatures.js` を走らせ直してください。");
    process.exit(1);
  }
  console.log("09-signatures.md OK（データと一致）");
} else {
  fs.writeFileSync(OUT, text);
  console.log("書き出し: docs/09-signatures.md（"
    + E.SIGNATURES.length + "枚 / " + sigSkills.length + "種）");
}
