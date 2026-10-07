# loadtest

バックエンドに WebSocket で負荷をかけ、プレイヤーが体感するレイテンシを測るツール。Fargate の `x86_64` と `ARM64`(Graviton)を同じ条件で比べるために作った。

## 測っているもの

| 指標 | 意味 |
| --- | --- |
| **RTT** | 自分の transform を送信してから、その transform が配信で戻ってくるまで。サーバーの 1 tick(最大 50ms)を含む |
| **配信間隔** | `transforms` が届く間隔。20Hz なら 50ms。CPU が足りないと伸びる・ばらつく |
| 配信数/秒 | サーバーがさばいたメッセージ数 |
| 切断 | 途中で切られた接続数(ADR-0004 の送信キューがあふれると起きる) |

`Broadcast` は送信者自身にも配られるので、RTT はサーバーの時計と合わせずに測れる。

## 使い方

```sh
# 1 回測る
go run ./cmd/loadtest -url https://api.example.com -origin https://app.example.com \
  -clients 30 -duration 30s -warmup 5s -label arm64 -out arm64.json

# 2 つの結果を比較チャート(SVG)にする
go run ./cmd/loadtest -compare x86.json,arm64.json -labels x86_64,arm64 -out compare.svg
```

サーバーは何もしないプレイヤーをフェーズの締切(既定 30 秒)で脱落させ、全員脱落でセッションを終える。測定中に切られないよう、測る側のサーバーは `IUBEO_PHASE_DURATION` を測定時間より長く(例: `10m`)しておく。

主なフラグ:

| フラグ | 既定 | 説明 |
| --- | --- | --- |
| `-url` | (必須) | 対象の URL |
| `-origin` | `http://localhost:5173` | `Origin` ヘッダ。サーバーの `IUBEO_ALLOWED_ORIGINS` に含まれる必要がある |
| `-clients` | 30 | 同時クライアント数。`-match` の倍数に切り下げる |
| `-match` | 3 | 1 セッションの人数。サーバーの `IUBEO_MATCH_SIZE` と合わせる |
| `-hz` | 20 | 1 クライアントが transform を送る回数/秒 |
| `-duration` / `-warmup` | 20s / 3s | 測定時間と、測定から除く助走時間 |

## Fargate で x86_64 と ARM64 を比べる

**同じ Terraform の構成を、アーキテクチャだけ変えて 2 回デプロイする。**

```sh
cd infra/aws/terraform

# --- x86_64 ---
docker buildx build --platform linux/amd64 -t "$(terraform output -raw ecr_repository_url):release-x86" --push ./backend
terraform apply -var image_tag=release-x86 -var cpu_architecture=X86_64

go run ./cmd/loadtest -url https://api.example.com -origin https://app.example.com \
  -clients 30 -duration 30s -warmup 5s -label x86_64 -out x86.json

# --- ARM64 (Graviton) ---
docker buildx build --platform linux/arm64 -t "$(terraform output -raw ecr_repository_url):release-arm" --push ./backend
terraform apply -var image_tag=release-arm -var cpu_architecture=ARM64

go run ./cmd/loadtest -url https://api.example.com -origin https://app.example.com \
  -clients 30 -duration 30s -warmup 5s -label arm64 -out arm64.json

go run ./cmd/loadtest -compare x86.json,arm64.json -labels x86_64,arm64 -out compare.svg
```

負荷をかける側は、できれば東京のネットワークから実行する。手元から実行する場合、両方の測定で同じ経路になるので比較自体は成立する。

## 結果を正しく読むための注意

- **Apple Silicon の Mac で `linux/amd64` のコンテナを動かして比較してはいけない。** Rosetta や QEMU のエミュレーションが入るため、実際の Fargate の x86_64 より大幅に遅く出る。必ず Fargate 上で測る
- **RTT は tick の位相に敏感。** 送信が tick の直前に届くか直後に入るかで 0〜50ms 変わる。`-clients` が少ないと分布が二峰性になることがある(手元の確認では 9 クライアントで p95 41.7ms、30 クライアントで 24.3ms だった)。**両方の測定で `-clients` と `-hz` を必ず揃える**
- **1 回の測定で判断しない。** 2 回ずつ測って中央値で比べる。`-duration` を長くすると p99 が安定する
- 配信間隔の p50 が 50.0ms から外れていれば、サーバーが 20Hz を保てていない。**Graviton の判断は、まずここを見る**
- CPU 使用率そのものは測っていない。必要なら CloudWatch の `ECS/ContainerInsights` を見る
