#!/usr/bin/env bash
# 変更されたパスを見て、ci.yml のどのジョブを走らせるかを決める。
#
# 入力(環境変数):
#   EVENT_NAME  pull_request / push / workflow_dispatch など
#   BASE_SHA    比較元(PR は base、push は before)
#   HEAD_SHA    比較先(PR は head、push は sha)
# 出力: $GITHUB_OUTPUT に backend / frontend / infra の true か false を書く
#
# 判定できないとき(比較元が無い、履歴に無い、差分が取れない)は全部走らせる。
set -euo pipefail

ZERO=0000000000000000000000000000000000000000

emit() {
  echo "$1=$2" >> "$GITHUB_OUTPUT"
  echo "$1: $2"
}

run_all() {
  emit backend true
  emit frontend true
  emit infra true
  exit 0
}

if [ -z "${BASE_SHA:-}" ] || [ "$BASE_SHA" = "$ZERO" ] || ! git cat-file -e "$BASE_SHA^{commit}" 2>/dev/null; then
  echo "比較元が無いので全部走らせる"
  run_all
fi

# PR は merge-base からの差分(...)、push は before から sha までの差分(..)
if [ "$EVENT_NAME" = "pull_request" ]; then
  files=$(git diff --name-only "$BASE_SHA...$HEAD_SHA") || run_all
else
  files=$(git diff --name-only "$BASE_SHA" "$HEAD_SHA") || run_all
fi

echo "変更されたファイル:"
echo "${files:-(なし)}"

# ci の定義やこのスクリプト自体が変わったときは、判定を信用せず全部走らせる
if grep -qE '^\.github/(workflows/ci\.yml|scripts/)' <<< "$files"; then
  echo "ci の定義が変わったので全部走らせる"
  run_all
fi

# here-string を使う。echo | grep -q だと、grep が早く抜けたときに pipefail で誤判定する
emit_if_changed() {
  if grep -qE "$2" <<< "$files"; then
    emit "$1" true
  else
    emit "$1" false
  fi
}

emit_if_changed backend '^backend/'
emit_if_changed frontend '^frontend/'
emit_if_changed infra '^infra/'
