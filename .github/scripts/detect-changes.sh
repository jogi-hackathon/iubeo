#!/usr/bin/env bash
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

if [ "$EVENT_NAME" = "pull_request" ]; then
  range=("$BASE_SHA...$HEAD_SHA")
else
  range=("$BASE_SHA" "$HEAD_SHA")
fi

# 非 ASCII のパスは引用符で囲まれて出るので、-z で NUL 区切りにして一時ファイルへ書く。
# --no-renames は、移動元(backend から消えたファイル)も含めるため。
# NUL をシェル変数に入れると bash が捨ててしまうので、変数は経由させない
tmp=$(mktemp)
git diff --name-only -z --no-renames "${range[@]}" > "$tmp" || run_all
files=$(tr '\0' '\n' < "$tmp")
rm -f "$tmp"

echo "変更されたファイル:"
echo "${files:-(なし)}"

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
emit_if_changed frontend '^frontend/|^backend/api/'
emit_if_changed infra '^infra/'
