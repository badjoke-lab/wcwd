# Mini Apps data pipeline (`test/mini-apps`)

## 取得元
- 一次ソース: **miniapps.world**
- URL: `https://www.miniapps.world/`
- 実装上の定数: `test/mini-apps/scripts/fetch_miniapps_stats.js` の `MINIAPPS_SOURCE`

## 生成物
- `test/mini-apps/data/latest.json`
  - UI 側はこの 1 ファイルを読む想定
- `test/mini-apps/data/snapshots/YYYY-MM-DD.json`
  - 日次スナップショット
- `test/mini-apps/data/meta.json`
  - 更新時刻、取得元、件数、バージョンなど最小メタ情報

## キースキーマ
`latest.json` の固定構造:
- `ok`, `updatedAt`, `source`, `counts`, `apps[]`
- `apps[]` の各要素:
  - `slug`, `name`, `rank7d`, `rankAll`, `value7d`, `valueAll`, `deltaRank7d`
  - `flags.hot`, `flags.new`, `flags.drop`
  - `category`
  - `links.official`

## ローカル実行
```bash
node test/mini-apps/scripts/build_daily.js
```

補足（オフライン/検証用）:
```bash
MINIAPPS_SAMPLE_FILE=test/mini-apps/data/source.sample.html node test/mini-apps/scripts/build_daily.js
```

## 差分ルール
- `deltaRank7d = current.rank7d - previous.rank7d`
- `hot`: `deltaRank7d <= -10` または Top20 新規侵入
- `drop`: `deltaRank7d >= +10`
- `new`: 前回未存在、または前回圏外（>100）から今回 Top100 入り

## 注意事項（欠損・取得失敗）
- 欠損値は `normalize` で数値化できない場合 `null` または既定値に補正
- 取得失敗・パース失敗時は `build_daily` が **失敗終了**し、既存 `latest.json` を壊さない
- 書き込みは `*.tmp` へ出力後 rename する atomic write で行い、破損 JSON を防止
