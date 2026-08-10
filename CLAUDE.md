# pftb — 作業の進め方

single play browser football game。単一HTML・オフライン・スマホ縦持ちの1人プレイ用サッカーゲーム。
ゲーム内容はまだ未確定(→ [docs/03-game-design.md](docs/03-game-design.md) の D1〜D8)。

## 原則

- **SPEC が正本**。仕様変更は「①`SPEC.md`/`docs/` を更新 → ②実装 → ③一致を検証」の順。
  実装とSPECが食い違ったらSPECを正とする。
- **`index.html` は直接編集しない**(ビルド成果物)。`src/js/*.js` と `src/css/*.css` を編集し、
  `python build.py` で再生成する。
- **数値は `data.js` の `TUNING` に集約**。確率・係数・閾値をロジックに直書きしない。
- コミットメッセージは日本語。**プッシュは明示的に指示されたときだけ**行う。

## 変更のたびに走らせるもの

```bash
python build.py                  # 再埋め込み + 参照ID整合チェック(MISSING ids なし)
cd src/tests && node integration.js && node hangtest.js
```

**表示・レイアウト・画面遷移を触ったときは、加えて必ずブラウザで確認する**
(CSSの崩れは上の2つを素通りする)。`/run-app` スキル、または `node tools/drive.js` で
headless Chrome を自動操作してスクリーンショットを撮り、**PNGを実際に開いて見る**。
手順は [docs/04-testing.md](docs/04-testing.md) と
[.claude/skills/run-app/SKILL.md](.claude/skills/run-app/SKILL.md)。

## よくある変更の触る場所

| やること | 触る場所 |
|---|---|
| 画面を増やす | `index.html` に `<div id="scr-xxx" class="screen">` → `ui.js` の `SCREENS` に描画関数を登録 → `data.js` の `HELP` に説明を追加(止めてはいけない画面を除く。テストが検査する) |
| セーブ項目を増やす | `state.js` の `defaultState()`。構造変更なら `SAVE_VER` を上げて `migrate()` を書く |
| JS/CSSファイルを増やす | `build.py` の `JS_FILES`/`CSS_FILES`(JSは `src/tests/_setup.js` の `JS_FILES` も**両方**更新) |
| 画像を足す | `src/assets/<グループ>/<名前>.png` に置く → `window.ASSETS["グループ"]["名前"]` で参照 |
| 秘書の絵を足す | 立ち絵のシートを `src/assets/art/secretary/` に置く → `python tools/slice_secretary.py`(既定は上段のみ。`--rows=N` で増やす) → `python build.py`。**クラブIDから決まる**ので、増やせばその日から配られる先が増える(→[docs/06 §6.27](docs/06-design-system.md)) |
| ステッカーを足す | 白地の絵を `src/assets/art/sticker/<中身が分かる名前>.png` に置く → `python tools/slice_sticker.py` → `python build.py`。タイトルの壁に自動で混ざる。**ファイル名がそのまま引き当てキー**なので後から変えない(HOMEが名指しで使う)。**素材を `src/assets/sticker/` に直接置かない**(10MB級がそのまま index.html に埋まる)(→[docs/06 §6.29](docs/06-design-system.md) / [§6.30](docs/06-design-system.md)) |
| 選手の絵を足す | 3枚組シートを `src/assets/art/commons/<段>/<ポジション>/`(汎用)または `src/assets/art/signature/<段>/<ポジション>/`(実在選手)に置く(段は std/reg/spe/wc/leg/any、ポジションは gk/df/mf/fw/out。**GKは必ず gk**) → `python tools/slice_commons.py` → `python build.py`。書き出しは `src/assets/players/`(汎用)と `src/assets/sig/`(実在選手)に分かれる。**書き出しフォルダは手で触らない**(→[docs/03 §3.19](docs/03-game-design.md)) |

## 姉妹プロジェクト card-eleven の参照方針

`c:\Claude\repository\card-eleven` に、同じ土台で作られた収集型カードサッカーゲームがある
(試合エンジン・ガチャ・カード描画・キャリアモードなどが実装済み)。

- 本プロジェクトは**土台のみを継承**しており、ゲームコードは引き継いでいない。
- 試合エンジンなどを作る段になったら、**その都度 card-eleven の該当ファイルを読んで考え方だけ取り込む**。
  ファイルの丸ごとコピーはしない(前提と負債ごと持ち込むことになるため)。
- 参考にした場合は [docs/05-decisions-backlog.md](docs/05-decisions-backlog.md) の決定事項ログに残す。

参考になりやすい箇所:
- `src/js/match-core.js` — DOM非依存の純粋な試合計算
- `src/js/match-flow.js` — 進行制御とレジストリによる拡張の作り方
- `src/js/match-render.js` — 描画と演出の分離
- `docs/01-architecture.md` — 土台の設計意図
