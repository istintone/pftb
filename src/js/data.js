"use strict";
// ================= 定義・ユーティリティ =================
// このファイルは結合時の先頭。1行目の "use strict"; の直後へ build.py が
// アセット(window.ASSETS)を注入するので、1行目は必ず "use strict"; のままにする。

const GAME={ id:"pftb", title:"pftb", sub:"SINGLE PLAY BROWSER FOOTBALL" };

// --- 汎用ユーティリティ ---
const ri=(a,b)=>a+Math.floor(Math.random()*(b-a+1));    // a..b の整数乱数(両端含む)
const rnd=a=>a[Math.floor(Math.random()*a.length)];     // 配列から1つ
const clamp=(v,lo,hi)=>v<lo?lo:v>hi?hi:v;
// Promiseにタイムアウトを付ける。ストレージや画像が応答しなくても起動を止めないための保険。
function withTimeout(p,ms,fallback=null){
  return Promise.race([Promise.resolve(p),new Promise(r=>{
    const t=setTimeout(()=>r(fallback),ms);
    if(t&&t.unref)t.unref(); // node(テスト)でプロセスを引き止めない
  })]);
}

// --- ポジション(大分類。細分ポジションは仕様確定後にここへ足す) ---
const POS=["GK","DF","MF","FW"];

// --- バランスダイヤル ---
// 確率・係数・閾値は必ずここに集約し、ロジック側へ数値を直書きしない(調整点を1か所に保つ)。
const TUNING={};
