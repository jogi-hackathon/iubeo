# ADR-0006: TypeScript 7 のもとで openapi-typescript を動かす

- 日付: 2026-10-07
- ステータス: Proposed
- 関連: [ADR-0002](ADR-0002-backend-technology-selection.md) / [backend/api/openapi.yaml](../../backend/api/openapi.yaml)

## 背景

> どのような状況・制約・力関係のもとでこの決定が必要になったのか。

- 背景: **ADR-0002 で、フロントエンドの型は openapi.yaml から openapi-typescript で生成すると決めた。しかし、フロントエンドは TypeScript 7(ネイティブ実装)を使っており、openapi-typescript がそのままでは動かない**
  - openapi-typescript 7.13.0(2026-10 時点の最新)は、peer に `typescript ^5.x` を求め、TS の JS API(`ts.factory`)で出力を組み立てる
    https://www.npmjs.com/package/openapi-typescript
  - TypeScript 7.0.2 の npm パッケージは `tsc` の実行ファイルを包むだけで、JS API を持たない(`require("typescript").factory` が `undefined`)
  - `typescript` に 7.0.2 を入れたまま openapi-typescript を足すと、peer の typescript が 7.0.2 に解決され、生成に失敗する
  - バックエンドは oapi-codegen を `go.mod` の `tool` ディレクティブで管理し、推移的な依存まで go.sum で固定している。フロントエンドの生成器も同じように lockfile で固定したい
  - 型の生成は openapi.yaml を変えたときだけ行い、生成物はコミットする。ビルドや CI では生成しない

## 決定

**npm の別名で、TypeScript 7 と 5 を並べて入れる** ことを採用する。

```json
"devDependencies": {
  "@typescript/native": "npm:typescript@7.0.2",
  "typescript": "npm:typescript@5.9.3",
  "openapi-typescript": "7.13.0"
}
```

- `typescript`(5.9.3)は、openapi-typescript の peer を満たすためだけに置く
- 型検査とビルドの `tsc` は TypeScript 7 で動く。pnpm は同じ名前のコマンド(`tsc`)がぶつかると、パッケージ名が同じ(どちらも中身は `typescript`)ならバージョンの高い方を選ぶため(pnpm 11 の `bins/linker` の `compareCommandsInConflict`)
  https://github.com/pnpm/pnpm/blob/main/pnpm11/bins/linker/src/index.ts
- `pnpm gen:api` で `src/net/schema.gen.ts` に書き出し、コミットする

理由:

- package.json と lockfile が 1 つのまま、生成器を推移的な依存まで固定できる。バックエンドの `go tool` と同じく、誰がいつ生成しても同じ生成器で動く
- 生成器もふだんの `pnpm install` で入り、別の手順が要らない
- openapi-typescript が TypeScript 7 に対応したら、`typescript` を 7 に戻し、`@typescript/native` を消せばよい

前提と制約:

- `typescript` という名前は TypeScript 5 を指す。エディタで「ワークスペースの TypeScript」を使うと 5.9.3 になる。`typescript` の名前で読み込むツールを足すときも同じ
- `tsc` が TypeScript 7 になるのは、上の pnpm の規則による。`pnpm exec tsc --version` が 7 系であることを、依存を変えたときに確かめる

## 検討した選択肢

### 案B: 生成器だけを別の package(`frontend/tools/openapi/`)に隔離する

- 概要: openapi-typescript と TypeScript 5 だけを持つ package と lockfile を別に置き、`gen:api` からその依存を入れて実行する
- 利点: 推移的な依存まで固定でき、`typescript` という名前は TypeScript 7 のままにできる
- 欠点 / リスク: package.json と lockfile が 2 組になり、生成器の依存の更新を別に行う必要がある
- 却下理由: 案A でも同じく固定でき、構成が 1 組で済むため(当初はこの案を採用していたが、案A が動くことを確かめて切り替えた)

### 案C: `pnpm dlx openapi-typescript@7.13.0` で実行する

- 概要: 生成のたびに、pnpm が一時的な環境を作って実行する。peer の typescript もその中で別に解決される(試したところ 5.9.3 に解決され、生成できた)
- 利点: 設定が要らず、プロジェクトの依存にも lockfile にも何も足さない
- 欠点 / リスク: 固定できるのは openapi-typescript 本体のバージョンだけで、推移的な依存は実行時に解決される。人や時期によって生成器の中身が変わりうり、供給網の固定から外れる。初回はネットワークが要る
- 却下理由: バックエンドが生成器を固定している方針とそろえたいため

### 案D: `typescript` は 7 のまま、pnpm の設定で openapi-typescript にだけ TypeScript 5 を見せる

- 概要: `overrides`・`packageExtensions` で、openapi-typescript からだけ TypeScript 5 を見せる
- 利点: `typescript` という名前を TypeScript 7 のままにでき、lockfile も 1 つ
- 欠点 / リスク: pnpm 11.25 で試したところ、`pnpm-workspace.yaml` の `overrides`(`openapi-typescript>typescript`)も、`packageExtensions` で dependencies に TypeScript 5 を足す方法も peer には効かず、ルートの 7.0.2 に解決されて生成に失敗した。`package.json` の `pnpm` フィールドは読まれなかった
- 却下理由: 実現できなかったため

### 案E: 型を手書きする

- 概要: 生成をやめ、`ClientMessage` / `ServerMessage` などの型を TS で手書きする
- 利点: 依存が増えない
- 欠点 / リスク: openapi.yaml と手書きの型がずれうる
- 却下理由: ADR-0002 の「1つの定義から Go と TS の型を生成し、ずれさせない」方針から外れるため
