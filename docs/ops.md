# 運用ドキュメント（無料枠・cron間隔・確認コマンド・復旧手順）

## 1) 全体構成（1枚図レベルの文章）
- Pages（表示）: `https://wcwd.pages.dev/`
- Worker（収集/API）: `https://wcwd-history.badjoke-lab.workers.dev`
- Cron → KV に保存 → Pages が Worker API を読む（**閲覧数依存ではない**）

## 2) 推奨 cron 間隔（無料枠）
- 推奨：無料は **15分**（≈ 96点/日）
- 有料/余裕がある場合：**5分**（≈ 288点/日）
- 15分の欠点：短期スパイクは見えにくいが、日次傾向には十分

## 3) “データが増えない / 反映されない”時の確認手順（順番固定）
1. **Cronが動いてるか（Worker側）**
   - `npx wrangler tail wcwd-history` で `"*/15 * * * *" ... Ok` を確認
2. **KVに入ってるか（必ず --remote）**
   - `npx wrangler kv key list --binding HIST --remote | head`
   - `npx wrangler kv key get "snap:latest" --binding HIST --remote | python3 -m json.tool`
3. **APIが返してるか**
   - `curl -s "https://wcwd-history.badjoke-lab.workers.dev/api/latest" | head`
   - `curl -s "https://wcwd-history.badjoke-lab.workers.dev/api/list?limit=5" | head`
4. **Pagesが見に行けてるか（CORS/ヘッダ）**
   - `curl -sI "https://wcwd-history.badjoke-lab.workers.dev/api/list?limit=1" | tr -d '\r' | sed -n '1,40p'`

> 重要：wranglerのKV確認は **--remote なしだと空に見える**（ローカルKVを見るため）

## 4) 429 / 制限に当たった時（症状→対処）
- 症状：APIが429、Cronログに失敗、KV read/write エラー
- 対処：cron間隔を 15分以上へ、フロントのリクエスト回数削減（Task02で対応）
- “復旧確認”は上の確認手順を使う

## 5) ローカル表示と公開表示の違い
- ローカル（python http.server）は Pages Functions が無いので `/api/summary` は 404 になりうる
- 公開（wcwd.pages.dev）は Pages が動く（Functions/Headers含む）
- フロントは基本 Worker API（History）を見るため、ローカルでも history-base が正しければ動く

## 6) 何が取れないか（indexer無しの限界）
- 新規アドレス数・総アドレス数・正確な契約種別内訳などは N/A
- “推定/サンプル”と明記している項目は、**履歴からの推定値**や**一部サンプルからの外挿**であるため、
  正確な母数が無い前提で読み取る

## 7) 履歴保持方針（KVの自動掃除）
- 日キーは直近7日だけ保持（`snap:day:YYYY-MM-DD` / `hist:YYYY-MM-DD` を8日以上前から削除）
- `snap:list` は直近24h＋最大点数上限で維持（intervalに応じて自動調整）
- `meta:retention` で現状の保持情報を確認可能

## 8) Discord 通知（任意）
- 環境変数 `DISCORD_WEBHOOK_URL` を設定すると、cron実行時に「TPS急増」「Gas急増」を通知する
- 未設定の場合は通知処理をスキップ（cronは落ちない）
- 連投防止：同じ通知タイプは 60 分に 1 回まで

### テスト通知（任意）
- `ADMIN_TOKEN` を設定している場合のみ利用可能
- 例：
  - `curl -X POST "https://wcwd-history.badjoke-lab.workers.dev/api/test-notify?type=tps_spike" -H "Authorization: Bearer $ADMIN_TOKEN"`
  - `curl -X POST "https://wcwd-history.badjoke-lab.workers.dev/api/test-notify?type=gas_high" -H "Authorization: Bearer $ADMIN_TOKEN"`
