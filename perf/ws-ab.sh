#!/usr/bin/env bash
# 位置のメッセージを、方式ごとに交互に測る(json = 現行の JSON / binary = バイナリ、enc=bin)。1 回ごとにサーバーを起動し直し、
# 測定時間の間のサーバーの CPU 時間(ps の累積 CPU 時間の差)も記録する。
# 使い方: perf/ws-ab.sh <label> <clients> <回数> [方式...]   例: perf/ws-ab.sh wsab30 30 3 json binary
set -euo pipefail
LABEL="${1:?label}"; CLIENTS="${2:-30}"; REPEAT="${3:-3}"; shift 3 || true
MODES="${*:-json binary}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"; PERF="$ROOT/perf"; OUT="$PERF/results/$LABEL"
mkdir -p "$OUT"
WARMUP=5; DURATION=20
cpu_seconds() { ps -o time= -p "$1" | awk -F'[:.]' '{ if (NF==3) print $1*60+$2+$3/100; else print $1*3600+$2*60+$3+$4/100 }'; }
for i in $(seq 1 "$REPEAT"); do
  for mode in $MODES; do
    IUBEO_ADDR=127.0.0.1:8080 IUBEO_SIGNING_KEY=iubeo-perf-only-signing-key-0123456789abcdef \
      IUBEO_ALLOWED_ORIGINS=http://localhost:5173 IUBEO_MATCH_SIZE=3 \
      "$PERF/.tmp/iubeo-server" >"$PERF/.tmp/ws-ab-server.log" 2>&1 &
    SRV=$!
    sleep 1
    flag=""; [ "$mode" = binary ] && flag="-binary"
    LOG="$PERF/.tmp/ws-ab-$mode-$i.log"
    "$PERF/.tmp/loadtest" -url http://127.0.0.1:8080 -origin http://localhost:5173 -clients "$CLIENTS" \
      -duration ${DURATION}s -warmup ${WARMUP}s $flag -label "$mode-$i" -out "$OUT/$mode-$i.json" >"$LOG" 2>&1 &
    LT=$!
    until grep -q "全員接続" "$LOG"; do sleep 0.2; done
    sleep "$WARMUP"
    c0=$(cpu_seconds "$SRV"); sleep "$DURATION"; c1=$(cpu_seconds "$SRV"); rss=$(ps -o rss= -p "$SRV" | tr -d ' ')
    wait "$LT" || true
    cpu=$(awk -v a="$c0" -v b="$c1" -v d="$DURATION" 'BEGIN{printf "%.1f", (b-a)/d*100}')
    echo "{\"mode\":\"$mode\",\"run\":$i,\"server_cpu_percent\":$cpu,\"server_rss_kb\":$rss}" > "$OUT/$mode-$i.cpu.json"
    echo "$mode #$i: サーバー CPU ${cpu}% RSS $((rss / 1024))MB / $(grep -E '回線|RTT ' "$LOG" | tr -s ' ' | tr '\n' ' ')"
    kill "$SRV" 2>/dev/null || true; wait "$SRV" 2>/dev/null || true
    sleep 1
  done
done
