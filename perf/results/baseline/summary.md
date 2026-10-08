| 指標 | baseline |
|---|---:|
| JS raw (KB) | 1920.3 |
| JS gzip (KB) | 530.6 |
| JS brotli (KB) | 407.4 |
| JS 転送量 brotli(KB, 実測) | 407.7 |
| ビルド時間(秒, 中央値) | 0.78 |
| 起動画面が消える(ms, 通常) | 94 |
| 操作できる(ms, 通常) | 999 |
| 操作できる(ms, 4G+CPU4x) | 2092 |
| 起動画面が消える(ms, 4G+CPU4x) | 1153 |
| JS ヒープ(MB) | 15.8 |
| フレーム p50 (ms, 上限なし・前進) | 1.60 |
| フレーム p95 (ms, 上限なし・前進) | 2.50 |
| fps (上限なし・前進) | 623 |
| 負荷: RTT p50 (ms) | 44.2 |
| 負荷: RTT p95 (ms) | 44.9 |
| 負荷: 配信間隔 p95 (ms, 目標50) | 50.7 |
| 負荷: 配信数/秒 | 600 |
| 負荷: 切断(合計) | 1 |

| Go ベンチ | baseline ns/op (B/op, allocs) |
|---|---:|
| BenchmarkStepClientTransform | 341 (1824, 11) |
| BenchmarkStepTick | 444 (2432, 19) |
| BenchmarkDecodeTransform | 1357 (320, 8) |
| BenchmarkEncodeTransforms | 875 (384, 2) |

各値は実行回数の中央値。回数: baseline=通常3/上限なし3/4G3/負荷3
