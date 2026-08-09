// ================= 実在選手カード(WORLD CLASS / LEGENDS) =================
// 自動生成しない、**手で定義する**カード。パックからは出ず、トロフィーや実績など
// 別経路で配る(→docs/03 §3.13)。card-eleven のシグネチャーにあたる。
//
// 商標を持ち込まないため(→docs/03 §3.13「実在選手の扱い」):
//   ・クラブ名は**実在の元ネタが分かる程度に改変**した名前を使う
//   ・イラストのスポンサー・エンブレムは架空の意匠に置き換える
//   ・メーカーロゴは描かない
//
// art は src/assets/players/<art>_stand|play|goal.webp に対応する。
// 画像が無くてもカードは成立する(プレースホルダ表示になるだけ)。

// LEGENDS は 82〜90(→data.js RARITY)。**6能力の合計がそのまま OVR** なので、
// 尖らせるほどどこかを削ることになる。§3.37 で pow/tec/spd はどれも幹を持つように
// 直したので、**型の違いがそのまま持ち味になる**(速い / 強い / 巧い)。
//
// 札は4枚(LEGENDS)。いまは**既存の札から選ぶ**だけで、固有スキルはまだ持たせていない。
// subs[0] がプライマリ。**複数の枠をこなす選手は、そのぶん編成の自由が利く**
// (枠適性が下がらないので、陣形を変えても置き場所が残る →§3.16)。
// nat … NATIONS に無い国籍の表示名(チェコなど)。書けばそのまま出る。
const SIGNATURES=[
  // ---------- GK ----------
  {
    id:"buffon", art:"le_gk01_buffon", rarity:"LEG",
    name:"G. ブッフォン", short:"ブッフォン",
    club:"トリノ・ビアンコネーリ", nation:"ita",
    pos:"GK", subs:["GK"], age:30,
    atk:3, def:20, pow:18, tec:17, spd:12, sta:14,               // 84
    skills:["セービング","PKストップ","ハイボール処理","守備の統率"],
  },
  // ---------- DF ----------
  {
    id:"beckenbauer", art:"le_cb01_beckenbauer", rarity:"LEG",
    name:"F. ベッケンバウアー", short:"ベッケンバウアー",
    club:"ミュンヘン・レーヴェン", nation:"ger",
    pos:"DF", subs:["CB","DMF"], age:28,
    atk:9, def:20, pow:15, tec:18, spd:13, sta:14,               // 89
    skills:["対人守備","カバーリング","正確なフィード","キャプテンシー"],
  },
  {
    id:"rcarlos", art:"le_lsb01_roberto_carlos", rarity:"LEG",
    name:"R. カルロス", short:"カルロス",
    club:"マドリー・ブランコス", nation:"bra",
    pos:"DF", subs:["LSB","LMF"], age:27,
    atk:10, def:15, pow:18, tec:14, spd:20, sta:12,              // 89
    skills:["オーバーラップ","正確なクロス","スピード","セットプレーの名手"],
  },
  {
    id:"zanetti", art:"le_rsb01_zanetti", rarity:"LEG",
    name:"J. サネッティ", short:"サネッティ",
    club:"ミラノ・ネラッズーリ", nation:"arg",
    pos:"DF", subs:["RSB","LSB","DMF","CMF"], age:29,
    atk:8, def:18, pow:14, tec:14, spd:16, sta:20,               // 90
    skills:["対人守備","厳しい寄せ","推進力","鉄人"],
  },
  // ---------- MF ----------
  {
    id:"matthaus", art:"le_dmf01_matthaus", rarity:"LEG",
    name:"L. マテウス", short:"マテウス",
    club:"ミュンヘン・レーヴェン", nation:"ger",
    pos:"MF", subs:["DMF","CMF","CB"], age:29,
    atk:12, def:17, pow:16, tec:15, spd:13, sta:16,              // 89
    skills:["ボール奪取","ロングシュート","展開力","キャプテンシー"],
  },
  {
    id:"schweinsteiger", art:"le_cmf01_schweinsteiger", rarity:"LEG",
    name:"B. シュヴァインシュタイガー", short:"シュヴァイニー",
    club:"ミュンヘン・レーヴェン", nation:"ger",
    pos:"MF", subs:["CMF","DMF","LMF","RMF"], age:28,
    atk:11, def:16, pow:15, tec:18, spd:12, sta:17,              // 89
    skills:["キープ力","展開力","運動量","ムードメーカー"],
  },
  {
    id:"nedved", art:"le_lmf01_nedved", rarity:"LEG",
    name:"P. ネドヴェド", short:"ネドヴェド",
    club:"トリノ・ビアンコネーリ", nation:"cze", nat:"チェコ",
    pos:"MF", subs:["LMF","OMF"], age:28,
    atk:14, def:12, pow:15, tec:16, spd:16, sta:17,              // 90
    skills:["運動量","ミドルの精度","ドリブル","鉄人"],
  },
  {
    id:"zidane", art:"le_omf01_zidane", rarity:"LEG",
    name:"Z. ジダン", short:"ジダン",
    club:"マドリー・ブランコス", nation:"fra",
    pos:"MF", subs:["OMF","CMF"], age:29,
    atk:15, def:8, pow:15, tec:20, spd:13, sta:14,               // 85
    skills:["視野の広さ","スルーパス","キープ力","パスの精度"],
  },
  {
    id:"beckham", art:"le_rmf01_beckham", rarity:"LEG",
    name:"D. ベッカム", short:"ベッカム",
    club:"マンチェスター・レッズ", nation:"eng",
    pos:"MF", subs:["RMF","CMF"], age:27,
    atk:13, def:10, pow:16, tec:19, spd:12, sta:15,              // 85
    skills:["サイドチェンジ","パスの精度","展開力","セットプレーの名手"],
  },
  // ---------- FW ----------
  {
    id:"ronaldinho", art:"le_lwg01_ronaldinho", rarity:"LEG",
    name:"ロナウジーニョ", short:"ロナウジーニョ",
    club:"バルサローナ・ブラウグラナ", nation:"bra",
    pos:"FW", subs:["LWG","OMF"], age:25,
    atk:16, def:5, pow:13, tec:20, spd:16, sta:12,               // 82
    skills:["ドリブル突破","カットイン","切れ込みの鋭さ","ムードメーカー"],
  },
  {
    // **WORLD CLASS から昇格**(2026-08-09)。同じ絵が LEGENDS の素材として届いたので、
    // 同じ人物のカードを2枚に分けず、こちらへ寄せた
    id:"ronaldo", art:"le_rwg01_ronaldo", rarity:"LEG",
    name:"C. ロナウド", short:"ロナウド",
    club:"マンチェスター・レッズ", nation:"por",
    pos:"FW", subs:["RWG","ST"], age:23,
    atk:18, def:5, pow:17, tec:16, spd:19, sta:13,               // 88
    skills:["ドリブル突破","カットイン","決定力","スピード"],
  },
  {
    id:"inzaghi", art:"le_st01_inzaghi", rarity:"LEG",
    name:"F. インザーギ", short:"インザーギ",
    club:"ミラノ・ロッソネリ", nation:"ita",
    pos:"FW", subs:["ST","CF"], age:28,
    atk:20, def:4, pow:13, tec:14, spd:17, sta:14,               // 82
    skills:["ゴール前の嗅覚","オフザボール","詰めの速さ","決定力"],
  },
];
const signatureById=id=>SIGNATURES.find(s=>s.id===id);

/**
 * 定義から実際のカードを作る。OVR は必ず6能力の合計で揃え直す(→docs/03 §3.12)。
 * IDは所持カードとぶつからない領域から採る。
 */
function makeSignature(def){
  const st={}; STAT_KEYS.forEach(k=>st[k]=def[k]);
  return {
    id:8000000+SIGNATURES.indexOf(def),
    name:def.name, pos:def.pos, subs:def.subs.slice(),
    rarity:def.rarity, ovr:calcOvr(def.pos,st),
    age:def.age, nation:def.nation, nat:def.nat||null,
    ...st,
    skills:def.skills.slice(),
    club:def.club,
    art:def.art,            // イラストのキー(無ければプレースホルダ)
    sig:def.id,             // 実在選手カードの印
  };
}
const signatureCards=()=>SIGNATURES.map(makeSignature);
