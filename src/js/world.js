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
  // **就任時の陣形も名簿に合わせる**(→docs/07 §7.14)。CPUが名簿に合う陣形を選ぶのに
  // 自分だけ既定の 4-4-2 のままだと、枠適性のロスを一方的に背負って始めることになる。
  // もちろん DECK でいつでも変えられる。
  S.form=bestFormFor(availableCards());
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
    return { cards:squadCards(), form:S.form, name:club.name,
      kickers:S.kickers, captain:S.captain };
  const roster=clubRoster(S.world.seed,clubId);
  const form=formFor(clubId);
  return { cards:bestXI(roster,form), form, name:club.name };
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
  if(cupOpen())out.push("cup");
  return out;
}

// ---------- カップ戦(→docs/03 §3.23) ----------
// **参加条件を満たした節にだけ出られる。** リーグと同じ「1節=1試合」の枠を使い、
// 1節で1回戦ぶんだけ勝ち上がる。負けたら勝ち抜きは消え、次の開催でまた1回戦から。

/** 今節に出られるカップ。無ければ null。 */
function cupOf(){
  const C=S.career;
  for(const cup of CUPS){
    if(C.node%cup.every!==0)continue;                        // 開催サイクル(任期の節で数える)
    if((S.club&&S.club.exp||0)<cup.needExp)continue;         // 参加条件(チーム熟練度)
    return cup;
  }
  return null;
}
const cupOpen=()=>!!cupOf();
/** いま挑んでいる回戦。勝ち抜き中でなければ1回戦。 */
function cupRound(){
  const c=S.career.cup, cup=cupOf();
  return (c&&cup&&c.id===cup.id)?c.round:1;
}
/**
 * カップの相手。**自クラブと同等かやや強い**編成を、節ごとに決定的に作る。
 * ごくまれに**全員 SPECIALS** の強豪が現れる(勝てば手応えのある山場になる)。
 */
function cupSide(cup,round){
  const W=S.world;
  const rng=mulberry32((W.seed^hashStr(cup.id+":"+W.season+":"+S.career.node+":"+round))>>>0);
  const elite=rng()<cup.elite;
  const base=clubBias(clubById(S.club.id));
  const saveUid=uid; uid=7000000+Math.floor(rng()*900000);  // 手持ちカードとIDをぶつけない
  const roster=makeRoster(rng,{
    club:"", ovrBias:base+cup.bias+round,                    // 勝ち上がるほど強くなる
    rarity:elite?"SPE":null });
  uid=saveUid;
  const name=(elite?"★ ":"")+CUP_CLUBS[Math.floor(rng()*CUP_CLUBS.length)];
  const form=Object.keys(FORMATIONS)[Math.floor(rng()*Object.keys(FORMATIONS).length)];
  return { cards:bestXI(roster,form), form, name, elite };
}
/** カップの組み合わせ。相手はクラブ一覧に居ないので、ここで全部持つ。 */
function cupFixtureOf(){
  const cup=cupOf(); if(!cup)return null;
  const round=cupRound();
  const side=cupSide(cup,round);
  return { cup:cup.id, round, home:true, side,
    label:cup.name+" "+cupRoundName(cup,round), elite:side.elite };
}
function pickComp(id){
  if(!compsAvailable().includes(id))return false;
  S.career.comp=id;
  return true;
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
    const M=createMatch(matchSide(S.club.id),f.side,seed);
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
  if(S.career.comp==="cup")return playCupDay(done);         // カップはリーグの日程を進めない
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

/**
 * カップの1節(→docs/03 §3.23)。**リーグの日程は進めない**(節を消費するだけ)。
 * 勝てば次の回戦へ、負ければ勝ち抜きは消える。決勝を勝てば賞金とトロフィー。
 */
function playCupDay(done){
  const W=S.world, C=S.career;
  const f=cupFixtureOf(); if(!f)return null;
  const cup=cupById(f.cup);
  const seed=(W.seed^hashStr("cup:"+f.cup+":"+W.season+":"+C.node))>>>0;
  const M=done||finishMatch(createMatch(matchSide(S.club.id),f.side,seed));
  if(!M.fixture)M.fixture={ h:S.club.id, a:null, cup:f.cup, round:f.round, label:f.label };
  const gf=M.home.score, ga=M.away.score;
  // **カップに引き分けは無い**。同点なら回戦の重みで決める(たねが同じなら結果も同じ)
  const win=gf>ga||(gf===ga&&mulberry32(seed>>>1)()<0.5);
  const final=f.round>=cup.rounds;
  const champ=win&&final;

  const out={ my:{ opp:null, oppName:f.side.name, home:true, gf, ga,
    win, draw:false, cup:f.cup, round:f.round, label:f.label, champ }, others:[], M };

  S.club.exp+=win?350:150;
  if(champ){
    S.club.coins+=cup.coin;
    // **初優勝だけ実績になる**(2度目からは賞金だけ)
    if(!S.player.trophies.some(t=>t.id===cup.id))
      S.player.trophies.push({ id:cup.id, name:cup.trophy, season:W.season, node:C.node });
  }
  C.cup=win&&!final?{ id:cup.id, round:f.round+1 }:null;    // 負け or 優勝でリセット

  C.log.push({
    node:C.node, season:W.season, clubId:S.club.id, hand:C.hand,
    comp:"cup", cup:cup.id, label:f.label, oppName:f.side.name,
    gf, ga, res:win?"win":"lose", champ,
  });
  C.node++;
  C.hand=null; C.comp=null;
  checkTenureClosing();
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
