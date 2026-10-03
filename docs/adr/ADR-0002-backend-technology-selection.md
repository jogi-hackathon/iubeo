# ADR-0002: バックエンドの技術選定と API スキーマの定義方式

- 日付: 2026-10-03
- ステータス: Accepted
- 関連: [ADR-0001](ADR-0001-frontend-libraries-selection.md) / [ADR-0003](ADR-0003-backend-state-and-communication.md) / [ADR-0004](ADR-0004-backend-session-runtime.md) / [docs/backend/state-schema.md](../backend/state-schema.md)

## 背景

> どのような状況・制約・力関係のもとでこの決定が必要になったのか。

- 背景: **3人のプレイヤーの状態をサーバー権威で同期するゲームバックエンドが必要になった。あわせて、フロントエンド(TypeScript)とバックエンドで通信の型を共有する方法を決める必要があった**
  - 通信は、マッチングなどの HTTP API と、セッション中の WebSocket(座標の 20Hz 同期、インタラクトの要求、状態変化の通知)の2種類
  - HTTP API は、マッチングを皮切りに今後も増える見込み
  - フロントエンドには、サーバーの代わりに動くダミー(`frontend/src/dev/dummyAuthority.ts`)と、それが扱う型が既にあり、実サーバーに切り替えるときに型を揃えたい

## 決定

**Go(標準 `net/http`)+ OpenAPI 3.0.3(oapi-codegen / openapi-typescript)** を採用する。

採用する言語・ライブラリ・ツール

- Go
  https://go.dev/
  - 標準 `net/http`(Go 1.22 以降の `ServeMux`)
    https://pkg.go.dev/net/http
- OpenAPI 3.0.3(`backend/api/openapi.yaml`)
  https://spec.openapis.org/oas/v3.0.3
  - oapi-codegen(Go の型と `net/http` 用のサーバーインターフェースを生成)
    https://github.com/oapi-codegen/oapi-codegen
  - openapi-typescript(フロントエンドの TS の型を生成)
    https://github.com/openapi-ts/openapi-typescript
  - Redocly CLI(定義の lint)
    https://github.com/Redocly/redocly-cli

WebSocket のメッセージ型も、OpenAPI の `components/schemas` に `ClientMessage` / `ServerMessage` としてまとめて定義する。メッセージ自体は JSON で送る。
WebSocket のライブラリは実装時に決める(候補: coder/websocket)。

理由:

- Go: バックエンド担当が慣れていて、使いたい言語であるため
  - goroutine と channel で、セッションごとの直列処理(同時操作の先着判定)や 20Hz の配信を素直に書ける
  - 単一のネイティブバイナリで動き、メモリ消費が少なく、コンテナ化・デプロイが楽
- 標準 `net/http`: パスパラメーターとメソッドごとの振り分けに標準で対応しており、今回のエンドポイント数なら外部のルーターは要らないため。依存が増えない
- OpenAPI で HTTP と WebSocket の型をまとめて定義する: チームメンバーの意見をもとにした
  - マッチング API をはじめ HTTP API が増える見込みがあり、OpenAPI ひとつにまとめておくほうが共通化しやすい
  - リアルタイム通信では、実行時にスキーマを受け渡す必要はなく、メッセージの形が型として分かっていれば足りる
  - 定義が1ファイルなので、Go と TS の両方の型を同じ元から生成でき、ずれない
- 3.1 ではなく 3.0.3: oapi-codegen が OpenAPI 3.1 に未対応のため。null は `nullable`、固定値は1要素の `enum` で表す

## 検討した選択肢

### 案B: JSON + AsyncAPI

- 概要: WebSocket のメッセージを AsyncAPI 3.0 で定義し、HTTP は OpenAPI で定義する
- 利点: メッセージの送る向きやチャネルまで仕様として表せる
- 欠点 / リスク:
  - HTTP 用に OpenAPI も要るので、定義が2本に分かれる
  - Go 向けのコード生成が弱い
- 却下理由: 定義を1本にまとめて共通化するほうを優先したため。送る向きなどは OpenAPI の description と state-schema.md で補える

### 案C: Protobuf

- 概要: メッセージをバイナリで送り、`.proto` から Go と TS の型を生成する
- 利点: メッセージが小さく、エンコードとデコードが速い。スキーマの互換性を管理する仕組みがある
- 欠点 / リスク:
  - 3人・20Hz 程度の同期では、バイナリにすることによるサイズや速度の利点がほとんど効かない
  - HTTP API は別に OpenAPI で書きたいので、定義が2系統になる
- 却下理由: 今の要件では Protobuf の利点が必要とされておらず、HTTP API と合わせて OpenAPI で共通化するほうがチームにとって扱いやすいため

### 案D: 素の JSON Schema

- 概要: Swagger(OpenAPI)を使わず、JSON Schema のファイルで型だけを定義する
- 利点: 仕様が単純で、ツールの制約(3.0 と 3.1 の違いなど)を受けない
- 欠点 / リスク: HTTP のエンドポイントの文書化と、サーバーのコード生成ができない
- 却下理由: HTTP API も型と一緒に管理したいため

### 案E: chi / echo(Go のルーター)

- 概要: oapi-codegen の生成先に、外部のルーターを使う
- 利点: chi は `net/http` 互換でミドルウェアがそろっている。echo は機能が多い
- 欠点 / リスク: 依存が増える。echo は独自の Context を持ち、`net/http` との互換性が下がる
- 却下理由: 標準の `ServeMux` で今の要件を満たせるため。必要になれば `net/http` 互換の chi へは移りやすい
