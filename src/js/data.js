"use strict";
// ================= 定義・ユーティリティ =================
// このファイルは結合時の先頭。1行目の "use strict"; の直後へ build.py が
// アセット(window.ASSETS)を注入するので、1行目は必ず "use strict"; のままにする。

const GAME={ id:"pftb", title:"P-footBall", sub:"CLUB CARD FOOTBALL" };

// --- 汎用ユーティリティ ---
const ri=(a,b)=>a+Math.floor(Math.random()*(b-a+1));    // a..b の整数乱数(両端含む)
const rnd=a=>a[Math.floor(Math.random()*a.length)];     // 配列から1つ
const clamp=(v,lo,hi)=>v<lo?lo:v>hi?hi:v;
const fmtNum=n=>String(n||0).replace(/\B(?=(\d{3})+(?!\d))/g,",");  // 12400 → "12,400"
function todayLabel(){                                   // 契約書の締結日
  const d=new Date();
  return d.getFullYear()+"年"+(d.getMonth()+1)+"月"+d.getDate()+"日";
}
// Promiseにタイムアウトを付ける。ストレージや画像が応答しなくても起動を止めないための保険。
function withTimeout(p,ms,fallback=null){
  return Promise.race([Promise.resolve(p),new Promise(r=>{
    const t=setTimeout(()=>r(fallback),ms);
    if(t&&t.unref)t.unref(); // node(テスト)でプロセスを引き止めない
  })]);
}

// --- ポジション(大分類。細分ポジション favPos は選手データ側に持たせる) ---
const POS=["GK","DF","MF","FW"];

// --- レアリティ(デザインモックの4段階。色は base.css の --rar-* と対応) ---
const RARITY={
  STD:  { label:"STANDARD",   v:"std"   },
  RARE: { label:"RARE",       v:"rare"  },
  SUPER:{ label:"SUPER RARE", v:"super" },
  ULTRA:{ label:"ULTRA RARE", v:"ultra" },
};

// --- バランスダイヤル ---
// 確率・係数・閾値は必ずここに集約し、ロジック側へ数値を直書きしない(調整点を1か所に保つ)。
const TUNING={};
