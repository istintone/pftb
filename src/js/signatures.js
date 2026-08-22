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
// 札は4枚(LEGENDS)。**1枚目は固有スキル**(→docs/03 §3.41)で、その選手しか持たない。
// subs[0] がプライマリ。**複数の枠をこなす選手は、そのぶん編成の自由が利く**
// (枠適性が下がらないので、陣形を変えても置き場所が残る →§3.16)。
// nat … NATIONS に無い国籍の表示名(チェコなど)。書けばそのまま出る。
const SIGNATURES=[
  // ---------- GK ----------
  {
    n:0, id:"buffon", art:"le_gk01_buffon", rarity:"LEG",
    name:"G. ブッフォン", short:"ブッフォン",
    club:"トリノ・ビアンコネーリ", nation:"ita",
    pos:"GK", subs:["GK"], age:30,
    atk:3, def:20, pow:18, tec:17, spd:12, sta:14,               // 84
    skills:["不動の門番","PKストップ","ハイボール処理","守備の統率"],
  },
  // ---------- DF ----------
  {
    n:1, id:"beckenbauer", art:"le_cb01_beckenbauer", rarity:"LEG",
    name:"F. ベッケンバウアー", short:"ベッケンバウアー",
    club:"ミュンヘン・レーヴェン", nation:"ger",
    pos:"DF", subs:["CB","DMF"], age:28,
    atk:9, def:20, pow:15, tec:18, spd:13, sta:14,               // 89
    skills:["皇帝のフィード","対人守備","カバーリング","キャプテンシー"],
  },
  {
    n:2, id:"rcarlos", art:"le_lsb01_roberto_carlos", rarity:"LEG",
    name:"R. カルロス", short:"カルロス",
    club:"マドリー・ブランコス", nation:"bra",
    pos:"DF", subs:["LSB","LMF"], age:27,
    atk:10, def:15, pow:18, tec:14, spd:20, sta:12,              // 89
    skills:["弾丸の左足","オーバーラップ","スピード","正確なクロス"],
  },
  {
    n:3, id:"zanetti", art:"le_rsb01_zanetti", rarity:"LEG",
    name:"J. サネッティ", short:"サネッティ",
    club:"ミラノ・ネラッズーリ", nation:"arg",
    pos:"DF", subs:["RSB","LSB","DMF","CMF"], age:29,
    atk:8, def:18, pow:14, tec:14, spd:16, sta:20,               // 90
    skills:["不動の右","厳しい寄せ","推進力","鉄人"],
  },
  // ---------- MF ----------
  {
    n:4, id:"matthaus", art:"le_dmf01_matthaus", rarity:"LEG",
    name:"L. マテウス", short:"マテウス",
    club:"ミュンヘン・レーヴェン", nation:"ger",
    pos:"MF", subs:["DMF","CMF","CB"], age:29,
    atk:12, def:17, pow:16, tec:15, spd:13, sta:16,              // 89
    skills:["中盤の掌握","ボール奪取","展開力","キャプテンシー"],
  },
  {
    n:5, id:"schweinsteiger", art:"le_cmf01_schweinsteiger", rarity:"LEG",
    name:"B. シュヴァインシュタイガー", short:"シュヴァイニー",
    club:"ミュンヘン・レーヴェン", nation:"ger",
    pos:"MF", subs:["CMF","DMF","LMF","RMF"], age:28,
    atk:11, def:16, pow:15, tec:18, spd:12, sta:17,              // 89
    skills:["不屈の心臓","キープ力","展開力","ムードメーカー"],
  },
  {
    n:6, id:"nedved", art:"le_lmf01_nedved", rarity:"LEG",
    name:"P. ネドヴェド", short:"ネドヴェド",
    club:"トリノ・ビアンコネーリ", nation:"cze", nat:"チェコ",
    pos:"MF", subs:["LMF","OMF"], age:28,
    atk:14, def:12, pow:15, tec:16, spd:16, sta:17,              // 90
    skills:["疾風の推進","ミドルの精度","運動量","鉄人"],
  },
  {
    n:7, id:"zidane", art:"le_omf01_zidane", rarity:"LEG",
    name:"Z. ジダン", short:"ジダン",
    club:"マドリー・ブランコス", nation:"fra",
    // **LWG も**(2026-08-22)。左に流れて組み立てる形をこの1枚で賄えるようにする
    pos:"MF", subs:["OMF","CMF","LWG"], age:29,
    atk:15, def:8, pow:15, tec:20, spd:13, sta:14,               // 85
    skills:["マエストロ","視野の広さ","キープ力","パスの精度"],
  },
  {
    n:8, id:"beckham", art:"le_rmf01_beckham", rarity:"LEG",
    name:"D. ベッカム", short:"ベッカム",
    club:"マンチェスター・レッズ", nation:"eng",
    pos:"MF", subs:["RMF","CMF"], age:27,
    atk:13, def:10, pow:16, tec:19, spd:12, sta:15,              // 85
    skills:["精密機械","サイドチェンジ","展開力","セットプレーの名手"],
  },
  // ---------- FW ----------
  {
    n:9, id:"ronaldinho", art:"le_lwg01_ronaldinho", rarity:"LEG",
    name:"ロナウジーニョ", short:"ロナウジーニョ",
    club:"バルサローナ・ブラウグラナ", nation:"bra",
    pos:"FW", subs:["LWG","OMF"], age:25,
    atk:16, def:5, pow:13, tec:20, spd:16, sta:12,               // 82
    skills:["魔法の足","ドリブル突破","切れ込みの鋭さ","ムードメーカー"],
  },
  {
    // **WORLD CLASS から昇格**(2026-08-09)。同じ絵が LEGENDS の素材として届いたので、
    // 同じ人物のカードを2枚に分けず、こちらへ寄せた
    n:10, id:"ronaldo", art:"le_rwg01_ronaldo", rarity:"LEG",
    name:"C. ロナウド", short:"ロナウド",
    club:"マンチェスター・レッズ", nation:"por",
    pos:"FW", subs:["RWG","ST"], age:23,
    atk:18, def:5, pow:17, tec:16, spd:19, sta:13,               // 88
    skills:["無回転の弾道","ドリブル突破","カットイン","決定力"],
  },
  {
    n:11, id:"inzaghi", art:"le_st01_inzaghi", rarity:"LEG",
    name:"F. インザーギ", short:"インザーギ",
    club:"ミラノ・ロッソネリ", nation:"ita",
    pos:"FW", subs:["ST","CF"], age:28,
    atk:20, def:4, pow:13, tec:14, spd:17, sta:14,               // 82
    skills:["本能","オフザボール","詰めの速さ","決定力"],
  },
  {
    // **LEGENDS の13人目**(2026-08-12)
    n:12, id:"kaka", art:"le_st02_kaka", rarity:"LEG",
    name:"カカ", short:"カカ",
    club:"ミラノ・ロッソネリ", nation:"bra",
    pos:"FW", subs:["ST","OMF"], age:25,
    atk:17, def:6, pow:14, tec:19, spd:17, sta:12,               // 85
    skills:["加速する司令塔","ドリブル突破","視野の広さ","決定力"],
  },
  {
    n:26, id:"vandersar", art:"le_gk02_van_der_sar", rarity:"LEG",
    name:"E. ファン・デル・サール", short:"ファン・デル・サール",
    club:"マンチェスター・レッズ", nation:"ned",
    pos:"GK", subs:["GK"], age:31,
    atk:3, def:20, pow:17, tec:16, spd:12, sta:14,               // 82
    skills:["静かな支配","角度の消し方","ビルドアップ","守備の統率"],
  },
  {
    n:27, id:"nesta", art:"le_cb02_nesta", rarity:"LEG",
    name:"A. ネスタ", short:"ネスタ",
    club:"ミラノ・ロッソネリ", nation:"ita",
    pos:"DF", subs:["CB"], age:28,
    atk:6, def:20, pow:16, tec:16, spd:15, sta:13,               // 86
    skills:["間合いの芸術","対人守備","クリーンな守備","カバーリング"],
  },
  {
    n:28, id:"cafu", art:"le_rsb02_cafu", rarity:"LEG",
    name:"カフー", short:"カフー",
    club:"ミラノ・ロッソネリ", nation:"bra",
    pos:"DF", subs:["RSB","RMF"], age:29,
    atk:11, def:15, pow:14, tec:13, spd:16, sta:19,              // 88
    skills:["果てなき上下動","オーバーラップ","推進力","運動量"],
  },
  {
    n:29, id:"davids", art:"le_dmf02_davids", rarity:"LEG",
    name:"E. ダーヴィッツ", short:"ダーヴィッツ",
    club:"トリノ・ビアンコネーリ", nation:"ned",
    pos:"MF", subs:["DMF","CMF"], age:27,
    atk:10, def:18, pow:15, tec:13, spd:14, sta:18,              // 88
    skills:["番犬","ボール奪取","厳しい寄せ","運動量"],
  },
  {
    n:30, id:"lampard", art:"le_cmf02_lampard", rarity:"LEG",
    name:"F. ランパード", short:"ランパード",
    club:"ロンドン・ブルーズ", nation:"eng",
    pos:"MF", subs:["CMF","OMF"], age:28,
    atk:16, def:12, pow:15, tec:16, spd:13, sta:16,              // 88
    skills:["二列目の砲","ロングシュート","オフザボール","運動量"],
  },
  {
    n:31, id:"iniesta", art:"le_cmf03_iniesta", rarity:"LEG",
    name:"A. イニエスタ", short:"イニエスタ",
    club:"バルサローナ・ブラウグラナ", nation:"esp",
    pos:"MF", subs:["CMF","OMF","LMF"], age:27,
    atk:13, def:10, pow:12, tec:20, spd:14, sta:15,              // 84
    skills:["白い旋律","キープ力","視野の広さ","パスの精度"],
  },
  {
    n:32, id:"maradona", art:"le_omf02_maradona", rarity:"LEG",
    name:"D. マラドーナ", short:"マラドーナ",
    club:"ナポリ・パルテノペイ", nation:"arg",
    pos:"MF", subs:["OMF","CF"], age:26,
    atk:17, def:5, pow:14, tec:20, spd:17, sta:13,               // 86
    skills:["神の左","ドリブル突破","視野の広さ","キープ力"],
  },

  // ================= WORLD CLASS =================
  // 76〜85(→data.js RARITY)。札は**3枚**で、1枚目が固有スキル(→docs/03 §3.41)。
  // LEGENDS より1枚少ないぶん、伸びしろではなく「いま強い」段として置いてある。
  // ---------- GK ----------
  {
    n:13, id:"courtois", art:"wc_gk01_courtois", rarity:"WC",
    name:"T. クルトワ", short:"クルトワ",
    club:"マドリー・ブランコス", nation:"bel",
    pos:"GK", subs:["GK"], age:30,
    atk:3, def:20, pow:18, tec:15, spd:12, sta:14,               // 82
    skills:["巨壁","ハイボール処理","守備の統率"],
  },
  // ---------- DF ----------
  {
    n:14, id:"vandyck", art:"wc_cb02_van_dyck", rarity:"WC",
    name:"V. ダイク", short:"ダイク",
    club:"マージーサイド・レッズ", nation:"ned",
    pos:"DF", subs:["CB"], age:30,
    atk:8, def:20, pow:18, tec:13, spd:13, sta:12,               // 84
    skills:["最終ラインの主","対人守備","空中戦"],
  },
  {
    n:15, id:"lmartinez", art:"wc_cb01_lisandro_martinez", rarity:"WC",
    name:"L. マルティネス", short:"マルティネス",
    club:"マンチェスター・レッズ", nation:"arg",
    pos:"DF", subs:["CB","DMF"], age:26,
    atk:9, def:18, pow:16, tec:15, spd:13, sta:12,               // 83
    skills:["牙","厳しい寄せ","ビルドアップ"],
  },
  {
    n:16, id:"cucurella", art:"wc_lsb01_cucurella", rarity:"WC",
    name:"M. ククレジャ", short:"ククレジャ",
    club:"ロンドン・ブルーズ", nation:"esp",
    pos:"DF", subs:["LSB","LMF"], age:26,
    atk:10, def:16, pow:14, tec:15, spd:16, sta:13,              // 84
    skills:["絡みつく守備","オーバーラップ","運動量"],
  },
  {
    n:17, id:"timber", art:"wc_rsb01_timber", rarity:"WC",
    name:"J. ティンバー", short:"ティンバー",
    club:"ロンドン・ガナーズ", nation:"ned",
    pos:"DF", subs:["RSB","CB"], age:24,
    atk:9, def:17, pow:15, tec:15, spd:16, sta:12,               // 84
    skills:["読みの速さ","カバーリング","推進力"],
  },
  // ---------- MF ----------
  {
    n:18, id:"rodri", art:"wc_dmf01_rodri", rarity:"WC",
    name:"ロドリ", short:"ロドリ",
    club:"マンチェスター・スカイブルー", nation:"esp",
    pos:"MF", subs:["DMF","CMF"], age:27,
    atk:11, def:17, pow:15, tec:18, spd:11, sta:13,              // 85
    skills:["試合の心拍","ボール奪取","展開力"],
  },
  {
    n:19, id:"bellingham", art:"wc_cmf01_bellingham", rarity:"WC",
    name:"J. ベリンガム", short:"ベリンガム",
    club:"マドリー・ブランコス", nation:"eng",
    pos:"MF", subs:["CMF","OMF"], age:22,
    atk:15, def:13, pow:15, tec:16, spd:14, sta:12,              // 85
    skills:["遅れて入る","オフザボール","運動量"],
  },
  {
    n:20, id:"olise", art:"wc_omf01_olise", rarity:"WC",
    name:"M. オリーズ", short:"オリーズ",
    club:"ミュンヘン・レーヴェン", nation:"fra",
    pos:"MF", subs:["OMF","RMF"], age:24,
    atk:15, def:8, pow:12, tec:18, spd:15, sta:12,               // 80
    skills:["曲がる軌道","正確なクロス","キープ力"],
  },
  {
    n:21, id:"yamal", art:"wc_rmf01_yamal", rarity:"WC",
    name:"L. ヤマル", short:"ヤマル",
    club:"バルサローナ・ブラウグラナ", nation:"esp",
    pos:"MF", subs:["RMF","RWG"], age:18,
    atk:15, def:7, pow:11, tec:18, spd:16, sta:12,               // 79
    skills:["天才の閃き","ドリブル突破","切れ込みの鋭さ"],
  },
  // ---------- FW ----------
  {
    n:22, id:"haaland", art:"wc_cf01_haland", rarity:"WC",
    name:"E. ハーランド", short:"ハーランド",
    club:"マンチェスター・スカイブルー", nation:"nor", nat:"ノルウェー",
    pos:"FW", subs:["CF","ST"], age:24,
    atk:20, def:4, pow:19, tec:12, spd:15, sta:12,               // 82
    skills:["点取りの化身","詰めの速さ","空中戦"],
  },
  {
    n:23, id:"mbappe", art:"wc_lwg01_mbappe", rarity:"WC",
    name:"K. ムバッペ", short:"ムバッペ",
    club:"マドリー・ブランコス", nation:"fra",
    pos:"FW", subs:["LWG","ST"], age:25,
    atk:18, def:4, pow:13, tec:15, spd:20, sta:12,               // 82
    skills:["加速","スピード","カットイン"],
  },
  {
    n:24, id:"messi", art:"wc_rwg01_messi", rarity:"WC",
    name:"L. メッシ", short:"メッシ",
    club:"マイアミ・ローズ", nation:"arg",
    pos:"FW", subs:["RWG","OMF"], age:30,
    atk:18, def:4, pow:10, tec:20, spd:14, sta:11,               // 77
    skills:["左足の魔術","視野の広さ","キープ力"],
  },
  {
    n:25, id:"wirtz", art:"wc_st01_wirtz", rarity:"WC",
    name:"F. ヴィルツ", short:"ヴィルツ",
    club:"マージーサイド・レッズ", nation:"ger",
    pos:"FW", subs:["ST","OMF"], age:22,
    atk:16, def:7, pow:12, tec:18, spd:14, sta:12,               // 79
    skills:["間で受ける","オフザボール","パスの精度"],
  },
  {
    n:33, id:"cubarsi", art:"wc_cb02_cubarsi", rarity:"WC",
    name:"P. クバルシ", short:"クバルシ",
    club:"バルサローナ・ブラウグラナ", nation:"esp",
    pos:"DF", subs:["CB"], age:18,
    atk:8, def:17, pow:13, tec:17, spd:13, sta:12,               // 80
    skills:["若き司令塔","カバーリング","ビルドアップ"],
  },
  {
    n:34, id:"gvardiol", art:"wc_lsb02_gvardiol", rarity:"WC",
    name:"J. グヴァルディオル", short:"グヴァルディオル",
    club:"マンチェスター・スカイブルー", nation:"cro",
    pos:"DF", subs:["LSB","CB"], age:23,
    atk:10, def:18, pow:17, tec:13, spd:15, sta:12,              // 85
    skills:["持ち上がる壁","空中戦","推進力"],
  },
  {
    n:35, id:"tonali", art:"wc_dmf02_tonali", rarity:"WC",
    name:"S. トナーリ", short:"トナーリ",
    club:"タイン・マグパイズ", nation:"ita",
    pos:"MF", subs:["DMF","CMF"], age:25,
    atk:11, def:17, pow:14, tec:16, spd:13, sta:14,              // 85
    skills:["先を読む足","セカンドボール","展開力"],
  },
  {
    n:36, id:"mastantuono", art:"wc_omf02_mastantuono", rarity:"WC",
    name:"F. マスタントゥオーノ", short:"マスタントゥオーノ",
    club:"マドリー・ブランコス", nation:"arg",
    pos:"MF", subs:["OMF","RMF"], age:18,
    atk:14, def:7, pow:11, tec:17, spd:15, sta:12,               // 76
    skills:["未完の煌めき","ドリブル","切れ込みの鋭さ"],
  },
  {
    n:37, id:"palmer", art:"wc_omf03_cole_palmer", rarity:"WC",
    name:"C. パーマー", short:"パーマー",
    club:"ロンドン・ブルーズ", nation:"eng",
    pos:"MF", subs:["OMF","RMF"], age:23,
    atk:16, def:8, pow:12, tec:18, spd:13, sta:12,               // 79
    skills:["冷たい一撃","PKの名手","スルーパス"],
  },
  {
    n:38, id:"ferran", art:"wc_cf02_ferran_torres", rarity:"WC",
    name:"F. トーレス", short:"フェラン",
    club:"バルサローナ・ブラウグラナ", nation:"esp",
    pos:"FW", subs:["CF","LWG"], age:25,
    atk:17, def:5, pow:13, tec:15, spd:16, sta:12,               // 78
    skills:["詰めの嗅覚","オフザボール","カットイン"],
  },
  {
    n:39, id:"endrick", art:"wc_rwg02_endrock", rarity:"WC",
    name:"エンドリッキ", short:"エンドリッキ",
    club:"マドリー・ブランコス", nation:"bra",
    pos:"FW", subs:["RWG","ST"], age:19,
    atk:17, def:4, pow:15, tec:14, spd:17, sta:12,               // 79
    skills:["跳ねる才能","初速","決定力"],
  },
  {
    n:40, id:"estevao", art:"wc_rwg03_estevao", rarity:"WC",
    name:"エステヴァン", short:"エステヴァン",
    club:"ロンドン・ブルーズ", nation:"bra",
    pos:"FW", subs:["RWG","OMF"], age:18,
    atk:15, def:5, pow:11, tec:18, spd:17, sta:12,               // 78
    skills:["奔放な足","ドリブル突破","切れ込みの鋭さ"],
  },
  // --- ミランの面々(2026-08-18) ---
  {
    n:41, id:"dida", art:"le_gk03_dida", rarity:"LEG",
    name:"ジーダ", short:"ジーダ",
    club:"ミラノ・ロッソネリ", nation:"bra",
    pos:"GK", subs:["GK"], age:30,
    atk:3, def:20, pow:17, tec:14, spd:14, sta:14,               // 82
    skills:["神の手袋","セービング","反射神経","1対1の強さ"],
  },
  {
    n:42, id:"maldini", art:"le_lsb02_maldini", rarity:"LEG",
    name:"P. マルディーニ", short:"マルディーニ",
    club:"ミラノ・ロッソネリ", nation:"ita",
    pos:"DF", subs:["LSB","CB"], age:30,
    atk:8, def:20, pow:16, tec:17, spd:14, sta:15,               // 90
    skills:["静かな壁","対人守備","カバーリング","キャプテンシー"],
  },
  {
    n:44, id:"costacruta", art:"le_cb03_costacruta", rarity:"LEG",
    name:"B. コスタクルタ", short:"コスタクルタ",
    club:"ミラノ・ロッソネリ", nation:"ita",
    pos:"DF", subs:["CB","RSB"], age:31,
    atk:6, def:19, pow:15, tec:14, spd:13, sta:15,               // 82
    skills:["最後の砦","シュートブロック","カバーリング","守備の統率"],
  },
  {
    n:45, id:"stam", art:"le_cb04_stam", rarity:"LEG",
    name:"J. スタム", short:"スタム",
    club:"ミラノ・ロッソネリ", nation:"ned",
    pos:"DF", subs:["CB"], age:30,
    atk:6, def:20, pow:20, tec:12, spd:14, sta:13,               // 85
    skills:["巨岩","対人守備","空中戦","タックル"],
  },
  {
    n:46, id:"kaladze", art:"le_lsb03_kaladze", rarity:"LEG",
    name:"K. カラーゼ", short:"カラーゼ",
    club:"ミラノ・ロッソネリ", nation:"geo", nat:"ジョージア",
    pos:"DF", subs:["LSB","CB"], age:28,
    atk:7, def:18, pow:15, tec:13, spd:15, sta:14,               // 82
    skills:["堅実な左","対人守備","ケガ耐性","カバーリング"],
  },
  {
    n:47, id:"pirlo", art:"le_dmf04_pirlo", rarity:"LEG",
    name:"A. ピルロ", short:"ピルロ",
    club:"ミラノ・ロッソネリ", nation:"ita",
    pos:"MF", subs:["DMF","CMF"], age:28,
    atk:12, def:11, pow:13, tec:20, spd:11, sta:15,              // 82
    skills:["レジスタ","展開力","パスの精度","セットプレーの名手"],
  },
  {
    n:48, id:"gattuso", art:"le_cmf05_gattuso", rarity:"LEG",
    name:"G. ガットゥーゾ", short:"ガットゥーゾ",
    club:"ミラノ・ロッソネリ", nation:"ita",
    pos:"MF", subs:["CMF","DMF"], age:28,
    atk:9, def:19, pow:17, tec:12, spd:13, sta:18,               // 88
    skills:["闘犬","ボール奪取","厳しい寄せ","運動量"],
  },
  {
    n:49, id:"ambrosini", art:"le_dmf03_ambrosini", rarity:"LEG",
    name:"M. アンブロジーニ", short:"アンブロジーニ",
    club:"ミラノ・ロッソネリ", nation:"ita",
    pos:"MF", subs:["DMF","CMF"], age:29,
    atk:10, def:17, pow:15, tec:13, spd:13, sta:17,              // 85
    skills:["汗かき役","セカンドボール","運動量","ケガ耐性"],
  },
  {
    n:50, id:"seedorf", art:"le_cmf04_seedorf", rarity:"LEG",
    name:"C. セードルフ", short:"セードルフ",
    club:"ミラノ・ロッソネリ", nation:"ned",
    pos:"MF", subs:["CMF","OMF","LMF"], age:29,
    atk:14, def:13, pow:16, tec:17, spd:13, sta:15,              // 88
    skills:["四つの持ち場","ロングシュート","キープ力","展開力"],
  },
  {
    n:51, id:"ruicosta", art:"le_omf03_rui_costa", rarity:"LEG",
    name:"M. ルイ・コスタ", short:"ルイ・コスタ",
    club:"ミラノ・ロッソネリ", nation:"por",
    pos:"MF", subs:["OMF","CMF"], age:29,
    atk:15, def:8, pow:13, tec:20, spd:12, sta:14,               // 82
    skills:["十番の芸","スルーパス","視野の広さ","キープ力"],
  },
  {
    n:52, id:"shevchenko", art:"le_cf01_shevchenko", rarity:"LEG",
    name:"A. シェフチェンコ", short:"シェフチェンコ",
    club:"ミラノ・ロッソネリ", nation:"ukr", nat:"ウクライナ",
    pos:"FW", subs:["CF","ST"], age:27,
    atk:20, def:5, pow:16, tec:15, spd:18, sta:14,               // 88
    skills:["撃ち抜く","決定力","スピード","ゴール前の嗅覚"],
  },
  {
    n:53, id:"crespo", art:"le_cf02_crespo", rarity:"LEG",
    name:"H. クレスポ", short:"クレスポ",
    club:"ミラノ・ロッソネリ", nation:"arg",
    pos:"FW", subs:["CF","ST"], age:29,
    atk:19, def:4, pow:16, tec:14, spd:16, sta:13,               // 82
    skills:["獲物を待つ","オフザボール","決定力","詰めの速さ"],
  },
  // --- ロンドン・ガナーズ 2003-04(2026-08-19) ---
  // **無敗の面々**。守備が土台で、前は速さと技で刺す並びにしてある。
  // 合計は LEGENDS の帯(82〜90)に収める(→docs/03 §3.13)
  {
    n:54, id:"lehmann", art:"le_gk04_lehmann", rarity:"LEG",
    name:"J. レーマン", short:"レーマン",
    club:"ロンドン・ガナーズ", nation:"ger",
    pos:"GK", subs:["GK"], age:34,
    atk:3, def:20, pow:16, tec:13, spd:15, sta:15,               // 82
    skills:["猛る門番","PKストップ","飛び出し判断","守備の統率"],
  },
  {
    n:55, id:"lauren", art:"le_rsb03_lauren", rarity:"LEG",
    name:"ローレン", short:"ローレン",
    club:"ロンドン・ガナーズ", nation:"cmr", nat:"カメルーン",
    pos:"DF", subs:["RSB","CMF"], age:27,
    atk:8, def:17, pow:15, tec:14, spd:15, sta:15,               // 84
    skills:["上がる右","対人守備","オーバーラップ","運動量"],
  },
  {
    n:56, id:"kolotoure", art:"le_cb06_kolo_toure", rarity:"LEG",
    name:"K. トゥーレ", short:"トゥーレ",
    club:"ロンドン・ガナーズ", nation:"civ", nat:"コートジボワール",
    pos:"DF", subs:["CB","RSB"], age:23,
    atk:6, def:18, pow:16, tec:12, spd:17, sta:15,               // 84
    skills:["駆ける壁","カバーリング","スピード","タックル"],
  },
  {
    n:57, id:"solcampbell", art:"le_cb05_sol_campbell", rarity:"LEG",
    name:"S. キャンベル", short:"キャンベル",
    club:"ロンドン・ガナーズ", nation:"eng",
    pos:"DF", subs:["CB"], age:29,
    atk:7, def:20, pow:18, tec:12, spd:14, sta:14,               // 85
    skills:["動じぬ柱","空中戦","対人守備","シュートブロック"],
  },
  {
    n:58, id:"keown", art:"le_cb_martin_keown", rarity:"LEG",
    name:"M. キーオン", short:"キーオン",
    club:"ロンドン・ガナーズ", nation:"eng",
    pos:"DF", subs:["CB"], age:37,
    atk:6, def:19, pow:17, tec:12, spd:13, sta:15,               // 82
    skills:["執念の寄せ","対人守備","厳しい寄せ","鉄人"],
  },
  {
    n:59, id:"ashleycole", art:"le_lsb05_ashley_cole", rarity:"LEG",
    name:"A. コール", short:"A. コール",
    club:"ロンドン・ガナーズ", nation:"eng",
    pos:"DF", subs:["LSB"], age:23,
    atk:9, def:18, pow:14, tec:14, spd:16, sta:15,               // 86
    skills:["往復する左","対人守備","オーバーラップ","正確なクロス"],
  },
  {
    n:60, id:"clichy", art:"le_lsb04_gael_clichy", rarity:"LEG",
    name:"G. クリシー", short:"クリシー",
    club:"ロンドン・ガナーズ", nation:"fra",
    pos:"DF", subs:["LSB"], age:18,
    atk:7, def:16, pow:13, tec:13, spd:18, sta:15,               // 82
    skills:["若い快足","スピード","カバーリング","初速"],
  },
  {
    n:61, id:"vieira", art:"le_cmf07_vieira", rarity:"LEG",
    name:"P. ヴィエラ", short:"ヴィエラ",
    club:"ロンドン・ガナーズ", nation:"fra",
    pos:"MF", subs:["DMF","CMF"], age:27,
    atk:12, def:17, pow:18, tec:14, spd:14, sta:15,              // 90
    skills:["背骨","ボール奪取","キャプテンシー","推進力"],
  },
  {
    n:62, id:"gilberto", art:"le_cmf08_gilberto_silva", rarity:"LEG",
    name:"G. シウバ", short:"G. シウバ",
    club:"ロンドン・ガナーズ", nation:"bra",
    pos:"MF", subs:["DMF","CMF"], age:27,
    atk:8, def:17, pow:16, tec:13, spd:13, sta:16,               // 83
    skills:["見えない箒","カバーリング","セカンドボール","クリーンな守備"],
  },
  {
    n:63, id:"edu", art:"le_cmf09_edu", rarity:"LEG",
    name:"エドゥ", short:"エドゥ",
    club:"ロンドン・ガナーズ", nation:"bra",
    pos:"MF", subs:["CMF"], age:25,
    atk:10, def:14, pow:15, tec:15, spd:13, sta:15,              // 82
    skills:["静かな配球","パスの精度","視野の広さ","展開力"],
  },
  {
    n:64, id:"fabregas", art:"le_cmf06_cesc_fabregas", rarity:"LEG",
    name:"C. ファブレガス", short:"ファブレガス",
    club:"ロンドン・ガナーズ", nation:"esp",
    pos:"MF", subs:["CMF","OMF"], age:17,
    atk:12, def:12, pow:13, tec:18, spd:13, sta:14,              // 82
    skills:["早熟の設計図","スルーパス","視野の広さ","パスの精度"],
  },
  {
    n:65, id:"pires", art:"le_lmf02_pires", rarity:"LEG",
    name:"R. ピレス", short:"ピレス",
    club:"ロンドン・ガナーズ", nation:"fra",
    pos:"MF", subs:["LMF","OMF"], age:30,
    atk:15, def:11, pow:13, tec:18, spd:14, sta:13,              // 84
    skills:["忍ぶ左","カットイン","冷静なフィニッシュ","キープ力"],
  },
  {
    n:66, id:"ljungberg", art:"le_rmf02_ljungberg", rarity:"LEG",
    name:"F. リュンベリ", short:"リュンベリ",
    club:"ロンドン・ガナーズ", nation:"swe", nat:"スウェーデン",
    pos:"MF", subs:["RMF","OMF"], age:27,
    atk:14, def:12, pow:14, tec:15, spd:16, sta:15,              // 86
    skills:["二列目の影","オフザボール","詰めの速さ","運動量"],
  },
  {
    n:67, id:"bergkamp", art:"le_st04_bergkamp", rarity:"LEG",
    name:"D. ベルカンプ", short:"ベルカンプ",
    club:"ロンドン・ガナーズ", nation:"ned",
    pos:"FW", subs:["ST","CF","OMF"], age:34,
    atk:17, def:8, pow:14, tec:20, spd:11, sta:12,               // 82
    skills:["氷の一触","スルーパス","ポストプレー","冷静なフィニッシュ"],
  },
  {
    n:68, id:"henry", art:"le_cf03_thierry_henry", rarity:"LEG",
    name:"T. アンリ", short:"アンリ",
    club:"ロンドン・ガナーズ", nation:"fra",
    pos:"FW", subs:["CF","LWG"], age:26,
    atk:19, def:6, pow:16, tec:18, spd:19, sta:12,               // 90
    skills:["内へ切れ込む","決定力","ドリブル突破","初速"],
  },
  {
    n:69, id:"reyes", art:"le_st03_reyes", rarity:"LEG",
    name:"J. レイエス", short:"レイエス",
    club:"ロンドン・ガナーズ", nation:"esp",
    pos:"FW", subs:["LWG","ST"], age:20,
    atk:15, def:8, pow:13, tec:16, spd:18, sta:12,               // 82
    skills:["切り返しの妙","ドリブル","切れ込みの鋭さ","カットイン"],
  },
  // --- バルサローナ・ブラウグラナ 2009-11(2026-08-21) ---
  // **保持して崩す面々**。イニエスタ(n:31)は既に居るので、その周りを埋める形になる。
  // 中盤は tec を高く spd を低く、前は速さで裏を取る型に振り分けてある。
  // 合計は LEGENDS の帯(82〜90)に収める(→docs/03 §3.13)
  {
    n:70, id:"valdes", art:"le_gk05_valdes", rarity:"LEG",
    name:"V. バルデス", short:"バルデス",
    club:"バルサローナ・ブラウグラナ", nation:"esp",
    pos:"GK", subs:["GK"], age:28,
    atk:5, def:19, pow:15, tec:16, spd:14, sta:13,               // 82
    skills:["足元の門番","ビルドアップ","1対1の強さ","反射神経"],
  },
  {
    n:71, id:"pique", art:"le_cb07_pique", rarity:"LEG",
    name:"G. ピケ", short:"ピケ",
    club:"バルサローナ・ブラウグラナ", nation:"esp",
    pos:"DF", subs:["CB","DMF"], age:23,
    atk:9, def:19, pow:17, tec:16, spd:13, sta:13,               // 87
    skills:["最終ラインの設計","空中戦","ビルドアップ","対人守備"],
  },
  {
    n:72, id:"puyol", art:"le_cb08_puyol", rarity:"LEG",
    name:"C. プジョル", short:"プジョル",
    club:"バルサローナ・ブラウグラナ", nation:"esp",
    pos:"DF", subs:["CB","RSB"], age:32,
    atk:7, def:20, pow:18, tec:12, spd:15, sta:16,               // 88
    skills:["不屈の主将","対人守備","キャプテンシー","シュートブロック"],
  },
  {
    n:73, id:"abidal", art:"le_lsb06_abidal", rarity:"LEG",
    name:"E. アビダル", short:"アビダル",
    club:"バルサローナ・ブラウグラナ", nation:"fra",
    pos:"DF", subs:["LSB","CB"], age:30,
    atk:8, def:18, pow:15, tec:13, spd:17, sta:15,               // 86
    skills:["静かな盾","カバーリング","スピード","対人守備"],
  },
  {
    n:74, id:"adriano", art:"le_lsb07_adriano", rarity:"LEG",
    name:"アドリアーノ", short:"アドリアーノ",
    club:"バルサローナ・ブラウグラナ", nation:"bra",
    pos:"DF", subs:["LSB","RSB","LWG"], age:25,
    atk:12, def:14, pow:14, tec:15, spd:17, sta:14,              // 86
    skills:["両翼の走者","オーバーラップ","スピード","推進力"],
  },
  {
    n:75, id:"danialves", art:"le_rsb04_dani_alves", rarity:"LEG",
    name:"D. アウヴェス", short:"アウヴェス",
    club:"バルサローナ・ブラウグラナ", nation:"bra",
    pos:"DF", subs:["RSB","RMF"], age:27,
    atk:13, def:16, pow:13, tec:16, spd:17, sta:15,              // 90
    skills:["止まらない右","オーバーラップ","正確なクロス","運動量"],
  },
  {
    n:76, id:"mascherano", art:"le_dmf05_mascherano", rarity:"LEG",
    name:"J. マスチェラーノ", short:"マスチェラーノ",
    club:"バルサローナ・ブラウグラナ", nation:"arg",
    pos:"MF", subs:["DMF","CB"], age:26,
    atk:7, def:19, pow:16, tec:14, spd:14, sta:16,               // 86
    skills:["刈り取る","ボール奪取","対人守備","厳しい寄せ"],
  },
  {
    n:77, id:"busquets", art:"le_dmf06_busquets", rarity:"LEG",
    name:"S. ブスケツ", short:"ブスケツ",
    club:"バルサローナ・ブラウグラナ", nation:"esp",
    pos:"MF", subs:["DMF","CMF"], age:22,
    atk:9, def:17, pow:14, tec:18, spd:11, sta:15,               // 84
    skills:["間で消える","間合いの読み","捌き","カバーリング"],
  },
  {
    n:78, id:"xavi", art:"le_cmf11_xavi", rarity:"LEG",
    name:"シャビ", short:"シャビ",
    club:"バルサローナ・ブラウグラナ", nation:"esp",
    pos:"MF", subs:["CMF","DMF"], age:30,
    atk:12, def:12, pow:11, tec:20, spd:12, sta:17,              // 84
    skills:["回し続ける","パスの精度","視野の広さ","捌き"],
  },
  {
    n:79, id:"thiago", art:"le_cmf10_thiago_alcantara", rarity:"LEG",
    name:"T. アルカンタラ", short:"チアゴ",
    club:"バルサローナ・ブラウグラナ", nation:"esp",
    pos:"MF", subs:["CMF","OMF"], age:19,
    atk:12, def:11, pow:12, tec:18, spd:15, sta:14,              // 82
    skills:["継ぐ足元","キープ力","ドリブル","捌き"],
  },
  {
    n:80, id:"keita", art:"le_cmf13_keita", rarity:"LEG",
    name:"S. ケイタ", short:"ケイタ",
    club:"バルサローナ・ブラウグラナ", nation:"mli", nat:"マリ",
    pos:"MF", subs:["CMF","LMF"], age:30,
    atk:13, def:13, pow:16, tec:12, spd:15, sta:15,              // 84
    skills:["割って入る","推進力","運動量","セカンドボール"],
  },
  {
    n:81, id:"messibar", art:"le_cf04_messi", rarity:"LEG",
    name:"L. メッシ", short:"メッシ",
    club:"バルサローナ・ブラウグラナ", nation:"arg",
    pos:"FW", subs:["CF","RWG","OMF"], age:23,
    atk:20, def:5, pow:12, tec:20, spd:19, sta:14,               // 90
    skills:["無二の左","ドリブル突破","決定力","視野の広さ"],
  },
  {
    n:82, id:"pedro", art:"le_lwg02_pedro", rarity:"LEG",
    name:"ペドロ", short:"ペドロ",
    club:"バルサローナ・ブラウグラナ", nation:"esp",
    pos:"FW", subs:["LWG","RWG","CF"], age:23,
    atk:15, def:9, pow:12, tec:15, spd:18, sta:15,               // 84
    skills:["裏を取り続ける","オフザボール","詰めの速さ","初速"],
  },
  {
    n:83, id:"bojan", art:"le_lwg03_bojan", rarity:"LEG",
    name:"B. クルキッチ", short:"ボージャン",
    club:"バルサローナ・ブラウグラナ", nation:"esp",
    pos:"FW", subs:["LWG","ST"], age:20,
    atk:16, def:8, pow:12, tec:17, spd:16, sta:13,               // 82
    skills:["早すぎた芽","ゴール前の嗅覚","カットイン","冷静なフィニッシュ"],
  },
  {
    n:84, id:"villa", art:"le_rwg02_david_villa", rarity:"LEG",
    name:"D. ビジャ", short:"ビジャ",
    club:"バルサローナ・ブラウグラナ", nation:"esp",
    pos:"FW", subs:["LWG","CF"], age:28,
    atk:18, def:7, pow:13, tec:17, spd:17, sta:13,               // 85
    skills:["外から中へ","決定力","カットイン","オフザボール"],
  },
  // ---------- 銀河系軍団(→docs/03 §3.13d) ----------
  // **同じ人物の別の時代は別のカード**にする(→§3.13d)。ベッカムは
  // マンチェスター(le_rmf01)と、この時代の2枚がある。
  {
    n:85, id:"casillas", art:"le_gk06_casillas", rarity:"LEG",
    name:"I. カシージャス", short:"カシージャス",
    club:"マドリー・ブランコス", nation:"esp",
    pos:"GK", subs:["GK"], age:26,
    atk:3, def:19, pow:14, tec:16, spd:18, sta:14,               // 84
    skills:["神の手前","反射神経","1対1の強さ","守備の統率"],
  },
  {
    n:86, id:"hierro", art:"le_cb09_hierro", rarity:"LEG",
    name:"F. イエロ", short:"イエロ",
    club:"マドリー・ブランコス", nation:"esp",
    pos:"DF", subs:["CB","DMF"], age:31,
    atk:11, def:19, pow:18, tec:15, spd:9, sta:13,               // 85
    skills:["闘将の采配","空中戦","正確なフィード","キャプテンシー"],
  },
  {
    n:87, id:"helguera", art:"le_cb10_helguera", rarity:"LEG",
    name:"I. エルゲラ", short:"エルゲラ",
    club:"マドリー・ブランコス", nation:"esp",
    pos:"DF", subs:["CB","DMF","RSB"], age:27,
    atk:9, def:17, pow:16, tec:14, spd:13, sta:14,               // 83
    skills:["万能の柱","ビルドアップ","対人守備","セカンドボール"],
  },
  {
    n:88, id:"pavon", art:"le_cb11_pavon", rarity:"LEG",
    name:"F. パボン", short:"パボン",
    club:"マドリー・ブランコス", nation:"esp",
    pos:"DF", subs:["CB"], age:22,
    atk:5, def:18, pow:17, tec:11, spd:15, sta:16,               // 82
    skills:["壁になる男","対人守備","カバーリング","ケガ耐性"],
  },
  {
    n:89, id:"salgado", art:"le_rsb05_salgado", rarity:"LEG",
    name:"M. サルガド", short:"サルガド",
    club:"マドリー・ブランコス", nation:"esp",
    pos:"DF", subs:["RSB","RMF"], age:27,
    atk:10, def:16, pow:14, tec:12, spd:15, sta:18,              // 85
    skills:["右の推進","オーバーラップ","厳しい寄せ","運動量"],
  },
  {
    n:90, id:"makelele", art:"le_dmf08_makelele", rarity:"LEG",
    name:"C. マケレレ", short:"マケレレ",
    club:"マドリー・ブランコス", nation:"fra",
    pos:"MF", subs:["DMF","CMF"], age:29,
    atk:6, def:20, pow:15, tec:14, spd:15, sta:18,               // 88
    skills:["掃除屋","ボール奪取","間合いの読み","運動量"],
  },
  {
    n:91, id:"cambiasso", art:"le_dmf09_cambiasso", rarity:"LEG",
    name:"E. カンビアッソ", short:"カンビアッソ",
    club:"マドリー・ブランコス", nation:"arg",
    pos:"MF", subs:["DMF","CMF"], age:22,
    atk:9, def:16, pow:14, tec:15, spd:12, sta:17,               // 83
    skills:["隠れた心臓","ボール奪取","展開力","運動量"],
  },
  {
    n:92, id:"guti", art:"le_dmf07_guti", rarity:"LEG",
    name:"J. グティ", short:"グティ",
    club:"マドリー・ブランコス", nation:"esp",
    pos:"MF", subs:["CMF","OMF","DMF"], age:26,
    atk:15, def:9, pow:12, tec:20, spd:13, sta:14,               // 83
    skills:["スペースの発明","視野の広さ","スルーパス","パスの精度"],
  },
  {
    n:93, id:"raul", art:"le_omf04_raul", rarity:"LEG",
    name:"R. ゴンサレス", short:"ラウール",
    club:"マドリー・ブランコス", nation:"esp",
    pos:"FW", subs:["OMF","CF","ST"], age:26,
    atk:19, def:8, pow:12, tec:17, spd:14, sta:15,               // 85
    skills:["セブンの帰還","ゴール前の嗅覚","オフザボール","キャプテンシー"],
  },
  {
    n:94, id:"figo", art:"le_rwg04_figo", rarity:"LEG",
    name:"L. フィーゴ", short:"フィーゴ",
    club:"マドリー・ブランコス", nation:"por",
    pos:"MF", subs:["RWG","RMF","OMF"], age:29,
    atk:15, def:8, pow:13, tec:19, spd:15, sta:14,               // 84
    skills:["白い矢","ドリブル突破","正確なクロス","キープ力"],
  },
  {
    // **同じ人物の別の時代**(→§3.13d)。マンチェスターの le_rmf01 とは別のカード
    n:95, id:"beckham_rm", art:"le_rwg03_beckham", rarity:"LEG",
    name:"D. ベッカム", short:"ベッカム",
    club:"マドリー・ブランコス", nation:"eng",
    pos:"MF", subs:["RMF","RWG","CMF"], age:29,
    atk:14, def:10, pow:13, tec:19, spd:12, sta:16,              // 84
    skills:["白い背番号23","正確なクロス","サイドチェンジ","運動量"],
  },
  {
    n:96, id:"solari", art:"le_lwg04_solari", rarity:"LEG",
    name:"S. ソラーリ", short:"ソラーリ",
    club:"マドリー・ブランコス", nation:"arg",
    pos:"MF", subs:["LWG","LMF","ST"], age:26,
    atk:14, def:8, pow:11, tec:15, spd:19, sta:15,               // 82
    skills:["静かな加速","スピード","ドリブル突破","オフザボール"],
  },
  {
    // **ナザーリオのほう**(→§3.13d)。C. ロナウド(le_rwg01)とは別人
    n:97, id:"ronaldo9", art:"le_cf06_ronaldo", rarity:"LEG",
    name:"R. ナザーリオ", short:"ロナウド",
    club:"マドリー・ブランコス", nation:"bra",
    pos:"FW", subs:["CF","ST","RWG"], age:27,
    atk:20, def:3, pow:17, tec:18, spd:18, sta:11,               // 87
    skills:["怪物","ドリブル突破","決定力","初速"],
  },
  {
    n:98, id:"morientes", art:"le_cf05_morientes", rarity:"LEG",
    name:"F. モリエンテス", short:"モリエンテス",
    club:"マドリー・ブランコス", nation:"esp",
    pos:"FW", subs:["CF","ST"], age:26,
    atk:18, def:7, pow:18, tec:14, spd:12, sta:14,               // 83
    skills:["背中で語る","ポストプレー","決定力","冷静なフィニッシュ"],
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
    // **並び順ではなく通し番号から作る**。indexOf にすると、間に1人足しただけで
    // それ以降のIDがずれ、既に持っているカードと新しく引いたカードが衝突する
    id:8000000+def.n,
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
