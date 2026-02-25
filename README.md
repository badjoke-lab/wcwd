# wcwd

## 最短セットアップ
1. Pages を `https://wcwd.badjoke-lab.com/` にデプロイ
2. Worker（収集/API）を `https://wcwd-history.badjoke-lab.workers.dev` にデプロイ
3. Cron を **15分** 間隔で設定（無料枠の推奨）

運用・復旧・制約の詳細は [docs/ops.md](docs/ops.md) を参照してください。

## Build (header/footer partials)
公開ページは `partials/header.html` と `partials/footer.html` を使って、ビルド時に HTML へ直接注入します。

- ヘッダー差し込みマーカー: `<!-- WCWD:HEADER:BEGIN --> ... <!-- WCWD:HEADER:END -->`
- フッター差し込みマーカー: `<!-- WCWD:FOOTER:BEGIN --> ... <!-- WCWD:FOOTER:END -->`
- GA4 マーカー（`<head>` 内）: `<!-- WCWD:HEAD:GA4:BEGIN --> ... <!-- WCWD:HEAD:GA4:END -->`

実行順:
1. `python3 scripts/build_pages.py`
2. `python3 scripts/gen_sitemap.py`
