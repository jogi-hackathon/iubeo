# perf: 計測基盤

フロント(ブラウザでの起動・フレーム・転送量)とバックエンド(Go のベンチマーク・WebSocket 負荷試験)のパフォーマンスを、同じ手順で繰り返し測るための道具。
チューニングの前後は必ずこの手順で測り、`perf/results/<label>/` に結果を残す。

## 実行

```sh
# 全体を 1 回(ビルド・バンドル・ブラウザ 3 モード・Go ベンチ・負荷試験)。回数は既定 3
perf/run-all.sh <label> [回数]          # 例: perf/run-all.sh baseline 3
node perf/lib/summarize.mjs baseline after   # ラベルごとの中央値を並べる(変化率つき)
```

個別に走らせる場合:

```sh
cd frontend && pnpm exec vite build --sourcemap              # 計測対象のビルド(.cloudflare/output)
node ../perf/lib/bench-browser.mjs --label x --runs 3 --seconds 8                    # 通常
node ../perf/lib/bench-browser.mjs --label x --runs 3 --seconds 6 --uncapped --move  # 上限なし・前進
node ../perf/lib/bench-browser.mjs --label x --runs 3 --seconds 2 --net regular4g --cpu 4  # 4G 相当 + CPU 4 倍遅延
node ../perf/lib/bundle-report.mjs                                                    # サイズ・内訳(PERF_DEEP=1 で three の内訳)
node ../perf/lib/screenshot.mjs <label>                                               # 見た目の回帰チェック用
node ../perf/lib/diff-shots.mjs A.png B.png                                           # 2 枚の差分
cd ../backend && go test ./internal/session -run '^$' -bench . -benchmem -count 5    # Go ベンチ
```

負荷試験はサーバーを起動してから `backend/cmd/loadtest` を当てる(`run-all.sh` が 3 回やってくれる)。

## 何を測っているか

| 指標 | 意味 |
| --- | --- |
| 起動画面が消える | BootScreen(React の初期化・boot ステップ)が消えた時刻 |
| 操作できる | シェーダーのウォームアップ(`.boot-overlay`)が消えた時刻。ユーザーが実際に触れられるまで |
| フレーム p50/p95 (上限なし) | `--uncapped` で vsync と 60fps 上限を外したときの 1 フレームの実コスト。改善の余地を見る |
| fps (通常) | vsync 有りの実際の表示。60 で頭打ちになるので、負荷の変化は見えにくい |
| JS 転送量 | ブラウザが実際に受け取った JS の大きさ(サーバー側は br/gzip で配信。キャッシュ済み) |
| RTT / 配信間隔 | 負荷試験。自分の transform が配信で戻るまでと、transforms の届く間隔 |
| Go ベンチ | `Step`・受信デコード・配信の JSON 化の 1 回あたりのコスト |

## 測り方の注意

- **実行ごとにブラウザを起動し直す**(冷えた状態で測るため)。前に 1 回、捨て打ちの実行でサーバーの圧縮キャッシュを温める。
- サーバー(`perf/lib/serve.mjs`)は Cloudflare の配信に近づけるため br/gzip で返す。圧縮結果はキャッシュする(毎回 q11 をかけると時間が混ざる)。
- ブラウザは Playwright の Chrome for Testing(WebGPU 有効)。このアプリは WebGPU のみ対応なので、WebGPU が取れない環境では計測できない。
- 4G・CPU 制限は CDP のエミュレーション。実機の値ではなく、相対比較に使う。
- 負荷試験は同じマシンで、サーバーと負荷を同時に動かす。RTT は tick(50ms)の位相に左右され、回ごとに 40〜47ms ほど揺れる。**1 回では判断しない**。
- 見た目の比較は、同じ条件で 2 回撮って差の大きさ(ノイズの床)を先に測ってから判断する(`NOTES.md` 参照)。

## ファイル

- `run-all.sh` … 全体の実行
- `lib/bench-browser.mjs` … ブラウザ計測(起動・フレーム・ロングタスク・転送量)
- `lib/bundle-report.mjs` … バンドルのサイズ(raw/gzip/brotli)と sourcemap からの内訳
- `lib/serve.mjs` … 静的配信(br/gzip 圧縮つき、SPA フォールバック)
- `lib/screenshot.mjs` / `lib/diff-shots.mjs` … 見た目の回帰チェック
- `lib/summarize.mjs` … 中央値の要約・比較
- `lib/probe-*.mjs` … 前提確認(WebGPU が使えるか、起動の DOM の推移)
- `results/<label>/` … 結果(JSON・Go ベンチの出力・要約)。`.tmp/` は作業用で git 管理外
- `NOTES.md` … 計測ログと判断の記録

## 深掘り用の追加ツール(デバッグシーンと大人数の計測)

- `vite.devscenes.config.mts` … 最適化ビルドに開発シーンを含める。計測用に `window.__pp` と、キャラクター N 体の `crowd` シーン、`batched`(プロトタイプ)を足す。製品の設定とソースは変えない。
  - ビルド: `cd frontend && pnpm exec vite build --config ../perf/vite.devscenes.config.mts`
  - 配信: `PERF_DIST=<コピー先> node perf/lib/bench-browser.mjs --query "scene=crowd&n=30"`
- `lib/profile-scene.mjs` … 関数ごとの CPU 自己時間
- `lib/read-stats.mjs` … ?debug の統計(ドローコール・三角形・GPU 時間)
- `lib/attribute.mjs` … ポストプロセス効果ごとの差分(`--dpr 2 --runs 3`)
- `scenes/CrowdScene.tsx`, `scenes/BatchedCrowdScene.tsx` … 計測専用のシーン(製品には入らない)
- 注意: 開発サーバーでの計測は揺れが大きい。比較は最適化ビルドで、同じフラグ(`--uncapped`、`--move` の有無)で行う。`--move` はカメラが動くので、描画量が変わる。
