// ================= 世界(国・クラブ・リーグ・日程) =================
// クラブの選手はセーブに持たない。world.seed とクラブIDから毎回同じ内容を再生成する
// (→ data.js の mulberry32)。セーブが軽く、同じキャリアなら何度開いても同じ顔ぶれになる。

// --- リーグ(実在の6リーグを想定 → docs/03 §3.8) ---
// tier が高いほど上位リーグで、そのままキャリアの階段になる。
// **選手の国籍(data.js の NATIONS)とは別物**。リーグは「クラブがどこで戦うか」、
// 国籍は「選手がどこの出身か」を表す。
//   home/homeW/near … そのリーグに集まる国籍の構成比(nationBox で抽選箱にする)
const LEAGUES=[
  { id:"eng", name:"プレミア",          country:"イングランド",        abbr:"ENG", tier:6, style:"強度",    money:1.00,
    home:"eng", homeW:30, near:["fra","ned","bel","por"] },
  { id:"esp", name:"ラ・リーガ",         country:"スペイン",          abbr:"ESP", tier:5, style:"技巧",    money:0.92,
    home:"esp", homeW:45, near:["por","arg","bra","uru"] },
  { id:"ita", name:"セリエ",           country:"イタリア",          abbr:"ITA", tier:4, style:"堅守",    money:0.82,
    home:"ita", homeW:42, near:["arg","bra","fra","cro"] },
  { id:"ger", name:"ブンデス",          country:"ドイツ",           abbr:"GER", tier:3, style:"組織",    money:0.76,
    home:"ger", homeW:55, near:["ned","den","bel","pol","jpn"] },
  { id:"fra", name:"リーグアン",         country:"フランス",          abbr:"FRA", tier:2, style:"個",     money:0.66,
    home:"fra", homeW:45, near:["sen","bel","nga","por"] },
  { id:"sam", name:"カンピオナート",       country:"南米",            abbr:"SAM", tier:1, style:"創造",    money:0.50,
    home:"bra", homeW:75, near:["arg","uru","por"] },
];
const leagueById=id=>LEAGUES.find(l=>l.id===id);

/**
 * リーグごとの国籍の抽選箱。自国が主体で、近い国が続き、残りは世界中から少しずつ。
 * プレミアは自国比率が低く(homeW 30)、カンピオナートは高い(75)。
 */
function nationBox(league){
  const box=[];
  for(let i=0;i<league.homeW;i++)box.push(league.home);
  league.near.forEach(n=>{ for(let i=0;i<10;i++)box.push(n); });
  NATION_IDS.forEach(n=>{
    if(n===league.home||league.near.includes(n))return;
    for(let i=0;i<3;i++)box.push(n);
  });
  return box;
}

// --- クラブ(各リーグ 3部 × 8クラブ = 24。世界で 144)。
// リーグは国、DIVはその国の中の階段(→docs/03 §3.24)。
// **就任したクラブとは任期の終わりまで添い遂げる**ので、キャリアの成長は
// 「このクラブをどこまで上げたか」で表れる。d1 が最上位、d3 が入口。
// 実在クラブが元ネタと分かる程度に改変した名前を使う(→docs/03 §3.13 の商標方針)。
const CLUB_NAMES={
  eng:{
    d1:["マンチェスター・レッズ","マンチェスター・スカイ","ロンドン・ガナーズ","リヴァプール・コップ","ロンドン・ブルーズ","ノースロンドン・スパーズ","タインサイド・マグパイズ",
        "バーミンガム・ヴィランズ"],
    d2:["リーズ・ホワイツ","シェフィールド・ブレイズ","ノッティンガム・フォレスターズ","サウサンプトン・セインツ","ブライトン・シーガルズ","レスター・フォクシーズ",
        "ウェストロンドン・ホーネッツ","ストーク・ポッターズ"],
    d3:["サンダーランド・ブラックキャッツ","ノリッジ・カナリーズ","ハル・タイガース","ランカシャー・ローヴァーズ","サウスロンドン・ライオンズ","コヴェントリー・スカイブルーズ",
        "プリマス・パイルグリムズ","イプスウィッチ・トラクターズ"],
  },
  esp:{
    d1:["マドリード・ブランコス","カタルーニャ・ブラウグラナ","マドリード・コルチョネロス","セビージャ・ネルビオン","バレンシア・チェ","ビルバオ・レオネス","サンセバスティアン・レアレス",
        "アンダルシア・ベティコス"],
    d2:["ビーゴ・セレステス","ヒホン・ロヒブランコス","サラゴサ・マニョス","バジャドリード・ブランキビオレタ","グラナダ・ナサリエス","マヨルカ・ベルメジョネス",
        "カディス・スブマリノ","ラスパルマス・アマリージョス"],
    d3:["テネリフェ・チチャレロス","ヘタフェ・アスレホス","エルチェ・フランヒベルデス","オビエド・カルバジョネス","サンタンデール・ラシンギスタス","コルドバ・カリファレス",
        "ムルシア・ピメントネロス","アルバセテ・マンチェゴス"],
  },
  ita:{
    d1:["トリノ・ビアンコネーリ","ミラノ・ロッソネーリ","ミラノ・ネラッズーリ","ナポリ・パルテノペイ","ローマ・ジャッロロッシ","ローマ・チェレスティ","フィレンツェ・ヴィオラ",
        "ベルガモ・オロビチ"],
    d2:["ジェノヴァ・グリフォーニ","ジェノヴァ・ブルチェルラーティ","ボローニャ・ロッソブル","ウディネ・フリウラーニ","トリノ・グラナータ","ヴェローナ・ジャッロブル",
        "カリアリ・イゾラーニ","エンポリ・アッズッリ"],
    d3:["パレルモ・ロザネロ","バーリ・ガッレッティ","ペスカーラ・デルフィーニ","パルマ・クロチャーティ","ヴェネツィア・アランチョネロ","ブレシア・ロンディネッレ",
        "チェゼーナ・カヴァルッチ","モデナ・カナリーニ"],
  },
  ger:{
    d1:["ミュンヘン・ローテン","ドルトムント・シュヴァルツゲルプ","レヴァークーゼン・ヴェルクセルフ","ライプツィヒ・ローテブレン","ゲルゼンキルヒェン・クナッペン","フランクフルト・アドラー",
        "シュトゥットガルト・ブルステン","ブレーメン・グリューンヴァイス"],
    d2:["ハンブルク・ラウテン","ケルン・ガイスボック","メンヒェングラートバッハ・フォーレン","ベルリン・ハウプトシュテッター","ニュルンベルク・アルトマイスター","フライブルク・ブライスガウ",
        "ボーフム・ウンアプシュタイクバー","アウクスブルク・フッゲライ"],
    d3:["デュッセルドルフ・ライン","カイザースラウテルン・ローテトイフェル","ドレスデン・エルプフローレンツ","ロストック・オストゼー","ビーレフェルト・アルミネン","ブラウンシュヴァイク・レーヴェン",
        "マクデブルク・ボルデ","エッセン・ルールポット"],
  },
  fra:{
    d1:["パリ・キャピタル","マルセイユ・オリンピアン","リヨン・ゴーヌ","モナコ・ルージュブラン","リール・ドーグ","レンヌ・ルージュノワール","ニース・エーグロン","ナント・カナリ"],
    d2:["サンテティエンヌ・ヴェール","ボルドー・マリーヌ","トゥールーズ・ヴィオレ","ランス・サンエオール","ストラスブール・アルザシアン","モンペリエ・パイヨラン",
        "ロリアン・メルル","アンジェ・スコイスト"],
    d3:["オセール・アイジェオワ","メス・グルナ","カーン・マリーヌエブラン","ブレスト・ピラート","ルアーヴル・シエルエマリーヌ","ディジョン・ムタルディエ",
        "トロワ・ドーファン","アミアン・リコルヌ"],
  },
  sam:{
    d1:["リオ・ルブロネグロ","サンパウロ・ヴェルダン","ブエノスアイレス・ボンボネーラ","ブエノスアイレス・ミジョナリオス","サンパウロ・チマォン","サントス・ペイシェ","モンテビデオ・カルボネーロ",
        "メデジン・ベルデ"],
    d2:["ポルトアレグレ・コロラド","ポルトアレグレ・トリコロール","ベロオリゾンテ・ガロ","ベロオリゾンテ・コエーリョ","クリチバ・フーブロネグロ","ロサリオ・カナージャ",
        "ロサリオ・レプロ","アスンシオン・オリンピスタ"],
    d3:["レシフェ・レオン","サルバドール・エスカラーダ","フォルタレザ・ヴォゾン","ゴイアニア・エスメラウジーノ","カリ・アスカレロス","キト・アルボレータ",
        "リマ・クレマ","ラパス・アティグレス"],
  },
};
const DIVS=[1,2,3];
/** 部の呼び名。表示は必ずここを通す(「DIV2」の書き方を1か所に閉じる)。 */
const divName=d=>"DIV"+d;
const CLUBS=[];
LEAGUES.forEach(lg=>{
  DIVS.forEach(d=>{
    CLUB_NAMES[lg.id]["d"+d].forEach((name,i)=>{
      const n=(d-1)*8+i+1;
      CLUBS.push({
        id:lg.id+"-"+n, name, league:lg.id, div:d, rank:i+1,
        abbr:(lg.abbr+n),
        // クラブの格(1..10)。リーグの格・部・部内順位から決める。就任先選びの目安になる。
        grade:clamp(Math.round(lg.tier*1.1+(3-d)*1.6+(8-i)*0.35),1,10),
      });
    });
  });
});
const clubById=id=>CLUBS.find(c=>c.id===id);
const clubsOf=leagueId=>CLUBS.filter(c=>c.league===leagueId);

const clubsOfDiv=(leagueId,div)=>CLUBS.filter(c=>c.league===leagueId&&c.div===div);
/**
 * クラブの戦力水準(生成される選手のOVR補正)。リーグの格 × 部 × 部内順位。
 * **部の段差がいちばん大きい**。昇格すると相手が一段強くなるのが分かるようにする。
 */
function clubBias(club){
  const lg=leagueById(club.league), t=TUNING.world;
  // **部の差は段(レアリティ)で表す**ので、ここには部の項を入れない(→§3.25)
  return Math.round((lg.tier-3.5)*t.tierK + (4.5-club.rank)*t.rankK);
}
/**
 * クラブの編成の内訳(→docs/03 §3.25)。**どの段の選手が並ぶか**が部の顔になる。
 *   DIV3 … STANDARD + REGULAR(就任時の自クラブと同じ水準)
 *   DIV2 … REGULAR と SPECIALS が中心、WORLD CLASS が1人
 *   DIV1 … SPECIALS と WORLD CLASS が中心。**国の格が上がるほど WC が増える**
 *          (カンピオナートは SPE 多め / プレミアはほとんど WC)
 */
function rosterPlan(tier,div,rank){
  const R=TUNING.roster;
  if(div>=3)return { ...R.div3 };
  if(div===2)return { ...R.div2 };
  const wc=clamp(Math.round(R.wcByTier[clamp(tier,1,R.wcByTier.length)-1]
    +(4.5-rank)*R.rankWc),0,R.div1.rest);
  return { REG:R.div1.REG, SPE:R.div1.rest-wc, WC:wc };
}
/**
 * そのクラブが**いま戦っている部**。昇降格で動くので、編成の内訳もこれに従う
 * (持ち場の部のままだと、昇格したクラブが下の部の顔ぶれのまま上がってしまう)。
 * 自リーグ以外は動かないので、持ち場をそのまま返す。
 */
function divOfClub(club){
  const W=typeof S!=="undefined"&&S?S.world:null;
  if(W&&W.divs&&S.club&&clubById(S.club.id).league===club.league){
    const i=W.divs.findIndex(ids=>ids.includes(club.id));
    if(i>=0)return i+1;
  }
  return club.div;
}
const clubPlan=club=>rosterPlan(leagueById(club.league).tier,divOfClub(club),club.rank);

/** クラブの所属選手を決定的に再生成する(貸与される戦力・CPUの戦力の両方に使う)。 */
function clubRoster(seed,clubId){
  const club=clubById(clubId);
  const rng=mulberry32((seed^hashStr(clubId))>>>0);
  const saveUid=uid; uid=1000000+(hashStr(clubId)%900000);   // クラブ選手のIDは別空間に置く
  const roster=makeRoster(rng,{ club:club.name, ovrBias:clubBias(club),
    rarPlan:clubPlan(club), nations:nationBox(leagueById(club.league)) });
  uid=saveUid;
  return roster;
}

/** クラブの総合力(順位表の初期並びやCPU同士の試合に使う)。 */
function clubPower(seed,clubId){
  const r=clubRoster(seed,clubId);
  return squadPower(r.slice(0,TUNING.squad.starters));
}

// --- 日程(ホーム&アウェイの総当たり) ---
/**
 * 偶数クラブの円卓法(1つを固定して残りを回す)。
 * n=8 なら 7ラウンド、往復で14節。休みが出ないので順位表が常に揃う。
 * 返り値: [ [ {h,a}, ... ], ... ] (節ごとの対戦カード)
 */
function makeFixtures(clubIds,rng){
  const ids=clubIds.slice();
  const n=ids.length, half=n/2, rounds=[];
  for(let r=0;r<n-1;r++){
    const pairs=[];
    for(let i=0;i<half;i++){
      const h=ids[i], a=ids[n-1-i];
      pairs.push(r%2===0?{h,a}:{h:a,a:h});     // ホーム/アウェイを交互にして偏りを消す
    }
    rounds.push(pairs);
    ids.splice(1,0,ids.pop());                  // 先頭を固定して回す
  }
  const back=rounds.map(p=>p.map(m=>({h:m.a,a:m.h})));  // 後半戦はホームを入れ替える
  const all=rounds.concat(back);
  // 節の順番だけシャッフルして、毎キャリア同じ並びにならないようにする
  for(let i=all.length-1;i>0;i--){ const j=Math.floor(rng()*(i+1)); [all[i],all[j]]=[all[j],all[i]]; }
  return all;
}

/** 空の順位表を作る。 */
function emptyTable(clubIds){
  const t={};
  clubIds.forEach(id=>{ t[id]={ w:0,d:0,l:0,gf:0,ga:0 }; });
  return t;
}
const pts=r=>r.w*3+r.d;
const gd=r=>r.gf-r.ga;

/** 順位表を勝点 → 得失点差 → 総得点で並べ、[{id,...,pts,gd,rank}] を返す。 */
function standings(table){
  const rows=Object.keys(table).map(id=>({ id, ...table[id], pts:pts(table[id]), gd:gd(table[id]) }));
  rows.sort((a,b)=>b.pts-a.pts||b.gd-a.gd||b.gf-a.gf||a.id.localeCompare(b.id));
  rows.forEach((r,i)=>r.rank=i+1);
  return rows;
}
const rankOf=(table,clubId)=>standings(table).find(r=>r.id===clubId).rank;

/** 結果を順位表に反映する。 */
function applyResult(table,h,a,hg,ag){
  table[h].gf+=hg; table[h].ga+=ag; table[a].gf+=ag; table[a].ga+=hg;
  if(hg>ag){ table[h].w++; table[a].l++; }
  else if(hg<ag){ table[a].w++; table[h].l++; }
  else { table[h].d++; table[a].d++; }
}

// --- 期待順位(→docs/03 §3.9) ---
/**
 * クラブの格だけで決めると、強いコレクションを弱小クラブに持ち込んで
 * 期待を楽に上回れてしまう。持ち込んだ編成の強さも合成して、
 * 「あなたほどの陣容なら勝って当然だ」という圧がかかるようにする。
 */
function expectedRank(seed,clubId,squadPow){
  const league=divClubs();
  const powers=league.map(id=>({ id, p:clubPower(seed,id) }));
  const mine=powers.find(p=>p.id===clubId);
  const blended=mine.p*(1-TUNING.expect.squadWeight)+squadPow*TUNING.expect.squadWeight;
  const better=powers.filter(p=>p.id!==clubId&&p.p>blended).length;
  return clamp(better+1,1,league.length);
}

// --- キャリア(就任・任期・評価) ---
/** 就任できるクラブ(名声が届く範囲)。名声が上がるほど上位国・上位クラブが解禁される。
 *  末尾の -560 は「キャリア開始時点で最下位国の下位4クラブが選べる」ようにするための下駄。
 *  最初から選択肢がないと就任がただの通過儀礼になるため。 */
function requiredFame(club){
  const lg=leagueById(club.league), t=TUNING.world;
  return Math.max(0,Math.round((lg.tier-1)*t.fameLg+(3-club.div)*t.fameDiv
    +(8-club.rank)*t.fameRank-t.fameFree));
}
const offersFor=fame=>CLUBS.filter(c=>requiredFame(c)<=fame);

// --- 部(DIV)の昇降格 → docs/03 §3.24 ---
// 所属は任期のあいだ動くので**セーブに持つ**。決定的に作り直せない唯一の世界情報。
/** いま自クラブが戦っている部の顔ぶれ(クラブIDの配列)。 */
const divClubs=(div)=>{
  const W=S.world;
  return (W.divs&&W.divs[(div||W.div)-1])||[];
};
/** 就任時の部割り。各クラブの持ち場(club.div)がそのまま初期配置になる。 */
function makeDivs(leagueId){
  return DIVS.map(d=>clubsOfDiv(leagueId,d).map(c=>c.id));
}
/**
 * 自分が出ていない部の最終順位。**エンジンは回さず**、戦力に節ごとの ぶれ を足して
 * 決定的に並べる。世界のほうも入れ替わっていないと、階段が嘘になる。
 */
function cpuOrder(ids,div){
  const W=S.world;
  return ids.map(id=>{
    const rng=mulberry32((W.seed^hashStr("cpu:"+id+":"+W.season+":"+div))>>>0);
    return { id, p:clubPower(W.seed,id)+rng()*7-3.5 };
  }).sort((a,b)=>b.p-a.p).map(x=>x.id);
}
/**
 * シーズンの入れ替え。上位2が上の部へ、下位2が下の部へ。
 * **同時に交換する**ので、どの部もつねに8クラブに保たれる。
 * 返り値: 自クラブの行方 { move:-1|0|1, from, to }
 */
function applyPromotion(myRank){
  const W=S.world, t=TUNING.world;
  const order=DIVS.map(d=>{
    if(d===W.div){                                            // 自分の部は順位表が正
      return standings(W.table).map(r=>r.id);
    }
    return cpuOrder(divClubs(d),d);
  });
  const up=order.map(o=>o.slice(0,t.promote));                // 各部の上位
  const down=order.map(o=>o.slice(-t.relegate));              // 各部の下位
  const next=order.map(o=>o.slice());
  for(let d=0;d<DIVS.length-1;d++){
    // d は上の部、d+1 は下の部。**下位2と上位2をそっくり入れ替える**
    next[d]=next[d].filter(id=>!down[d].includes(id)).concat(up[d+1]);
    next[d+1]=next[d+1].filter(id=>!up[d+1].includes(id)).concat(down[d]);
  }
  W.divs=next.map(ids=>ids.slice());
  const from=W.div;
  const promoted=from>1&&myRank<=t.promote;
  const relegated=from<DIVS.length&&myRank>8-t.relegate;
  W.div=from-(promoted?1:0)+(relegated?1:0);
  return { move:W.div-from, from, to:W.div, promoted, relegated };
}

/**
 * 任期が明けた監督が、次のクラブを探せる状態に戻す(→docs/03 §3.24)。
 * **集めたカード・名声・実績は監督のもの**なので持ち越し、任期の記録だけを畳む。
 * クラブを移れるのはここだけ(シーズンの区切りでは移らない)。
 */
function newTenure(){
  S.career=defaultState().career;
  return true;
}

/** 新しい任期を開始する(就任)。S.club / S.world をこのクラブ用に組み直す。 */
function startTenure(clubId){
  const seed=S.world.seed;
  const club=clubById(clubId);
  S.world.divs=makeDivs(club.league);
  S.world.div=club.div;                                      // **入口はそのクラブの持ち場**
  const league=divClubs();
  const rng=mulberry32((seed^hashStr(clubId+":"+S.world.season))>>>0);
  S.club={
    id:clubId,
    coins:Math.round(3000*leagueById(clubById(clubId).league).money),
    fac:{ training:0, medical:0, stadium:0, scouting:0 },   // 施設(第4段で使う)
    exp:0,                                                   // チーム熟練度(→§3.7)
    eval:TUNING.eval.start,                                  // オーナーの評価(→§3.9)
    evLog:{},                                                // 今季なにで評価が動いたか
    fameSeason:0,                                            // 今季ぶんの名声(総括で見せる)
    loan:clubRoster(seed,clubId),                            // 任期中だけ借りる所属選手
    expect:0,
  };
  S.world.table=emptyTable(league);
  S.world.fixtures=makeFixtures(league,rng);
  S.world.results={};
  S.world.matchday=1;
  // **就任時の陣形も名簿に合わせる**(→docs/07 §7.14)。CPUが名簿に合う陣形を選ぶのに
  // 自分だけ既定の 4-4-2 のままだと、枠適性のロスを一方的に背負って始めることになる。
  // もちろん DECK でいつでも変えられる。
  S.form=bestFormFor(availableCards());
  S.squad=autoSquad();
  S.club.expect=expectedRank(seed,clubId,squadPower(squadCards().slice(0,TUNING.squad.starters)));
  // **開幕イベントはまだ**。オーナーが目標を告げるまで、HOME はそこへ誘導する(→§3.9)
  S.career.opened=false;
  S.career.tenureDone=false;
  S.player.history.push({ season:S.world.season, clubId, div:S.world.div, result:"在任" });
}

/**
 * 試合エンジンに渡すチーム(→docs/07)。自クラブは編成、他クラブは名簿の並びをそのまま使う。
 * 他クラブの編成は決定的に再生成されるので、セーブに持たなくても毎回同じ11人になる。
 */
function matchSide(clubId){
  const club=clubById(clubId);
  if(S.club&&clubId===S.club.id){
    // 覚醒の裏パラと連携を持たせる(→docs/03 §3.30 / §3.31)。
    // **カードは書き換えず写しに載せる**
    const ids=(S.squad||[]).filter(x=>x!=null);
    return { cards:squadCards().map(c=>{
        const up=trainUps(c.id), bond={}, gold={};
        for(const o of ids)if(o!==c.id){
          const v=bondOf(c.id,o); if(v)bond[o]=v;
          if(bondIsGold(c.id,o))gold[o]=1;              // 黄金線(→§3.31)
        }
        const has=Object.keys(bond).length, hasG=Object.keys(gold).length;
        return { ...c, cond:condOf(c.id), ...(up?{ up }:{}),
          ...(has?{ bond }:{}), ...(hasG?{ gold }:{}) };
      }),
      form:S.form, name:club.name,
      kickers:S.kickers, captain:S.captain, order:S.order };
  }
  const { cards:base, form }=cpuSquad(clubId);
  // 相手にもコンディションを配る(→docs/03 §3.32)。節ごとに変わり、格で上に寄る
  const rng=mulberry32((S.world.seed^hashStr("cond:"+clubId+":"+S.world.season
    +":"+S.career.node))>>>0);
  const cards=base.map(c=>({ ...c, cond:condCpu(clubId,rng) }));
  return { cards, form, name:club.name };
}
/**
 * CPUクラブの編成(→docs/03 §3.34)。**試合も下見もここを通す**ので、
 * 対戦表から覗いた11人がそのまま出てくることが構造で保証される。
 */
function cpuSquad(clubId){
  const form=formFor(clubId);
  return { cards:bestXI(clubRoster(S.world.seed,clubId),form), form };
}
/** クラブの陣形。クラブIDから決定的に選ぶ(クラブごとに一貫した色になる)。 */
// 陣形は名簿から決まる = 世界のたねが変わらない限り不変。毎回引き直すと重いので覚えておく。
const _formCache={};
function formFor(clubId){
  const key=S.world.seed+":"+clubId;                      // たねが変われば別の世界
  if(_formCache[key])return _formCache[key];
  const roster=clubRoster(S.world.seed,clubId);
  const keys=Object.keys(FORMATIONS);
  // **手持ちに合う陣形を選ぶ**(→docs/07 §7.14)。IDから機械的に決めていた頃は、
  // 名簿と噛み合わない陣形を引いたクラブが枠適性のロスを抱えたまま1シーズン戦い、
  // 得点が実測で8倍ひらいた(4-4-2 1.68点 / 4-3-2-1 0.20点)。
  // 適性後の総合力で選ぶだけで、クラブの顔ぶれが陣形に表れるようにもなる。
  let best=keys[0], bs=-1;
  for(const k of keys){
    const v=squadPowerAt(bestXI(roster,k),k)
      +(hashStr(clubId+":"+k)%100)/1000;                  // 同点は決定的にばらす
    if(v>bs){ bs=v; best=k; }
  }
  return (_formCache[key]=best);
}
/** 名簿にいちばん合う陣形。CPU も自クラブもこれで選ぶ(→docs/07 §7.14)。 */
function bestFormFor(roster){
  let best=DEFAULT_FORM, bs=-1;
  for(const k of Object.keys(FORMATIONS)){
    const v=squadPowerAt(bestXI(roster,k),k);
    if(v>bs){ bs=v; best=k; }
  }
  return best;
}
/** 名簿から先発11+控え5を組む。autoSquad と同じ貪欲法(枠ごとに 適性×OVR が最大)。 */
function bestXI(roster,form){
  const slots=FORMATIONS[form||DEFAULT_FORM];
  const used=new Set();
  const xi=slots.map(([sub])=>{
    let best=null,bs=-1;
    for(const c of roster){
      if(used.has(c.id))continue;
      const v=slotFit(c,sub)*c.ovr;
      if(v>bs){ bs=v; best=c; }
    }
    if(best)used.add(best.id);
    return best;
  });
  return xi.concat(benchOrder(roster.filter(c=>!used.has(c.id))));
}

/** 使える選手 = 手持ちカード(恒久) + クラブからの貸与(任期中だけ)。 */
const availableCards=()=>S.player.coll.concat(S.club.loan);
const cardById=id=>availableCards().find(c=>c.id===id)||null;
const isLoaned=card=>!!card&&S.club.loan.some(c=>c.id===card.id);

/** 現在の編成(11枠)をカードで返す。埋まっていない枠は null。 */
const squadCards=()=>(S.squad||[]).map(id=>cardById(id));

/** 枠との適性が高い順に自動編成する。 */
/**
 * 自動編成。**先発11 + 控え5 = 16人**を返す(→docs/03 §3.17)。
 * 先発は枠ごとに 適性×OVR が最大の選手を貪欲に取り、控えは残りの上位5人。
 * 控えは枠を持たないので適性は掛からない(誰の代役にもなりうるため)。
 */
function autoSquad(){
  const slots=FORMATIONS[S.form||DEFAULT_FORM];
  const pool=availableCards().slice();
  const used=new Set();
  const xi=slots.map(([sub])=>{
    let best=null,bestScore=-1;
    for(const c of pool){
      if(used.has(c.id))continue;
      const score=slotFit(c,sub)*c.ovr;
      if(score>bestScore){ bestScore=score; best=c; }
    }
    if(best)used.add(best.id);
    return best?best.id:null;
  });
  return xi.concat(pickBench(pool.filter(c=>!used.has(c.id))));
}
/**
 * 控えの選び方(→docs/03 §3.17)。**ポジションを揃えてから OVR 順**に埋める。
 * 素のOVR順だけで取ると、GKもDFも居ない控えができあがり、投入したときに
 * 枠適性0.50の選手が入って**交代が損になる**(実際にそうなった → docs/07 §7.10)。
 */
function benchOrder(rest){
  const pool=rest.slice().sort((a,c)=>c.ovr-a.ovr), out=[], used=new Set();
  for(const g of POS){                                    // GK/DF/MF/FW を1枚ずつ確保
    const c=pool.find(x=>!used.has(x.id)&&x.pos===g);
    if(c){ out.push(c); used.add(c.id); }
  }
  for(const c of pool){                                   // 残りはOVR順
    if(out.length>=TUNING.squad.bench)break;
    if(!used.has(c.id)){ out.push(c); used.add(c.id); }
  }
  return out.slice(0,TUNING.squad.bench);
}
/** 控えのIDを並べる。足りなければ null で埋めて枠数は保つ。 */
function pickBench(rest){
  const b=benchOrder(rest).map(c=>c.id);
  while(b.length<TUNING.squad.bench)b.push(null);
  return b;
}

/**
 * **いまの11人のまま**、新しい陣形の枠へ並べ直す(→docs/06 §6.15)。
 * 陣形を変えるたびに autoSquad で組み直すと、手で作った編成が丸ごと捨てられてしまう。
 * 選手は入れ替えず、適性×OVR が高くなる組み合わせへ貪欲に割り当てるだけにする。
 */
function refitSquad(form){
  const slots=FORMATIONS[form||S.form||DEFAULT_FORM];
  const N=TUNING.squad.starters;
  // 先発の枠だけを並べ直す。**控えはそのまま持ち越す**(入れ替えの対象ではない)。
  const pool=(S.squad||[]).slice(0,N).map(id=>cardById(id)).filter(Boolean);
  const used=new Set();
  const xi=slots.map(([sub])=>{
    let best=null,bestScore=-1;
    for(const c of pool){
      if(used.has(c.id))continue;
      const score=slotFit(c,sub)*c.ovr;
      if(score>bestScore){ bestScore=score; best=c; }
    }
    if(best)used.add(best.id);
    return best?best.id:null;
  });
  const bench=(S.squad||[]).slice(N,N+TUNING.squad.bench);
  while(bench.length<TUNING.squad.bench)bench.push(null);
  return xi.concat(bench);
}

// --- オーナーの評価(→docs/03 §3.9) ---
// **お金は目標、評価は内容。** 目標順位は賞金と減俸を決め、評価は「どう戦ったか」で動く。
// 2つを分けたのは、順位だけで評価すると格下相手に勝ち点を積んだだけの監督と、
// 格上を食って回った監督が同じ評価になってしまうため。
//
// 評価は**積み上げ式**で 0〜100 を動く。動くのは次の場面だけ:
//   ・格上に勝った(+upset) / 格下に負けた(-slip)
//   ・リーグ優勝(+lChamp) / 昇格(+promote) / カップ優勝(+cChamp) / カップ初戦敗退(-cOut1)
//
// **名声はこの表に相乗りする**(→§3.9)。覚えることは2つだけ:
//   ① 評価が上がる出来事は名声も生む(評価 × fameK)
//   ② 評価が下がる出来事は名声を動かさない(他人の期待を外して世間の評判は落ちない)
/** 評価を動かす。**何で動いたか**をシーズンごとに数えておき、総括で言葉にする。 */
function evalAdd(reason,n){
  if(!S.club||!n)return 0;
  const E=TUNING.eval;
  const before=S.club.eval;
  S.club.eval=clamp(before+n,0,E.max);
  if(!S.club.evLog)S.club.evLog={};
  S.club.evLog[reason]=(S.club.evLog[reason]||0)+1;
  // **名声は評価の頭打ちに引きずられない**。評価が100で止まっていても偉業は偉業で、
  // 経歴には残る。だから clamp 後の差分ではなく、**元の n** から引く。
  // カップは順位ぶんの表を別に持つので、ここでは名声を生まない(→closeCup)
  if(n>0&&E.fameFor.includes(reason))fameAdd(n*E.fameK);
  return S.club.eval-before;
}
/** 名声を足す。**減らさない**(→§3.9)。シーズンぶんは総括で見せるので数えておく。 */
function fameAdd(n){
  if(!n||n<0)return 0;
  S.player.fame+=n;
  if(S.club)S.club.fameSeason=(S.club.fameSeason||0)+n;
  return n;
}
/**
 * 1試合ぶんの評価。**格が違う相手との結果だけ**が動かす。
 * 格は総合力(編成込み)で測る。画面に出ている数字と同じものを使う(→docs/06 §6.15)。
 */
function evalMatch(myPow,foePow,win,lose){
  const E=TUNING.eval;
  if(win&&foePow-myPow>=E.gap)return evalAdd("upset",E.upset);
  if(lose&&myPow-foePow>=E.gap)return evalAdd("slip",-E.slip);
  return 0;
}
/**
 * 第80節、オーナーが去就を告げる(→docs/03 §3.9)。
 * **評価が届いていれば契約が伸びる。** 届かなければ当初のままで、罰は無い
 * (「120節まで生きられない」ことが罰になっている)。
 */
function ownerTenure(){
  const T=TUNING.tenure, C=S.career;
  C.tenureDone=true;
  const need=TUNING.eval.extendNeed, ok=S.club.eval>=need;
  if(ok){
    C.limit=Math.min(T.hardMax,C.limit+T.extend);
    C.closing=false;
  }
  return { ok, need, eval:S.club.eval, limit:C.limit, add:T.extend };
}

// --- 節の進行 ---
/** その節の自クラブのカード(ホーム/アウェイと相手)を返す。無ければ null。 */
function myFixture(md){
  const round=(S.world.fixtures||[])[(md||S.world.matchday)-1]||[];
  const m=round.find(x=>x.h===S.club.id||x.a===S.club.id);
  if(!m)return null;
  return { home:m.h===S.club.id, opp:m.h===S.club.id?m.a:m.h };
}

/**
 * 1節を進める。自クラブの試合と、同じ節の他クラブ同士の試合をまとめて解決し、
 * 順位表・コイン・チーム熟練度・オーナーの評価を更新する。
 * 返り値: { my:{opp,home,hg,ag,win}, others:[...] }  シーズン終了なら my=null もありうる。
 */
// --- 任期(キャリア1周) → docs/03 §3.2.3 ---
const tenureLeft=()=>Math.max(0,S.career.limit-S.career.node+1);
/** 上限に達したか。達したら新規大会にはエントリーしないが、進行中の大会は最後まで戦う。 */
function checkTenureClosing(){
  if(!S.career.closing&&S.career.node>S.career.limit)S.career.closing=true;
  return S.career.closing;
}
/**
 * 大会(シーズン)が決着した時点で任期の去就を決める。
 * **延命の判断は第80節のイベントに移した**(→ownerTenure)ので、ここは終わりを告げるだけ。
 */
function judgeTenure(){
  if(!checkTenureClosing())return null;
  S.career.over=true;
  return { extended:false };
}

// ---------- 訓練(→docs/03 §3.30) ----------
// **任期のあいだだけ選手が伸びる。** 記録は career.train に置くので、任期が明けて
// career を畳めば自動で消える(カード自体には何も書かない)。
//   exp  … 能力ごとの経験点。10 貯まると覚醒のチャンスが来る
//   up   … 覚醒で得た裏パラ。カードの表示は変えず、試合の素の能力に足す
//   star … 覚醒した回数(=カード名の右の★)。maxStar で打ち止め
const trainRec=id=>(S.career.train||{})[id]||null;
/** 記録を用意して返す(書き込み用)。 */
function trainMake(id){
  if(!S.career.train)S.career.train={};
  let r=S.career.train[id];
  if(!r)r=S.career.train[id]={ exp:{}, up:{}, star:0 };
  return r;
}
const trainExp=(id,k)=>{ const r=trainRec(id); return (r&&r.exp[k])||0; };
const trainUp=(id,k)=>{ const r=trainRec(id); return (r&&r.up[k])||0; };
const trainStar=id=>{ const r=trainRec(id); return (r&&r.star)||0; };
/** 裏パラをまとめて引く(試合に渡すため)。何も無ければ null。 */
function trainUps(id){
  const r=trainRec(id);
  if(!r||!r.star)return null;
  const up={};
  for(const k of STAT_KEYS)if(r.up[k])up[k]=r.up[k];
  return Object.keys(up).length?up:null;
}
/**
 * 覚醒できる能力(→docs/03 §3.30)。経験点が need 以上でいちばん多いもの。
 * ★が上限に達していたら、もう起きない。
 */
function trainReady(id){
  const r=trainRec(id), G=TUNING.train;
  if(!r||(r.star||0)>=G.maxStar)return null;
  let best=null;
  for(const k of STAT_KEYS){
    const e=r.exp[k]||0;
    if(e>=G.need&&(best===null||e>r.exp[best]))best=k;
  }
  return best;
}
/**
 * 覚醒に成功した。★が1つ増え、その能力の裏パラが +1。
 * **消費した能力の経験点だけ**を0に戻す(他の能力はそのまま残る)。
 */
function trainAwake(id,k){
  const r=trainMake(id);
  r.up[k]=(r.up[k]||0)+1;
  r.star=(r.star||0)+1;
  r.exp[k]=0;
  return r;
}
/** 経験点を足す。**訓練の成果はここだけで動く**。 */
function trainAdd(id,k,n){
  if(!n||!STAT_KEYS.includes(k))return 0;
  const r=trainMake(id);
  r.exp[k]=(r.exp[k]||0)+n;
  return r.exp[k];
}

// ---------- 連携(→docs/03 §3.31) ----------
// **2人の組ごと**に積み上がる値。任期のあいだだけで、career を畳めば消える。
// 組み合わせの数だけあるので、**順序を持たない1つのキー**にまとめて持つ。
//
// **編成とは独立に持つ**ので、外した選手の組は消えずに凍結される(積み上げは
// bondMatch が現在の16人にしか掛けないため、勝手に止まる)。戻せば続きから積み上がる。
const bondKey=(a,b)=>a<b?a+":"+b:b+":"+a;
const bondOf=(a,b)=>(S.career.bond||{})[bondKey(a,b)]||0;
/** その2人のあいだの合計(**お互いが持つぶん** = 組の値×2)。しきい値はこれで見る。 */
const bondSum=(a,b)=>bondOf(a,b)*2;
function bondAdd(a,b,n){
  if(!n||a===b)return 0;
  if(!S.career.bond)S.career.bond={};
  const k=bondKey(a,b);
  return S.career.bond[k]=(S.career.bond[k]||0)+n;
}
/**
 * 1試合ぶんの積み上げ(→docs/03 §3.31)。**編成の16人の総当たり**に入る。
 * 国籍が同じ / コンビネーションのクラブが同じ なら、そのぶん厚くなる(最大3)。
 */
function bondMatch(){
  const B=TUNING.bond.match;
  const list=(S.squad||[]).map(id=>cardById(id)).filter(Boolean);
  for(let i=0;i<list.length;i++)for(let j=i+1;j<list.length;j++){
    const a=list[i], b=list[j];
    bondAdd(a.id,b.id,B.base
      +(a.nation&&a.nation===b.nation?B.nation:0)
      +(a.club&&a.club===b.club?B.club:0));
  }
  return list.length;
}
/** その選手が持つ連携の一覧(編成画面の線に使う)。 */
function bondPairs(ids){
  const out=[];
  for(let i=0;i<ids.length;i++)for(let j=i+1;j<ids.length;j++){
    const v=bondSum(ids[i],ids[j]), g=bondIsGold(ids[i],ids[j]);
    if(v>TUNING.bond.t1||g)out.push({ a:i, b:j, sum:v, tier:bondTier(v,g) });
  }
  return out;
}
/** しきい値の段(0=なし / 1..3)。**覚醒した組は4**(黄金線)。 */
function bondTier(sum,gold){
  const B=TUNING.bond;
  if(gold)return 4;
  return sum>B.t3?3:sum>B.t2?2:sum>B.t1?1:0;
}

// --- 連携の覚醒(→docs/03 §3.31) ---
// **積み上げの続きではなく、1回きりの節目。** 合計が t4 を超えた組だけが挑め、
// 1/2 で成功する。外しても積み上げは消えないので、次の交流でまた挑める。
const bondIsGold=(a,b)=>!!(S.career.bondGold||{})[bondKey(a,b)];
/** その組が覚醒に挑めるか(=合計がしきい値を超え、まだ覚醒していない)。 */
const bondCanAwake=(a,b)=>a!==b&&!bondIsGold(a,b)&&bondSum(a,b)>TUNING.bond.t4;
/** 覚醒に成功した。**値はそのまま**で、黄金線の印だけが付く。 */
function bondAwake(a,b){
  if(!S.career.bondGold)S.career.bondGold={};
  S.career.bondGold[bondKey(a,b)]=true;
  return true;
}
/** その選手が覚醒に挑める相手が居るか(チャットの一覧を光らせるため)。 */
const bondReadyWith=id=>(S.squad||[]).some(o=>o!=null&&o!==id&&bondCanAwake(id,o));

// ---------- コンディション(→docs/03 §3.32) ----------
// **隠しパラメータ。** 0=ケガ / 1=不調 / 2=普通 / 3=好調 / 4=絶好調。
// 任期の頭は全員が普通で、節ごとに動く。career を畳めば消える。
// **普段の上下は 1〜4**。0(ケガ)はケガのイベントでしか起きず、休息でしか治らない。
const COND_MAX=4, COND_MIN=1, COND_HURT=0;
const condOf=id=>{ const v=(S.career.cond||{})[id]; return v==null?2:v; };
const condMul=v=>TUNING.cond.mul[clamp(v==null?2:v,COND_HURT,COND_MAX)];
const condHurt=id=>condOf(id)===COND_HURT;
function condSet(id,v){
  if(!S.career.cond)S.career.cond={};
  return S.career.cond[id]=clamp(v,COND_HURT,COND_MAX);
}
/**
 * 普段の上下(→docs/03 §3.32)。**ケガの選手は動かない**(休息でしか治らない)し、
 * 普段の上下でケガになることもない。0 に落とせるのはケガのイベントだけ。
 */
function condMove(id,d){
  const cur=condOf(id);
  if(cur===COND_HURT)return cur;
  return condSet(id,clamp(cur+d,COND_MIN,COND_MAX));
}
/**
 * ケガをさせる(→docs/03 §3.32)。**ここだけが0にできる**。
 * 治療にかかる節数(2〜5)を持たせ、節が進むたびに減らす。
 */
function condInjure(id,rng){
  const C=TUNING.cond;
  if(!S.career.hurt)S.career.hurt={};
  condSet(id,COND_HURT);
  S.career.hurt[id]=rri(rng||mulberry32((S.world.seed^hashStr("heal:"+id+":"+S.career.node))>>>0),
    C.healLo,C.healHi);
  return S.career.hurt[id];
}
/** 治療中の選手と残りの節数。CLUB NEWS と秘書の催促に使う。 */
const hurtList=()=>Object.keys(S.career.hurt||{})
  .map(id=>({ id:+id, left:S.career.hurt[id] }))
  .filter(x=>cardById(x.id));
/**
 * 節が進んだときの治療の進み(→docs/03 §3.32)。
 * 残りが0になったら**自然回復して普通に戻る**。
 */
function hurtTick(){
  const H=S.career.hurt; if(!H)return [];
  const healed=[];
  for(const id of Object.keys(H)){
    H[id]--;
    if(H[id]<=0){ delete H[id]; condSet(+id,2); healed.push(+id); }
  }
  return healed;
}
/** 試合で出たケガを取り込む(→docs/03 §3.32)。**自分の選手だけ**。 */
function applyInjuries(M,side){
  const out=[];
  for(const e of M.events){
    if(e.type!=="injury"||e.side!==side)continue;
    if(!cardById(e.by))continue;                           // 貸与でも手持ちでもない選手は無視
    out.push({ id:e.by, left:condInjure(e.by) });
  }
  return out;
}
/**
 * 休息(→docs/03 §3.32)。**0〜2の選手を1段よくする**。ケガも治る。
 * 成長は無いが、崩れた調子を立て直す打ち手。
 */
function restAll(){
  const C=TUNING.cond, out=[];
  for(const id of (S.squad||[]).filter(x=>x!=null)){
    const cur=condOf(id);
    if(cur>=C.restTo)continue;                             // 好調より上には引き上げない
    if(cur===COND_HURT&&S.career.hurt)delete S.career.hurt[id];
    condSet(id,cur+1);
    out.push({ id, from:cur, to:cur+1 });
  }
  return out;
}
/**
 * 試合のあとの上下(→docs/03 §3.32)。
 *   ① **出た選手は採点で動く**。良ければ上がり、悪ければ下がる(普通なら動かない)
 *   ② 加えて**2〜3人がランダムに上下**する。全員が絶好調に揃わないための揺さぶり
 * 節と試合のたねで決まるので、同じ試合を解き直しても同じ結果になる。
 */
function condAfterMatch(M,side,seed){
  const C=TUNING.cond;
  const rows=matchRatings(M,side);
  const moved=[];
  for(const r of rows){
    if(!r.min||condHurt(r.p.c.id))continue;                // 出ていない/ケガの選手は動かない
    const d=r.rating>=C.up?1:r.rating<=C.dn?-1:0;
    if(!d)continue;
    const before=condOf(r.p.c.id);
    if(condMove(r.p.c.id,d)!==before)moved.push({ id:r.p.c.id, d, by:"stat" });
  }
  // **揺さぶり**。編成の16人から数人を選んで上下させる
  const rng=mulberry32((seed^hashStr("cond:"+S.career.node))>>>0);
  const pool=(S.squad||[]).filter(x=>x!=null);
  const n=Math.min(pool.length,rri(rng,C.shakeLo,C.shakeHi));
  const used=new Set();
  for(let i=0;i<n&&pool.length;i++){
    let id, guard=0;
    do{ id=pool[Math.floor(rng()*pool.length)]; }while(used.has(id)&&guard++<20);
    used.add(id);
    if(condHurt(id))continue;                              // ケガは揺さぶりでも動かない
    // **普通へ戻る力を持たせる**。純粋な上下だと端に溜まっていく
    const pUp=clamp(0.5+(2-condOf(id))*C.pull,0.05,0.95);
    const d=rng()<pUp?1:-1;
    condMove(id,d); moved.push({ id, d, by:"shake" });
  }
  return moved;
}
/**
 * 相手クラブのコンディション(→docs/03 §3.32)。**たねから決定的に**配る。
 * 強いクラブほど上に寄るので、格上との対戦は素の力以上に重く感じる。
 */
function condCpu(clubId,rng){
  const b=clubBias(clubById(clubId))*TUNING.cond.cpuBias;
  // 三角分布(2つの一様乱数の和)で中央に寄せ、クラブの格ぶんだけずらす
  // 相手も普段の範囲(1〜4)。ケガはイベントの話なので、たねからは配らない
  return clamp(Math.round(2+(rng()+rng()-1)*1.9+b),COND_MIN,COND_MAX);
}

/** 今節の打ち手を選ぶ。選ぶまで試合には進めない(→§3.2.3)。 */
function pickHand(id){
  if(!handById(id))return false;
  S.career.hand=id;
  return true;
}

/**
 * 今節に出る大会を選ぶ。
 * 節は「打ち手 → どの大会に出るか」の順で決める。リーグの日程は節に固定されておらず、
 * リーグを選んだ節に次の1試合を消化する(カップが割り込むため → docs/03 §3.2.3)。
 */
function compsAvailable(){
  // **勝ち残っている大会の日程はカップ一択**。リーグには出られず、辞退もできない
  if(cupMustPlay())return ["cup"];
  const out=[];
  const planned=S.career.plan[S.career.node];
  if(planned)return [planned.comp];                          // 先に予定が埋まっている節は選べない
  if(!seasonOver())out.push("league");
  return out;
}

function pickComp(id){
  if(!compsAvailable().includes(id))return false;
  S.career.comp=id;
  return true;
}

// ---------- カップ戦(→docs/03 §3.23) ----------
// **エントリーして大会ごと追う。** 開催節にエントリーすると、そこから rounds 節ぶんが
// 大会の日程として押さえられる。勝ち続ける限りカップを優先し、リーグ戦には出られない。
// 敗退したら次の節からリーグへ戻れるが、**大会が完了するまで次のカップには入れない**。

/** 開催節か(任期の節で数える)。 */
const cupDay=(cup,node)=>node%cup.every===0;
/** いま参加中のカップの定義。 */
const cupJoined=()=>S.career.cup?cupById(S.career.cup.id):null;
/** 大会の日程(節番号の配列)。エントリーした節から rounds 節ぶん。 */
function cupNodes(){
  const c=S.career.cup; if(!c)return [];
  const cup=cupById(c.id);
  return Array.from({length:cup.rounds},(_,i)=>c.node0+i);
}
/** 大会が完了する節(決勝の節)。 */
function cupLastNode(){
  const n=cupNodes();
  return n.length?n[n.length-1]:0;
}
/** その節はいま参加中の大会の日程か。 */
const cupNodeNow=()=>cupNodes().includes(S.career.node);
/** **勝ち残っていて、今節が大会の日程**か。この間はリーグに出られない。 */
const cupMustPlay=()=>{
  const c=S.career.cup;
  return !!(c&&c.alive&&!c.done&&cupNodeNow());
};
/** 今節にエントリーできるカップ。無ければ null。 */
function cupEnterable(){
  // **同時に複数はエントリーできない**。ただし塞ぐのは**進行中のあいだだけ**。
  // 終わった大会の記録は結果を見せるために残すので、done を見ないと
  // 一度出たら二度と出られなくなる(実際にそうなった)。
  if(S.career.cup&&!S.career.cup.done)return null;
  if(S.career.plan[S.career.node])return null;             // 予定が埋まっている節は不可
  // 同じ節に2つ重なったら**格の高いほう**(賞金の大きいほう)を出す
  const open=CUPS.filter(cup=>cupOpen(cup)&&cupDay(cup,S.career.node));
  return open.sort((a,b)=>b.prize[0]-a.prize[0])[0]||null;
}
/** 参加条件(熟練度・部)を満たしているか。**開催日とは別に判定する**(予告に使う)。 */
function cupOpen(cup){
  if((S.club&&S.club.exp||0)<cup.needExp)return false;
  if(cup.needDiv&&S.world.div>cup.needDiv)return false;    // DIV1 に上がると開く大会
  return true;
}
/**
 * エントリーする。**節はまだ進まない**(この節の1回戦をこれから戦う)。
 * このとき**組み合わせ表を作り切る**(→docs/03 §3.23)。以降の回戦の相手は
 * 表の上では TBD で、勝ち上がりが決まるたびに埋まっていく。
 */
function enterCup(id){
  const cup=cupEnterable();
  if(!cup||(id&&cup.id!==id))return false;
  const c={ id:cup.id, node0:S.career.node, round:1, alive:true,
    out:null, champ:null, done:false, res:[] };
  cupDraw(cup,c);
  S.career.cup=c;
  S.career.comp="cup";
  return true;
}
/**
 * 組み合わせ抽選。2^回戦 クラブの枠に、自クラブと架空クラブを重複なく並べる。
 * **ごくまれに全員 SPECIALS の強豪が1枠に入る**(勝てば手応えのある山場になる)。
 */
function cupDraw(cup,c){
  const rng=mulberry32((S.world.seed^hashStr("draw:"+cup.id+":"+S.world.season+":"+c.node0))>>>0);
  const n=Math.pow(2,cup.rounds);
  const pool=CUP_CLUBS.slice(), others=[];
  while(others.length<n-1&&pool.length)others.push(pool.splice(Math.floor(rng()*pool.length),1)[0]);
  c.slot=Math.floor(rng()*n);                                // 自クラブの位置
  c.field=others.slice(); c.field.splice(c.slot,0,clubById(S.club.id).name);
  // 強豪は自クラブ以外の枠から1つ。出ない大会のほうが多い
  c.elite=rng()<cup.elite*(n-1)?[...Array(n).keys()].filter(i=>i!==c.slot)[Math.floor(rng()*(n-1))]:-1;
}
/** いま挑む回戦。敗退後は進まない。 */
const cupRound=()=>S.career.cup?S.career.cup.round:1;

/**
 * カップに出てくるクラブの編成の内訳(→docs/03 §3.25)。
 * 大陸カップは**DIV1 のリーグ首位級**。キングズカップは自分の部の一つ上あたり。
 * 強豪(★)の枠はさらに WORLD CLASS を厚くする。
 */
function cupPlan(cup,elite){
  const R=TUNING.roster;
  if(cup.needDiv===1){
    const wc=elite?R.div1.rest:R.contiWc;
    return { REG:R.div1.REG, SPE:R.div1.rest-wc, WC:wc };
  }
  const div=clamp(S.world.div-(elite?1:0),1,3);
  const plan=rosterPlan(leagueById(clubById(S.club.id).league).tier,div,elite?1:4);
  return plan;
}
/** 枠の呼び名。強豪には目印を付ける。 */
const cupTeamName=(c,i)=>(i===c.elite?"★ ":"")+c.field[i];
/** その回戦に出そろっている枠(fieldの添字)。前の回戦が未決なら null。 */
function cupEntrants(c,round){
  if(round<=1)return c.field.map((_,i)=>i);
  const prev=c.res[round-2];
  return prev?prev.map(m=>m.w):null;
}
/** その回戦の組み合わせ。TBD の段階では null を返す。 */
function cupPairs(c,round){
  const e=cupEntrants(c,round); if(!e)return null;
  const out=[];
  for(let k=0;k<e.length;k+=2)out.push([e[k],e[k+1]]);
  return out;
}
/** 自クラブの組み合わせ。勝ち残っていなければ null。 */
function cupMyPair(c,round){
  const ps=cupPairs(c,round);
  return ps&&ps.find(p=>p[0]===c.slot||p[1]===c.slot)||null;
}
/** 枠の力。自クラブは実際の編成、架空クラブは たね から決定的に決める。 */
function cupPowOf(c,i){
  const mine=squadPower(squadCards().slice(0,TUNING.squad.starters));
  if(i===c.slot)return mine;
  const rng=mulberry32((S.world.seed^hashStr("pow:"+c.id+":"+c.node0+":"+i))>>>0);
  return mine+cupById(c.id).bias+(rng()*10-4)+(i===c.elite?8:0);
}
/** PKの結果を作る(**カップに引き分けは無い**)。 */
function cupPk(rng,winFirst){
  const lose=3+Math.floor(rng()*2);
  return winFirst?(lose+1)+"-"+lose:lose+"-"+(lose+1);
}
/** 自分が絡まない試合。エンジンは回さず、力の差から決定的に点を作る。 */
function cupSimMatch(c,i,j,round){
  const rng=mulberry32((S.world.seed^hashStr("sim:"+c.id+":"+c.node0+":"+round+":"+i+":"+j))>>>0);
  const d=(cupPowOf(c,i)-cupPowOf(c,j))/14;
  const gi=Math.max(0,Math.round(1.2+d+rng()*1.8-0.9));
  const gj=Math.max(0,Math.round(1.2-d+rng()*1.8-0.9));
  const w=gi>gj?i:gi<gj?j:(rng()<0.5?i:j);
  return { i, j, gi, gj, w, pk:gi===gj?cupPk(rng,w===i):null };
}
/**
 * 1回戦ぶんを確定させる。自分の試合があれば**その結果を表に書き込み**、
 * 残りは決定的に解く。これで TBD が次の回戦ぶんだけ埋まる。
 */
function cupResolveRound(c,round,mine){
  if(c.res[round-1])return;
  // 前の回戦が未決なら先に埋める(節を飛ばしても表が欠けないように)
  if(round>1&&!c.res[round-2])cupResolveRound(c,round-1,null);
  const ps=cupPairs(c,round); if(!ps)return;
  c.res[round-1]=ps.map(([i,j])=>{
    if(mine&&(i===c.slot||j===c.slot)){
      const me=i===c.slot;
      const gi=me?mine.gf:mine.ga, gj=me?mine.ga:mine.gf;
      const w=mine.win?c.slot:(me?j:i);
      const ps=mine.pso?(me?mine.pso.hg+"-"+mine.pso.ag:mine.pso.ag+"-"+mine.pso.hg):null;
      return { i, j, gi, gj, w,
        pk:gi===gj?ps:null };
    }
    return cupSimMatch(c,i,j,round);
  });
  // 自分の勝ち残りを表から読み直す(表が正、フラグは表の写し)
  const my=c.res[round-1].find(m=>m.i===c.slot||m.j===c.slot);
  if(my&&c.alive){
    if(my.w===c.slot)c.round=round+1;
    else { c.alive=false; c.out=round; }
  }
}
/**
 * カップの相手。**組み合わせ表で当たる枠**の編成を作る。
 * 強豪の枠は全員 SPECIALS になる。
 */
function cupSide(cup,round,foe){
  const W=S.world, c=S.career.cup;
  const rng=mulberry32((W.seed^hashStr(cup.id+":"+W.season+":"+c.node0+":"+round+":"+foe))>>>0);
  const elite=foe===c.elite;
  const base=clubBias(clubById(S.club.id));
  const saveUid=uid; uid=7000000+Math.floor(rng()*900000);  // 手持ちカードとIDをぶつけない
  const roster=makeRoster(rng,{
    club:"", ovrBias:base+cup.bias+round,                    // 勝ち上がるほど強くなる
    rarPlan:cupPlan(cup,elite) });
  uid=saveUid;
  const form=Object.keys(FORMATIONS)[Math.floor(rng()*Object.keys(FORMATIONS).length)];
  return { cards:bestXI(roster,form), form, name:cupTeamName(c,foe), elite };
}
/** カップの組み合わせ。相手はクラブ一覧に居ないので、ここで全部持つ。 */
function cupFixtureOf(){
  const cup=cupJoined(); if(!cup||!cupMustPlay())return null;
  const c=S.career.cup, round=cupRound();
  const pair=cupMyPair(c,round); if(!pair)return null;
  const foe=pair[0]===c.slot?pair[1]:pair[0];
  const side=cupSide(cup,round,foe);
  return { cup:cup.id, round, foe, home:true, side,
    label:cup.name+" "+cupRoundName(cup,round), elite:side.elite };
}
/** 大会の優勝クラブ(組み合わせ表の決勝の勝者)。 */
function cupChampSlot(c){
  const cup=cupById(c.id), fin=c.res[cup.rounds-1];
  return fin?fin[0].w:-1;
}
/**
 * 大会を締める(→docs/03 §3.23)。**賞金はここでまとめて入金する**。
 * 順位が決まった時点では払わない(4位が確定してもすぐには入らない)。
 */
function closeCup(){
  const c=S.career.cup; if(!c||c.done)return null;
  const cup=cupById(c.id);
  const slot=cupChampSlot(c);
  const win=slot===c.slot;
  const champ=slot<0?"—":c.field[slot];
  // 決勝からの距離で賞金を引く。優勝=0 / 決勝で敗退=1 / 準決勝で敗退=2 …
  const dist=win?0:Math.max(1,cup.rounds-(c.out||1)+1);
  const coin=cup.prize[Math.min(dist,cup.prize.length-1)];
  S.club.coins+=coin;
  // **名声も完了節に入る**(→docs/03 §3.9)。カップを勝ち上がるほど次の就任先が開く
  // **カップだけは順位ぶんの表を持つ**(→§3.9)。勝ち上がるほど増えるという、
  // 評価には無い勾配。§3.23 で1試合あたりの実入りを実測して調整した値なので、
  // 評価の表に吸収させない
  const fame=(cup.fame||[])[Math.min(dist,(cup.fame||[]).length-1)]||0;
  fameAdd(fame);
  if(win){
    // 任期カレンダーの決勝の行に王冠を立てる
    const last=[...S.career.log].reverse().find(e=>e.comp==="cup"&&e.cup===cup.id);
    if(last)last.champ=true;
    if(!S.player.trophies.some(t=>t.id===cup.id))
      S.player.trophies.push({ id:cup.id, name:cup.trophy, season:S.world.season, node:S.career.node });
  }
  // **オーナーの評価**(→docs/03 §3.9)。優勝は上げ、**初戦敗退は下げる**。
  // 賞金や名声と違って、ここは順位ではなく「どう戦ったか」を見ている
  const out1=!win&&c.out===1;
  const ev=win?evalAdd("cChamp",TUNING.eval.cChamp)
    :out1?evalAdd("cOut1",-TUNING.eval.cOut1):0;
  c.champ=champ; c.done=true; c.coin=coin; c.dist=dist; c.win=win; c.fame=fame;
  return { cup, champ, coin, fame, dist, win, ev, out1 };
}
/** 大会での成績の呼び名。 */
function cupPlaceName(cup,c){
  if(c.done?c.win:c.alive)return "優勝";
  const dist=cup.rounds-(c.out||1)+1;                        // 決勝で敗退=1
  return dist===1?"準優勝":"ベスト"+Math.pow(2,dist);
}

/** 試合ごとのたね。**同じ節を何度解いても同じ結果**になる(→docs/07 §7.1)。 */
function matchSeedOf(m,season,md){
  return (S.world.seed^hashStr(m.h+"vs"+m.a+":"+season+":"+md))>>>0;
}
/** 今節の自分の試合(組み合わせ)。 */
function myFixtureOf(){
  const W=S.world;
  return ((W.fixtures||[])[W.matchday-1]||[])
    .find(m=>m.h===S.club.id||m.a===S.club.id)||null;
}
/**
 * 自分の試合の状態を作る。**まだ1ティックも解かない**(→docs/07 §7.6)。
 * 描画しながら進めるとき用。スキップするなら finishMatch を呼べばよい。
 */
function beginMyMatch(){
  if(!S.career.hand)return null;
  if(!S.career.comp&&!pickComp("league"))return null;
  if(S.career.comp==="cup"){
    const f=cupFixtureOf(); if(!f)return null;
    const seed=(S.world.seed^hashStr("cup:"+f.cup+":"+S.world.season+":"+S.career.node))>>>0;
    // カップは**常にホーム扱い**。中立地なので有利不利を作らない
    const M=createMatch(matchSide(S.club.id),f.side,seed,{ ko:true });
    M.fixture={ h:S.club.id, a:null, cup:f.cup, round:f.round, label:f.label };
    M.away.name=f.side.name;
    return M;
  }
  const m=myFixtureOf(); if(!m)return null;
  const M=createMatch(matchSide(m.h),matchSide(m.a),matchSeedOf(m,S.world.season,S.world.matchday));
  M.fixture=m;
  return M;
}

/**
 * 節を確定する。自分の試合は done(解き終えた試合状態)があればその結果を使い、
 * 無ければその場で解く。**どちらでも同じ結果になる**(たねが同じなので)。
 */
function playMatchday(done){
  if(!S.career.hand)return null;                            // 打ち手が未選択なら進めない
  if(!S.career.comp&&!pickComp("league"))return null;       // 大会が未選択なら進めない
  // カップはリーグの日程を進めない。**大会が無いのに comp が cup のまま**だと
  // 何度呼んでも進まなくなるので、その場合はリーグに戻す
  if(S.career.comp==="cup"){
    if(cupFixtureOf())return playCupDay(done);
    S.career.comp=null;
    if(!pickComp("league"))return null;
  }
  const W=S.world, md=W.matchday, round=(W.fixtures||[])[md-1]||[];
  const out={ my:null, others:[], M:null };

  round.forEach(m=>{
    const isMine=m.h===S.club.id||m.a===S.club.id;
    const seed=matchSeedOf(m,W.season,md);
    let hg,ag;
    if(isMine){
      // 自分の試合は**必ず試合状態そのものを残す**。結果画面のスタッツ・採点は
      // これを数え直して作る(→docs/06 §6.20)。観戦せず自動消化しても中身は同じ。
      const M=done||finishMatch(createMatch(matchSide(m.h),matchSide(m.a),seed));
      if(!M.fixture)M.fixture=m;
      out.M=M; hg=M.home.score; ag=M.away.score;
    }else{
      const r=resolveMatch(matchSide(m.h),matchSide(m.a),seed);
      hg=r.hg; ag=r.ag;
    }
    applyResult(W.table,m.h,m.a,hg,ag);
    if(isMine){
      const home=m.h===S.club.id, gf=home?hg:ag, ga=home?ag:hg;
      out.my={ opp:home?m.a:m.h, home, gf, ga, win:gf>ga, draw:gf===ga };
      W.results[md]=out.my;                                  // 日程画面で過去のスコアを出すため
      S.club.coins+=gf>ga?TUNING.reward.win:gf===ga?TUNING.reward.draw:TUNING.reward.lose;
      S.club.exp+=gf>ga?350:gf===ga?220:150;              // チーム熟練度(→§3.7)
      // オーナーの評価(→§3.9)。**格が違う相手との結果だけ**が動かす
      evalMatch(squadPowerAt(squadCards(),S.form),
        squadPowerAt(cpuSquad(out.my.opp).cards,formFor(out.my.opp)),gf>ga,gf<ga);
      bondMatch();                                         // 連携(→§3.31)。一戦ごとに積む
      condAfterMatch(out.M,home?"H":"A",seed);             // 出来(→§3.32)
      out.hurt=applyInjuries(out.M,home?"H":"A");          // ケガ(→§3.32)
    }else out.others.push({ h:m.h, a:m.a, hg, ag });
  });

  // 任期の記録(カレンダーの過去行になる)。打ち手と試合を1節としてまとめる。
  const my=out.my;
  S.career.log.push({
    node:S.career.node, season:W.season, clubId:S.club.id, hand:S.career.hand,
    comp:"league", md,
    opp:my?my.opp:null, home:my?my.home:null, gf:my?my.gf:null, ga:my?my.ga:null,
    res:my?(my.win?"win":my.draw?"draw":"lose"):null,
  });
  out.cupClosed=advanceNode();     // 大会の最終節がリーグの節に重なることがある
  W.matchday++;
  return out;
}

/**
 * カップの1節(→docs/03 §3.23)。**リーグの日程は進めない**(節を消費するだけ)。
 * 勝てば次の回戦へ、負ければ勝ち抜きは消える。決勝を勝てば賞金とトロフィー。
 */
function playCupDay(done){
  const W=S.world, C=S.career;
  const f=cupFixtureOf(); if(!f)return null;
  const cup=cupById(f.cup);
  const seed=(W.seed^hashStr("cup:"+f.cup+":"+W.season+":"+C.node))>>>0;
  const M=done||finishMatch(createMatch(matchSide(S.club.id),f.side,seed,{ ko:true }));
  if(!M.fixture)M.fixture={ h:S.club.id, a:null, cup:f.cup, round:f.round, label:f.label };
  const gf=M.home.score, ga=M.away.score;
  // **カップに引き分けは無い**。並んだらPK戦で決める(→docs/03 §3.33)
  const win=gf>ga||(gf===ga&&M.pso&&M.pso.win==="H");
  const pso=M.pso||null;

  // **結果は組み合わせ表に書き込む**。勝ち残りは表から読み直す
  cupResolveRound(C.cup,f.round,{ gf, ga, win, pso });
  S.club.exp+=win?350:150;
  bondMatch();                                             // カップも1試合(→§3.31)
  condAfterMatch(M,"H",seed);                              // 出来(→§3.32)。カップは常にホーム

  const out={ my:{ opp:null, oppName:f.side.name, home:true, gf, ga,
    win, draw:false, cup:f.cup, round:f.round, label:f.label,
    pso:pso?{ gf:pso.hg, ga:pso.ag }:null }, others:[], M,
    hurt:applyInjuries(M,"H") };

  C.log.push({
    node:C.node, season:W.season, clubId:S.club.id, hand:C.hand,
    comp:"cup", cup:cup.id, label:f.label, oppName:f.side.name,
    gf, ga, res:win?"win":"lose",
  });
  out.cupClosed=advanceNode();
  return out;
}

/**
 * 節を1つ進める。**大会の最終節を越えたらそこで大会を締める**(→docs/03 §3.23)。
 * 賞金はこのときにまとめて入る。負けて先に順位が決まっていても、入金はここ。
 */
function advanceNode(){
  const C=S.career, c=C.cup;
  // 敗退したあとも大会は進む。**その節の回戦を裏で確定させる**(表を見に行けば分かる)
  if(c&&!c.done){
    const r=C.node-c.node0+1;
    if(r>=1&&r<=cupById(c.id).rounds&&!c.res[r-1])cupResolveRound(c,r,null);
  }
  const closed=(c&&!c.done&&C.node>=cupLastNode())?closeCup():null;
  C.node++;
  hurtTick();                                               // 治療が1節ぶん進む(→§3.32)
  C.hand=null; C.comp=null; C.chat=null;                    // 次節はまた選び直す
  checkTenureClosing();
  return closed;
}

const seasonOver=()=>S.world.matchday>(S.world.fixtures||[]).length;

/**
 * シーズン終了時の審判(→docs/03 §3.24)。
 * **クラブは替わらない。** 決まるのは 昇格 / 残留 / 降格 と、任期の残りだけ。
 * 評価が下限を割ると任期が削られ、好成績なら上限に達したときに延命する。
 */
function judgeSeason(){
  const W=S.world;
  const rank=rankOf(W.table,S.club.id);
  const goal=S.club.expect;                      // オーナーが季の頭に告げた目標順位
  const diff=goal-rank;                          // 正なら目標を上回った
  const evLog=S.club.evLog||{};
  // **リーグ優勝は評価に乗る**(→§3.9)。目標達成は金の話で、優勝は内容の話
  if(rank===1)evalAdd("lChamp",TUNING.eval.lChamp);
  // **順位が確定したこの時点で入れ替えを行う**。世界のほうも同時に動く
  const move=applyPromotion(rank);
  // 昇格も内容の話。金(昇格報酬)とは別に、評価と経歴に残る
  if(move.promoted)evalAdd("promote",TUNING.eval.promote);
  // 名声は**評価に相乗りして季の途中で積んである**(→evalAdd)。ここでは合計を渡すだけ
  const fameGain=S.club.fameSeason||0;
  // **シーズン末の賞金**(→docs/03 §3.24)。昇格に厚く積み、補強の元手にする。
  // 目標を上回れば一時金、届かなければ減俸(→§3.9)。合計は0を下回らせない
  const R=TUNING.reward.season, n=TUNING.league.clubs;
  const goalCoin=diff>=0?R.goalHit+R.goalStep*diff:-R.goalMiss*(-diff);
  const coin=Math.max(0,R.base+R.perRank*(n-rank)
    +(rank===1?R.champ:0)
    +(move.promoted?R.promote:0)+(move.relegated?R.relegate:0)
    +goalCoin);
  S.club.coins+=coin;
  const h=S.player.history[S.player.history.length-1];
  if(h){ h.rank=rank; h.result=move.promoted?"昇格":move.relegated?"降格":"残留"; }
  // 大会が決着したこの時点で、任期の去就も決まる(→§3.2.3)
  const tenure=judgeTenure();
  // **次のシーズンの目標**は昇降格のあとに決まる。総括で告げるので、ここで確定させる
  const nextGoal=S.career.over?null
    :expectedRank(W.seed,S.club.id,squadPower(squadCards().slice(0,TUNING.squad.starters)));
  if(nextGoal)S.club.expect=nextGoal;
  return { rank, goal, diff, fameGain, move, tenure, coin, goalCoin, nextGoal,
    eval:S.club.eval, evLog };
}
/**
 * 次のシーズンを始める。**同じクラブのまま、決まった部で組み直す**。
 * 借りている選手(loan)も熟練度も評価も持ち越す。
 */
function startNextSeason(){
  const W=S.world;
  W.season++;
  // **部が変われば、クラブも編成を入れ替える**(→docs/03 §3.25)。
  // 昇格したのに下の部の顔ぶれのままだと、上がった手応えが出ない
  // **貸与の顔ぶれは任期のあいだ変えない**(→docs/03 §3.24)。
  // 昇降格のたびに選手が入れ替わると、育てた実感も訓練の★も毎季リセットされてしまう。
  // 上の部で戦う戦力は、賞金で補強して自分で作る。
  const league=divClubs();
  const rng=mulberry32((W.seed^hashStr(S.club.id+":"+W.season+":d"+W.div))>>>0);
  W.table=emptyTable(league);
  W.fixtures=makeFixtures(league,rng);
  W.results={};
  W.matchday=1;
  // 目標順位は**総括で告げた値**をそのまま使う(judgeSeason が確定させている)。
  // ここで引き直すと、オーナーが言った数字と実際の目標がずれる
  S.club.evLog={}; S.club.fameSeason=0;
  S.player.history.push({ season:W.season, clubId:S.club.id, div:W.div, result:"在任" });
}
