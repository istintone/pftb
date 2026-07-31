> [← ドキュメント索引 (SPEC.md)](../SPEC.md) ｜ pftb 仕様書

---

## 4. テストと検証

ブラウザを使わず **headless Node** で本体JSを読み込んで検証する。
`src/tests/_setup.js` が `document` / `window` / `localStorage` / `Image` / `setTimeout` をモックし、
`src/js/*.js` を結合した一時ファイル(`_tmp_*.js`・Git管理外)を require して返す。

### 4.1 テスト一覧

| テスト | 内容 | 位置づけ |
|---|---|---|
| `integration.js` | 新規作成 → 保存 → 読込 → 書き出し/読み込み → 画面切替 | 必須 |
| `hangtest.js` | ストレージ無応答でも起動が止まらない(タイムアウトで既定データ続行) | 必須 |

### 4.2 実行

```bash
cd src/tests
for t in integration hangtest; do
  echo -n "$t: "; node $t.js >/dev/null 2>&1 && echo OK || echo FAIL
done
```

PowerShell の場合:

```powershell
cd src\tests
foreach ($t in @("integration","hangtest")) {
  node "$t.js" *> $null; if ($?) { "$t : OK" } else { "$t : FAIL" }
}
```

### 4.3 三層の検証

1. **ビルド検証**(`python build.py`): CSS/JSの再埋め込み一致 + 参照ID整合(`getElementById` ↔ `id=`)。
2. **ロジック検証**(`src/tests/*.js`): 状態遷移・保存・異常系。
3. **目視確認**: `index.html` をブラウザ(できればスマホ幅)で開き、実際に触る。

### 4.4 リリース手順

1. `src/` を編集
2. `python build.py`(検証がすべて True・MISSING ids なし)
3. `cd src/tests` → 必須テストがすべて OK
4. `index.html` をブラウザで開いて目視確認
5. SPEC/docs を実装に合わせて更新
6. コミット(日本語メッセージ)。プッシュは明示指示時のみ

### 4.5 テストの足し方

- 新しい機能はまず `integration.js` の流れに1ステップ足せないかを考える(1周の流れを守るテストが一番効く)。
- 独立した観点(異常系・バランス・長時間実行)は別ファイルにし、この表に追記する。
- `src/js` にファイルを足したら `_setup.js` の `JS_FILES` も更新する(`build.py` と並びを一致させる)。

---

[← 前: 3. ゲームデザイン](03-game-design.md) ｜ [↑ 索引](../SPEC.md) ｜ [次: 5. 決定事項ログ →](05-decisions-backlog.md)
