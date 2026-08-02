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

// --- クラブ(各リーグ8クラブ = 計48)。rank 1 がリーグ内最上位。
// 実在クラブが元ネタと分かる程度に改変した名前を使う(→docs/03 §3.13 の商標方針)。
const CLUB_NAMES={
  eng:   ["マンチェスター・レッズ","マンチェスター・スカイ","ロンドン・ガナーズ","リヴァプール・コップ","ロンドン・ブルーズ","ノースロンドン・スパーズ","タインサイド・マグパイズ",
          "バーミンガム・ヴィランズ"],
  esp:   ["マドリード・ブランコス","カタルーニャ・ブラウグラナ","マドリード・コルチョネロス","セビージャ・ネルビオン","バレンシア・チェ","ビルバオ・レオネス","サンセバスティアン・レアレス",
          "アンダルシア・ベティコス"],
  ita:   ["トリノ・ビアンコネーリ","ミラノ・ロッソネーリ","ミラノ・ネラッズーリ","ナポリ・パルテノペイ","ローマ・ジャッロロッシ","ローマ・チェレスティ","フィレンツェ・ヴィオラ",
          "ベルガモ・オロビチ"],
  ger:   ["ミュンヘン・ローテン","ドルトムント・シュヴァルツゲルプ","レヴァークーゼン・ヴェルクセルフ","ライプツィヒ・ローテブレン","ゲルゼンキルヒェン・クナッペン","フランクフルト・アドラー",
          "シュトゥットガルト・ブルステン","ブレーメン・グリューンヴァイス"],
  fra:   ["パリ・キャピタル","マルセイユ・オリンピアン","リヨン・ゴーヌ","モナコ・ルージュブラン","リール・ドーグ","レンヌ・ルージュノワール","ニース・エーグロン","ナント・カナリ"],
  sam:   ["リオ・ルブロネグロ","サンパウロ・ヴェルダン","ブエノスアイレス・ボンボネーラ","ブエノスアイレス・ミジョナリオス","サンパウロ・チマォン","サントス・ペイシェ","モンテビデオ・カルボネーロ",
          "メデジン・ベルデ"],
};
const CLUBS=[];
LEAGUES.forEach(lg=>{
  CLUB_NAMES[lg.id].forEach((name,i)=>{
    CLUBS.push({
      id:lg.id+"-"+(i+1), name, league:lg.id, rank:i+1,
      abbr:(lg.abbr+(i+1)),
      // クラブの格(1..10)。リーグの格とクラブ順位から決める。就任先選びの目安になる。
      grade:clamp(Math.round(lg.tier*1.5+(8-i)*0.55),1,10),
    });
  });
});
const clubById=id=>CLUBS.find(c=>c.id===id);
const clubsOf=leagueId=>CLUBS.filter(c=>c.league===leagueId);

/** クラブの戦力水準(生成される選手のOVR補正)。リーグの格 × クラブ順位。 */
function clubBias(club){
  const lg=leagueById(club.league);
  return Math.round((lg.tier-3.5)*2.7 + (4.5-club.rank)*2.2);
}

/** クラブの所属選手を決定的に再生成する(貸与される戦力・CPUの戦力の両方に使う)。 */
function clubRoster(seed,clubId){
  const club=clubById(clubId);
  const rng=mulberry32((seed^hashStr(clubId))>>>0);
  const saveUid=uid; uid=1000000+(hashStr(clubId)%900000);   // クラブ選手のIDは別空間に置く
  const roster=makeRoster(rng,{ club:club.name, ovrBias:clubBias(club),
    nations:nationBox(leagueById(club.league)) });
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
  const league=clubsOf(clubById(clubId).league).map(c=>c.id);
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
  const lg=leagueById(club.league);
  return Math.max(0,Math.round((lg.tier-1)*1200+(8-club.rank)*180-560));
}
const offersFor=fame=>CLUBS.filter(c=>requiredFame(c)<=fame);

/** 新しい任期を開始する(就任)。S.club / S.world をこのクラブ用に組み直す。 */
function startTenure(clubId){
  const seed=S.world.seed;
  const league=clubsOf(clubById(clubId).league).map(c=>c.id);
  const rng=mulberry32((seed^hashStr(clubId+":"+S.world.season))>>>0);
  S.club={
    id:clubId,
    coins:Math.round(3000*leagueById(clubById(clubId).league).money),
    fac:{ training:0, medical:0, stadium:0, scouting:0 },   // 施設(第4段で使う)
    exp:0,                                                   // チーム熟練度(→§3.7)
    eval:TUNING.eval.start,                                  // 会長の評価
    loan:clubRoster(seed,clubId),                            // 任期中だけ借りる所属選手
    expect:0,
  };
  S.world.table=emptyTable(league);
  S.world.fixtures=makeFixtures(league,rng);
  S.world.results={};
  S.world.matchday=1;
  S.squad=autoSquad();
  S.club.expect=expectedRank(seed,clubId,squadPower(squadCards().slice(0,TUNING.squad.starters)));
  S.player.history.push({ season:S.world.season, clubId, result:"在任" });
}

/**
 * 試合エンジンに渡すチーム(→docs/07)。自クラブは編成、他クラブは名簿の並びをそのまま使う。
 * 他クラブの編成は決定的に再生成されるので、セーブに持たなくても毎回同じ11人になる。
 */
function matchSide(clubId){
  const club=clubById(clubId);
  if(S.club&&clubId===S.club.id)
    return { cards:squadCards(), form:S.form, name:club.name };
  const roster=clubRoster(S.world.seed,clubId);
  const form=formFor(clubId);
  return { cards:bestXI(roster,form), form, name:club.name };
}
/** クラブの陣形。クラブIDから決定的に選ぶ(クラブごとに一貫した色になる)。 */
function formFor(clubId){
  const keys=Object.keys(FORMATIONS);
  return keys[hashStr(clubId+":form")%keys.length];
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
  const rest=roster.filter(c=>!used.has(c.id)).sort((a,b)=>b.ovr-a.ovr);
  return xi.concat(rest.slice(0,TUNING.squad.bench));
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
/** 控えは素の OVR 順に上位を取る。足りなければ null で埋めて枠数は保つ。 */
function pickBench(rest){
  const b=rest.slice().sort((a,c)=>c.ovr-a.ovr)
    .slice(0,TUNING.squad.bench).map(c=>c.id);
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

// --- 会長の評価(→docs/03 §3.9) ---
/**
 * 評価は**累積しない**。「今の順位が期待に対してどうか」から毎回導出する。
 *
 * 累積式にすると、期待1位のクラブは (期待-順位) が常に0以下にしかならず評価が減る一方になり、
 * 逆に期待最下位のクラブは常に0以上で決してクビにならない、という非対称が生まれる。
 * 導出式なら「期待どおり = start」「上回れば上、下回れば下」が順位に関わらず対称に効く。
 */
function chairmanEval(){
  const r=rankOf(S.world.table,S.club.id);
  return clamp(TUNING.eval.start+(S.club.expect-r)*TUNING.eval.perRank,0,TUNING.eval.max);
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
 * 順位表・コイン・チーム熟練度・会長の評価を更新する。
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
 * 上限前なら何も起きない。上限に達していれば、成績次第で延命 or 任期終了。
 */
function judgeTenure(rank){
  if(!checkTenureClosing())return null;
  if(S.career.limit<TUNING.tenure.hardMax&&rank<=TUNING.tenure.extendRank){
    S.career.limit=Math.min(TUNING.tenure.hardMax,S.career.limit+TUNING.tenure.extend);
    S.career.closing=false;
    return { extended:true, limit:S.career.limit };
  }
  S.career.over=true;
  return { extended:false };
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
  const out=[];
  const planned=S.career.plan[S.career.node];
  if(planned)return [planned.comp];                          // 先に予定が埋まっている節は選べない
  if(!seasonOver())out.push("league");
  // "cup" は大陸大会の実装後に足す
  return out;
}
function pickComp(id){
  if(!compsAvailable().includes(id))return false;
  S.career.comp=id;
  return true;
}

function playMatchday(){
  if(!S.career.hand)return null;                            // 打ち手が未選択なら進めない
  if(!S.career.comp&&!pickComp("league"))return null;       // 大会が未選択なら進めない
  const W=S.world, md=W.matchday, round=(W.fixtures||[])[md-1]||[];
  const out={ my:null, others:[] };

  round.forEach(m=>{
    const isMine=m.h===S.club.id||m.a===S.club.id;
    // 試合ごとに独立したたねを使う。**同じ節を何度解いても同じ結果**になり、
    // 描画するかどうかで結果が変わらない(→docs/07 §7.1)。
    const seed=(W.seed^hashStr(m.h+"vs"+m.a+":"+W.season+":"+md))>>>0;
    const { hg, ag }=resolveMatch(matchSide(m.h),matchSide(m.a),seed);
    applyResult(W.table,m.h,m.a,hg,ag);
    if(isMine){
      const home=m.h===S.club.id, gf=home?hg:ag, ga=home?ag:hg;
      out.my={ opp:home?m.a:m.h, home, gf, ga, win:gf>ga, draw:gf===ga };
      W.results[md]=out.my;                                  // 日程画面で過去のスコアを出すため
      S.club.coins+=gf>ga?TUNING.reward.win:gf===ga?TUNING.reward.draw:TUNING.reward.lose;
      S.club.exp+=gf>ga?350:gf===ga?220:150;              // チーム熟練度(→§3.7)
      S.club.eval=chairmanEval();
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
  S.career.node++;
  S.career.hand=null; S.career.comp=null;                   // 次節はまた選び直す
  checkTenureClosing();
  W.matchday++;
  return out;
}

const seasonOver=()=>S.world.matchday>(S.world.fixtures||[]).length;

/** シーズン終了時の審判: 期待順位との差で 続投 / 解任 / オファー を決める。 */
function judgeSeason(){
  const rank=rankOf(S.world.table,S.club.id);
  const diff=S.club.expect-rank;                 // 正なら期待を上回った
  S.club.eval=chairmanEval();
  const fameGain=Math.round(diff*140+(rank===1?900:0));
  S.player.fame=Math.max(0,S.player.fame+fameGain);
  const h=S.player.history[S.player.history.length-1];
  if(h){ h.rank=rank; h.result=S.club.eval<TUNING.eval.floorDismiss?"解任":"続投"; }
  // 大会が決着したこの時点で、任期の去就も決まる(→§3.2.3)
  const tenure=judgeTenure(rank);
  return { rank, diff, fameGain, dismissed:S.club.eval<TUNING.eval.floorDismiss, tenure };
}
