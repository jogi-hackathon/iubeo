#!/usr/bin/env bash
# 計測の全体(ビルド・バンドル・ブラウザ・バックエンド)を 1 回走らせ、perf/results/<label>/ に結果を置く
# 使い方: perf/run-all.sh <label> [回数]     例: perf/run-all.sh baseline 3
set -euo pipefail

LABEL="${1:?label を指定する}"
REPEAT="${2:-3}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PERF="$ROOT/perf"
OUT="$PERF/results/$LABEL"
mkdir -p "$OUT" "$PERF/.tmp"

step() { echo; echo "== $* =="; }

step "フロントのビルド(3 回。ビルド時間の中央値を見る)"
cd "$ROOT/frontend"
# CI(deploy-cloudflare.yml)と同じ条件で測る。frontend/.env(git 管理外)の VITE_ENABLE_DEBUG=true を打ち消す
export VITE_ENABLE_DEBUG=false
for i in 1 2 3; do
  /usr/bin/time -p pnpm exec vite build >"$PERF/.tmp/build-$i.log" 2>&1 || true
  grep '^real' "$PERF/.tmp/build-$i.log" | awk '{print $2}'
done | tee "$OUT/build-seconds.txt"
pnpm exec vite build --sourcemap >/dev/null 2>&1

step "バンドルの大きさと内訳"
node "$PERF/lib/bundle-report.mjs" > "$OUT/bundle.json"
PERF_DEEP=1 node "$PERF/lib/bundle-report.mjs" > "$OUT/bundle-deep.json"

step "ブラウザ: 通常(vsync あり・操作なし)"
node "$PERF/lib/bench-browser.mjs" --label "$LABEL/desktop" --runs "$REPEAT" --seconds 8

step "ブラウザ: 上限なし・前進しながら(1 フレームの実コスト)"
node "$PERF/lib/bench-browser.mjs" --label "$LABEL/uncapped-move" --runs "$REPEAT" --seconds 6 --uncapped --move

step "ブラウザ: 遅い回線(4G 相当)と CPU 4 倍遅延(起動時間)"
node "$PERF/lib/bench-browser.mjs" --label "$LABEL/regular4g-cpu4" --runs "$REPEAT" --seconds 2 --net regular4g --cpu 4

step "ブラウザ: 再訪(HTTP キャッシュあり)、4G 相当 + CPU 4 倍遅延"
node "$PERF/lib/bench-browser.mjs" --label "$LABEL/repeat-regular4g-cpu4" --runs "$REPEAT" --seconds 1 --repeat --net regular4g --cpu 4

step "バックエンド: Go ベンチマーク"
cd "$ROOT/backend"
go test ./internal/session -run '^$' -bench . -benchmem -count 5 > "$OUT/go-bench.txt"
tail -n 12 "$OUT/go-bench.txt"

step "バックエンド: 負荷試験(サーバーを起動し直して測る)"
go build -o "$PERF/.tmp/iubeo-server" ./cmd/server
go build -o "$PERF/.tmp/loadtest" ./cmd/loadtest
cd "$PERF"
for i in $(seq 1 "$REPEAT"); do
  IUBEO_ADDR=127.0.0.1:8080 IUBEO_SIGNING_KEY=iubeo-perf-only-signing-key-0123456789abcdef \
    IUBEO_ALLOWED_ORIGINS=http://localhost:5173 IUBEO_MATCH_SIZE=3 \
    "$PERF/.tmp/iubeo-server" >"$PERF/.tmp/server-$i.log" 2>&1 &
  SERVER_PID=$!
  sleep 1
  "$PERF/.tmp/loadtest" -url http://127.0.0.1:8080 -origin http://localhost:5173 \
    -clients 30 -duration 20s -warmup 3s -label "$LABEL-$i" -out "$OUT/load-$i.json" | tail -n 6
  kill "$SERVER_PID" 2>/dev/null || true
  wait "$SERVER_PID" 2>/dev/null || true
  sleep 1
done
echo
echo "完了: $OUT"
