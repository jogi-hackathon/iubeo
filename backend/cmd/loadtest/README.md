# loadtest

バックエンドに WebSocket で負荷をかけ、プレイヤーが体感するレイテンシを測るツール。もとは Fargate の `x86_64` と `ARM64`(Graviton)を同じ条件で比べるために作った。今は `perf/run-all.sh`・`perf/ws-ab.sh` の負荷試験にも使っている。

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

サーバーは何もしないプレイヤーをフェーズの締切(既定 1 分)で脱落させ、全員脱落でセッションを終える。測定中に切られないよう、測る側のサーバーは `IUBEO_PHASE_DURATION` を測定時間より長く(例: `10m`)しておく。

主なフラグ:

| フラグ | 既定 | 説明 |
| --- | --- | --- |
| `-url` | (必須) | 対象の URL |
| `-origin` | `http://localhost:5173` | `Origin` ヘッダ。サーバーの `IUBEO_ALLOWED_ORIGINS` に含まれる必要がある |
| `-clients` | 30 | 同時クライアント数。`-match` の倍数に切り下げる |
| `-match` | 3 | 1 セッションの人数。サーバーの `IUBEO_MATCH_SIZE` と合わせる |
| `-hz` | 20 | 1 クライアントが transform を送る回数/秒 |
| `-duration` / `-warmup` | 20s / 3s | 測定時間と、測定から除く助走時間 |
| `-binary` | false | 位置のメッセージをバイナリでやり取りする(URL に `enc=bin` を付ける。フロントと同じ) |
| `-label` / `-out` | - | 測定の名前(比較チャートのラベル)/ 結果 JSON の出力先(省略すると要約だけ出す) |
| `-compare` / `-labels` / `-title` | - / ファイル名 / `Fargate x86_64 vs ARM64 (Graviton)` | 負荷はかけず、結果 JSON を並べた比較チャート(SVG)を描く。`-title` の既定は Fargate のころのままなので、比べるたびに指定する |

## 本番相当の環境で測る

Fargate の構成は EC2 + EIP に置き換えた([ADR-0005](../../../docs/adr/ADR-0005-deployment-architecture.md))。今の Terraform は ARM64 に固定で(既定 `t4g.small`、AMI も arm64)、
アーキテクチャを切り替える変数は無い。x86_64 と比べたいときは、Terraform を直して別に立てる必要がある。

EC2 を起動し、KV の `target` が `ec2` になっていれば、公開オリジン経由で測れる。`-origin` は、サーバーの `IUBEO_ALLOWED_ORIGINS`(Terraform の `allowed_origins`)に含まれるものにする。

```sh
go run ./cmd/loadtest -url https://<公開オリジン> -origin https://<公開オリジン> \
  -clients 30 -duration 30s -warmup 5s -binary -label ec2 -out ec2.json
```

負荷をかける側は、できれば東京のネットワークから実行する。手元から実行する場合でも、比べる測定どうしで同じ経路になるので比較自体は成立する。

## 結果を正しく読むための注意

- **Apple Silicon の Mac で `linux/amd64` のコンテナを動かして比較してはいけない。** Rosetta や QEMU のエミュレーションが入るため、実機の x86_64 より大幅に遅く出る。アーキテクチャの比較は必ず実機で測る
- **RTT は tick の位相に敏感。** 送信が tick の直前に届くか直後に入るかで 0〜50ms 変わる。`-clients` が少ないと分布が二峰性になることがある(手元の確認では 9 クライアントで p95 41.7ms、30 クライアントで 24.3ms だった)。**両方の測定で `-clients` と `-hz` を必ず揃える**
- **1 回の測定で判断しない。** 2 回ずつ測って中央値で比べる。`-duration` を長くすると p99 が安定する
- 配信間隔の p50 が 50.0ms から外れていれば、サーバーが 20Hz を保てていない。**Graviton の判断は、まずここを見る**
- CPU 使用率そのものは測っていない。必要なら EC2 の CloudWatch メトリクスを見るか、`perf/ws-ab.sh`(手元でサーバーの CPU 時間も記録する)を使う
