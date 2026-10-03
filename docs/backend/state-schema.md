# バックエンド状態スキーマ v0.2

IUBEO のゲームバックエンドが保持する状態と、クライアントとの通信の形をまとめる。
v0.1 案(個人メモ)を、フロントエンドの実装(`frontend/src/objects`・`items`・`player`)と [IDEA.md](../IDEA.md) に合わせて改めた版。

機械可読な定義は [backend/api/openapi.yaml](../../backend/api/openapi.yaml) を正とし、この文書はその背景・ルール・内部状態を説明する。

## 0. v0.1 からの主な変更

| 項目 | v0.1 | v0.2 |
|---|---|---|
| フィールド名 | snake_case | **camelCase**(フロントの型に合わせる) |
| タスク種別 | `read` / `edit` / `web_search` / `write` | **`read_edit`** / `write` / `web_search` / **`image_generation`**(IDEA.md の Tool Call に合わせる) |
| ファイル | `fileId` と `location` のみ | 内部は `items[]`(ファイルの状態 `status` を持つ)。配信はフロントの形(ディレクトリの `stock`/`outputs`、手持ち `heldItem`)に組み立てる(→ §3) |
| ライター | `players[].hasLighter` | **アイテム**(`kind: "lighter"`)。置き場はオブジェクトで、拾うと手持ちになる。ファイルとは同時に持てない |
| 向き | yaw / pitch / roll + `rotationOrder` | **yaw / pitch のみ**(フロントの `Look` と同じ規約) |
| オブジェクト | なし | `objects[]`(フロントの `GameObject` と同じ形) |
| 通信 | なし | HTTP(OpenAPI)+ WebSocket メッセージ(→ §6, §7) |

## 1. 基本方針

- ゲーム進行・勝敗・タスク達成・アイテムの所在など、共有される状態はすべてサーバーを正とする。
- **クライアントは一切判定しない**。操作は要求として送るだけで、通るかどうかはサーバーが決め、結果を全員に配る。
- 同時に同じ操作が来た場合は、サーバーの処理上の**先着**で判定する。判定に負けた側には `object.interactRejected` を本人にだけ返すが、画面上は何も起きない(演出なし)。
- `mode`(シングル/マルチ)と `status`(待機/進行中など)は別フィールドにする。
- ファイルの内容は保持せず、ID・由来・編集済みか・所在だけを持つ。
- 残り時間は保存せず、`deadlineAt` とサーバー時刻(`serverTime`)から算出する。
- 位置と向きは他プレイヤーへ同期する。姿勢・IK・カメラ・パーティクルなどの見た目は権威状態に含めない。

## 2. 主な列挙値

| 名前 | 値 |
|---|---|
| `SessionMode` | `single` / `multiplayer` |
| `SessionStatus` | `waiting` / `playing` / `intermission` / `finished` |
| `PlayerKind` | `human` / `cpu` |
| `ConnectionStatus` | `connecting` / `connected` / `disconnected` |
| `LifeStatus` | `alive` / `eliminated` |
| `PhaseStatus` | `active` / `intermission` / `completed` |
| `TaskType` | `read_edit` / `write` / `web_search` / `image_generation` |
| `TaskStatus` | `pending` / `completed` |
| `ItemKind` | `file` / `lighter` |
| `FileStatus` | `unedited` / `edited`(ディレクトリの在庫から取り出したもの)/ `file_created` / `search_created` / `image_created`(新しく作ったもの。編集はしない) |
| `ObjectKind` | `directory` / `workspace` / `canvas` / `pc` / `lighter_stand`(※ directory・workspace 以外はフロント未実装。名前は暫定) |
| `ObjectScope` | `personal` / `shared` |
| `ObjectAvailability` | `available` / `unavailable` |
| `RejectReason` | `not_found` / `not_owner` / `unavailable` / `too_far` / `missing_item` |
| `Outcome` | `victory` / `defeat` |

## 3. 状態の2層構造

サーバーは「**内部の正となる状態**」と「**クライアントへ配る形**」を分ける。配る形は、送る直前に内部状態から組み立てる(投影)。

### 3.1 内部状態(サーバーの正。配信しない)

アイテム(ファイル・ライター)は所在に関係なく**ひとつの一覧**で持ち、それぞれが今どこにあるかを `location` で持つ。

```json
{
  "items": [
    { "itemId": "file-02", "kind": "file",    "file": { "status": "edited", "color": "#ffd60a" },
      "location": { "kind": "held_by", "playerId": "p1" } },
    { "itemId": "file-01", "kind": "file",    "file": { "status": "unedited", "color": "#e63946" },
      "location": { "kind": "directory", "objectId": "directory-1" } },
    { "itemId": "6f1c0d2e-…", "kind": "file", "file": { "status": "file_created" },
      "location": { "kind": "directory", "objectId": "directory-1" } },
    { "itemId": "lighter-1", "kind": "lighter",
      "location": { "kind": "object", "objectId": "lighter_stand-p2" } }
  ]
}
```

`location.kind`:

- `directory`: ディレクトリの中(`objectId`)
- `held_by`: プレイヤーが手に持っている(`playerId`)。1人1個まで
- `object`: その他のオブジェクト上の置き場(ライターの置き場など)

### 3.2 配る形(投影ルール)

| 配る形 | 内部状態からの組み立て |
|---|---|
| ディレクトリの `data.stock` | `kind=file`・`status` が `unedited` / `edited`・`location=directory(そのディレクトリ)` のファイル → `{id, color, status}` |
| ディレクトリの `data.outputs` | `kind=file`・`status` が作成系・`location=directory(そのディレクトリ)` のファイルの数 |
| `players[].heldItem` | `location=held_by(その人)` のアイテム → `Item{id, kind, data}`。ファイルの `data` は `{status, color?}`、ライターは `null` |

これにより、死亡・切断時の返却やフェーズのリセットは内部の `location` を書き換えるだけで済み、フロントは現在の `GameObject`・`Item` の型をそのまま使える。

## 4. スナップショット(配る形)の例

接続・再接続時に `snapshot` メッセージで送る。HTTP の `GET /api/v1/sessions/{sessionId}` でも同じものを返す。

```json
{
  "schemaVersion": 2,
  "sessionId": "sess-abc123",
  "mode": "multiplayer",
  "status": "playing",
  "createdAt": "2026-10-01T12:00:00Z",
  "serverTime": "2026-10-01T12:02:40Z",
  "seq": 42,
  "players": [
    {
      "playerId": "p1", "kind": "human", "seat": 1,
      "connection": "connected", "life": "alive",
      "heldItem": { "id": "file-02", "kind": "file", "data": { "status": "edited", "color": "#ffd60a" } },
      "transform": { "position": [1.25, 0.0, -2.5], "yaw": 1.57, "pitch": -0.35, "seq": 128 }
    },
    {
      "playerId": "p2", "kind": "human", "seat": 2,
      "connection": "connected", "life": "alive",
      "heldItem": null,
      "transform": { "position": [-1.0, 0.0, 2.0], "yaw": 3.14, "pitch": 0.0, "seq": 94 }
    },
    {
      "playerId": "p3", "kind": "human", "seat": 3,
      "connection": "disconnected", "life": "eliminated",
      "heldItem": null,
      "transform": { "position": [0.0, -12.0, 0.0], "yaw": 0.0, "pitch": 0.0, "seq": 207 }
    }
  ],
  "objects": [
    {
      "id": "directory-1", "kind": "directory", "scope": "shared",
      "position": [0, 0, 0], "users": [], "availability": "available",
      "data": {
        "stock": [
          { "id": "file-01", "color": "#e63946", "status": "unedited" },
          { "id": "file-03", "color": "#2a9d5c", "status": "unedited" }
        ],
        "outputs": 1
      }
    },
    {
      "id": "lighter_stand-p2", "kind": "lighter_stand", "scope": "personal", "owner": "p2",
      "position": [-3, 1, 4], "users": [], "availability": "unavailable", "data": null
    }
  ],
  "game": {
    "phase": {
      "number": 2,
      "status": "active",
      "startedAt": "2026-10-01T12:02:00Z",
      "deadlineAt": "2026-10-01T12:04:00Z",
      "tasks": [
        { "taskId": "task-201", "type": "read_edit", "assigneePlayerId": "p1", "targetFileId": "file-02",
          "status": "pending", "completedAt": null },
        { "taskId": "task-202", "type": "write", "assigneePlayerId": "p1", "targetFileId": null,
          "status": "completed", "completedAt": "2026-10-01T12:02:34Z" },
        { "taskId": "task-203", "type": "web_search", "assigneePlayerId": "p2", "targetFileId": null,
          "status": "pending", "completedAt": null },
        { "taskId": "task-204", "type": "image_generation", "assigneePlayerId": "p2", "targetFileId": null,
          "status": "pending", "completedAt": null }
      ]
    },
    "team": { "bypassPermission": false, "fireStarted": false },
    "result": null
  }
}
```

個人のノルマ数は `assigneePlayerId` が一致するタスク数から算出できるので、別のカウンターは持たない。

## 5. ゲームルール

### 5.1 タスクの完了条件(サーバーが検証する)

| `type` | 完了条件 |
|---|---|
| `read_edit` | 担当者が、`targetFileId` の在庫ファイルを **編集済み(`status=edited`)で** ディレクトリに入れた |
| `write` / `web_search` / `image_generation` | 担当者が、対応する作成系の新しいファイル(`file_created` / `search_created` / `image_created`)をディレクトリに入れた |

- 完了時刻はクライアントの送信時刻ではなく、**サーバーが受け付けた時刻**(`serverAcceptedAt`)とする。
- `serverAcceptedAt < deadlineAt` なら締切内、`>=` なら締切後。締切処理と完了処理はセッションごとに単一の順序で処理する。
- 同じファイルの達成は1回だけ数える(取り出して入れ直しても増えない)。
- 検索(PC)・画像生成(キャンバス)で新しいファイルが作られる操作の要求の形は未確定(§9)。

### 5.2 フェーズ進行

1. フェーズ開始時に、そのフェーズのタスクリストを作り、各生存プレイヤーへ分配する。
1. 生存プレイヤー全員が担当タスクを完了したら、締切前でも `intermission` に進む。
1. 誰かに未完了タスクが残っていれば、締切までフェーズを続ける。
1. 締切時点で未達のプレイヤーは脱落する。未完了タスクは持ち越さない。
1. 生存者がいなければ敗北。次フェーズがあれば、脱落者分の負荷を生存者に再分配して開始する。
1. フェーズ間はサーバーが `intermission` 状態を管理し、クライアントはその間に演出する。
1. フェーズごとにアイテムを初期状態にリセットする(ディレクトリの在庫を初期化し、成果物・手持ちは消す)。

### 5.3 インタラクト(例: ディレクトリからファイルを取る)

1. プレイヤーAがディレクトリの在庫のファイルAを選ぶ → `interact { objectId, heldItem: null, target: "file-A" }` を送る。
1. サーバーが検証する(存在する・在庫にある・手ぶら・生存中など)。
1. 通れば、内部でファイルAの `location` を `held_by(A)` にし、全員に `object.upsert`(在庫からAが消えたディレクトリ)と `player.updated`(Aの `heldItem`)を配る。
1. Bが同時にファイルAを取ろうとしても、サーバーの処理上の先着で決まる。負けたBには `object.interactRejected { reason: "not_found" }` を返すだけ。

手持ちでのインタラクトでは、要求の `heldItem` は識別用の主張にすぎず、サーバーは自分が持つ実際の手持ちで判定する。

### 5.4 ワークスペース(編集・新規作成)

ワークスペースは各プレイヤーの区画にある personal のオブジェクト。アクションは共通で 2 秒(`WORKSPACE_ACTION_MS`)かかり、結果はその後に反映する。

- `unedited` のファイルを持って `interact` → 2 秒後に、手持ちのファイルが `edited` になる
- 手ぶらで `interact` → 2 秒後に、新しいファイル(`file_created`)を手に持つ。id はサーバーが UUID で採番する
- `edited`・作成系・ファイル以外を持っていると `missing_item`、作業中は `unavailable` で拒否する
- 作業中はそのプレイヤーを `users` に入れ、終わったら外す(フロントは `users` から外れたら移動とカメラのロックを解く)
- 作業中にワークスペースが消えたら、結果は適用しない

### 5.5 切断・死亡

- 手持ちのファイルはディレクトリに戻し、ライターは元の置き場に戻す。
- 切断中も `life` は維持する(締切で未達なら脱落する)。再接続すれば同じプレイヤーとして復帰する。

## 6. HTTP API(概要)

詳細は openapi.yaml を参照。プレイヤーの識別は、サーバーが発行する匿名 ID を **HttpOnly Cookie** に入れて行う。ブラウザから見てフロントとバックエンドが同じオリジン(少なくとも同じサイト)であることを前提にする。開発時は Vite の proxy で揃え、本番の構成はデプロイ先が決まってから決める([ADR-0003](../adr/ADR-0003-backend-state-and-communication.md))。

| メソッド | パス | 用途 |
|---|---|---|
| `GET` | `/healthz` | ヘルスチェック |
| `POST` | `/api/v1/players` | 匿名プレイヤーを作り Cookie を発行する(既にあれば今のものを返す) |
| `GET` | `/api/v1/players/me` | 自分の ID と、参加中のセッション |
| `POST` | `/api/v1/matchmaking` | 自動マッチングの待機列に入る |
| `GET` | `/api/v1/matchmaking` | 自分のマッチング状況(`queued` / `matched` + `sessionId`) |
| `DELETE` | `/api/v1/matchmaking` | 待機をやめる |
| `POST` | `/api/v1/sessions` | シングルモードのセッションを作る |
| `GET` | `/api/v1/sessions/{sessionId}` | スナップショット(参加者のみ) |
| `GET` | `/api/v1/sessions/{sessionId}/ws` | WebSocket に切り替える |

マッチングの結果はまず HTTP のポーリングで受け取る。待ち時間の体感が悪ければ、後で WebSocket での通知に変える。

## 7. WebSocket メッセージ

すべて JSON で、`type` で種類を見分ける。型の定義は openapi.yaml の `components/schemas`(`ClientMessage` / `ServerMessage`)にある。

### 7.1 クライアント → サーバー

| `type` | タイミング | 中身 |
|---|---|---|
| `transform` | 20Hz(止まっている間は送らなくてよい) | `seq`, `position`, `yaw`, `pitch` |
| `interact` | 操作したとき | `objectId`, `heldItem`, `target?` |

送信者はサーバーが接続(Cookie)から決める。フロントの `InteractRequest.by` は送らない。

### 7.2 サーバー → クライアント

| `type` | 対象 | 中身 |
|---|---|---|
| `snapshot` | 接続した本人 | セッション全体(§4) |
| `transforms` | 全員・20Hz | 全プレイヤーの最新 `transform` |
| `session.started` / `session.finished` | 全員 | 開始時刻 / 結果 |
| `phase.started` | 全員 | フェーズ(タスク一覧、締切)と `serverTime` |
| `phase.ended` | 全員 | 脱落者の ID と、次の状態(`intermission` / `completed`) |
| `task.completed` | 全員 | `taskId`, `completedAt` |
| `object.upsert` / `object.remove` | 全員 | フロントの `ObjectMessage` と同じ中身 |
| `object.interactRejected` | 要求した本人 | `objectId`, `reason` |
| `player.updated` | 全員 | 接続状態・生死・手持ち(`transform` を除くプレイヤー情報) |
| `team.updated` | 全員 | 勝利条件のフラグ(`bypassPermission`, `fireStarted`) |
| `effect` | 全員 | 落下・炎上・コンフリクトなどの一時的な演出。再接続時に再生しない |
| `error` | 本人 | 不正なメッセージなど |

### 7.3 順序と再接続

- 確定状態を変えるメッセージ(`transforms`・`effect`・`object.interactRejected`・`error` 以外)は、セッション内で単調に増える `seq` を持つ。
- 再接続時は最新の `snapshot`(`seq` を含む)を送り、それより古い `seq` のメッセージは捨てる。過去分は再送しない。
- 手持ちは `player.updated` の `heldItem` で配る。フロントは自分の `heldItem` の変化を、今の `ItemManager` の `spawn` / `delete` に変換して反映する。

## 8. プレイヤーの座標・向き

- `position` は**足元**のワールド座標 `[x, y, z]`(Y-up)。
- `yaw` / `pitch` はラジアン。`yaw = 0` で -Z を向き、`pitch` は上向きが正(フロントの `Look` と同じ規約)。
- `transform.seq` はそのプレイヤーの更新ごとに増やし、古い更新で巻き戻らないようにする(サーバーは `seq` が増えない更新を捨てる)。
- 送信の目安は 20Hz。描画側で補間する。
- 報告された座標は見た目の同期用として扱い、`life` の判定には使わない。落下による脱落はサーバーのルールで確定する。
- MediaPipe などの骨格の姿勢、IK、アニメーションの状態は含めない。

## 9. 未確定の項目

- `Bypass Permission` を有効にする正確な条件(チーム共有であることは決定済み)と、`fireStarted`(ライターで火をつける)の条件・効果
- PC・キャンバスの操作の要求の形(検索・画像生成)
- フェーズ間の `intermission` の長さ、フェーズ数、勝利条件
- 生存者へのタスク再分配のルール(均等配分、端数の扱い、種別の制約)
- シングルモードでの CPU の参加・行動ルール
- 自動マッチングで3人そろわないときの扱い(タイムアウト、CPU で補うか)
- ボイスチャットの実装方式(ゲーム状態のスキーマには含めない)
- `ObjectKind` の正式な名前(directory 以外)
