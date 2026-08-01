> [← ドキュメント索引 (SPEC.md)](../SPEC.md) ｜ pftb 仕様書

---

## 2. データモデル

### 2.1 セーブ状態 `S`(schema v3)

`localStorage["pftb-save"]` に `JSON.stringify(S)` で保存する。
`S` は**JSONで丸ごと保存できる素のオブジェクト**に保つ(関数・DOM参照・循環参照を入れない)。

**所有の境界を構造で表す**(→[03. §3.2](03-game-design.md))。この分け方のおかげで、
退任処理は「`S.club` を作り直すだけ」で済み、「これはどちら側か」を毎回判断せずに済む。

| キー | 型 | 意味 |
|---|---|---|
| `v` | number | スキーマ版(= `SAVE_VER`)。移行判定に使う |
| `coach` | string | 監督名(プレイヤー名)。就任契約書で記入 |
| `form` | string | 使用フォーメーション(`FORMATIONS` のキー) |
| `squad` | array | 編成11枠。カードID または null |
| **`player`** | object | **プレイヤー(監督)の恒久資産。クラブを移っても持ち越す** |
| `player.fame` | number | 名声 = 次にどのクラブへ行けるか(→[03. §3.9](03-game-design.md)) |
| `player.tickets` | number | チケット(報酬券)。コインを使わずパックを引ける |
| `player.coll` | array | **集めた選手カード**(→[03. §3.2.2](03-game-design.md)) |
| `player.tactics` | array | 習得した采配(→[03. §3.7](03-game-design.md)) |
| `player.trophies` | array | 獲得トロフィー |
| `player.history` | array | キャリアの軌跡 `[{season, clubId, rank, result}]` |
| **`club`** | object｜null | **契約中のクラブのもの。退任すると丸ごと捨てる**(就任前は null) |
| `club.id` | string | クラブID(`CLUBS` のキー) |
| `club.coins` | number | コイン(クラブ予算)。パックと施設が奪い合う(→[03. §3.5](03-game-design.md)) |
| `club.fac` | object | 施設レベル `{training, medical, stadium, scouting}` |
| `club.exp` | number | チーム熟練度。選べる戦術の幅を決める(→[03. §3.7](03-game-design.md)) |
| `club.eval` | number | 会長の評価。**期待順位との差から導出**する(累積しない) |
| `club.expect` | number | 今季の期待順位。クラブの格 × 持ち込んだ編成の強さ |
| `club.loan` | array | **クラブから借りている選手**。退任するとクラブに残る(→[03. §3.4](03-game-design.md) D13) |
| **`world`** | object | 世界の状態 |
| `world.seed` | number | **世界のシード**。クラブの選手はこれから毎回再生成する(下記 §2.3) |
| `world.season` | number | 現在のシーズン(任期の通算) |
| `world.matchday` | number | 現在の節(1シーズン=14節) |
| `world.table` | object | 順位表 `{clubId:{w,d,l,gf,ga}}` |
| `world.fixtures` | array | 日程 `[[{h,a},...], ...]`(節ごとの対戦カード) |

### 2.2 選手カードの形

```js
{
  id, name,
  pos:"MF", subs:["OMF","CB"],        // メイン / サブ(subs[0]がプライマリ)
  rarity:"ULTRA", ovr:102,            // OVR は6能力の合計(最大120)
  age:32, nation:"nordia",
  atk:17, def:18, pow:15, tec:20, spd:18, sta:14,   // 各 1〜20
  skills:[...], club:"FKソルベリ",     // club はコンビネーションの判定にも使う
}
```

仕様は [03. §3.12](03-game-design.md)。**OVR は必ず6能力の合計**にする
(能力を触ったら `calcOvr` で揃え直す)。

### 2.3 クラブの選手はセーブに持たない

32クラブ × 16人 = 512人を保存すると重い。代わりに **`world.seed` とクラブIDから決定的に再生成**する。

```
mulberry32(seed ^ hash(clubId)) → 常に同じ16人
```

保存が要るのは「集めたカード(`player.coll`)」と「今借りている選手(`club.loan`)」だけ。
同じキャリアなら何度開いても同じ顔ぶれが並び、セーブは小さいままになる。

### 2.4 保存の仕組み

- `save()` は**デバウンス**(600ms)。連続呼び出しを1回の書き込みにまとめる。即時 resolve するので `await save()` でよい。
- `flushSave()` で保留中の書き込みを確定。`visibilitychange`(非表示時)・`pagehide`・`beforeunload` で自動実行するため、
  タブを閉じても取りこぼさない。
- `deleteSave()` は保留中のデバウンス保存も破棄する(削除直後に復活しないように)。

### 2.5 マイグレーション

1. スキーマを変えたら `SAVE_VER` を上げる。
2. `migrate()` に `if(S.v<N){ ... }` を積み増す(古い形から新しい形への変換)。
3. `loadGame()` は `migrate()` の後、`defaultState()` との差分で**欠落キーを補完**する。
   単にキーを足しただけの変更なら `SAVE_VER` を上げなくてもこの補完で救われる。

### 2.6 書き出し / 読み込み(端末・URL移行)

- `exportSave()`: 保留中の保存をフラッシュしてから現在の `S` をJSON文字列で返す。
- `importSave(text)`: JSONとして解釈でき、オブジェクトで、`v` が数値であることを検証してから書き込む。
  検証に失敗した入力は例外にする(壊れたデータで上書きしない)。反映は呼び出し側でリロード。

---

[← 前: 1. アーキテクチャ](01-architecture.md) ｜ [↑ 索引](../SPEC.md) ｜ [次: 3. ゲームデザイン →](03-game-design.md)
