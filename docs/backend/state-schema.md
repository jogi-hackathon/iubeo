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
| `FileStatus` | `unedited` / `edited`(ディレクトリの在庫から取り出したもの。`edited` は持っている間だけで、ディレクトリに戻すと `unedited` に戻る)/ `file_created` / `search_created` / `image_created`(新しく作ったもの。編集はしない) |
| `ObjectKind` | `directory` / `workspace` / `canvas` / `pc` / `lighter_stand`(※ pc はサーバーが未実装で、canvas・pc の名前は暫定。lighter_stand はライターの置き場で、名前は変えない) |
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
    { "itemId": "lighter-2", "kind": "lighter",
      "location": { "kind": "object", "objectId": "lighter_stand-2" } }
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
| ディレクトリの `data.stock` | `kind=file`・`status` が `unedited` / `edited`・`location=directory(そのディレクトリ)` のファイル → `{id, color, status}`(戻すと編集前に戻るので、今は `status` が `edited` のものは並ばない。型は変えていない) |
| ディレクトリの `data.outputs` | `kind=file`・`status` が作成系・`location=directory(そのディレクトリ)` のファイルの数 |
| `players[].heldItem` | `location=held_by(その人)` のアイテム → `Item{id, kind, data}`。ファイルの `data` は `{status, color?}`、ライターは `null` |
| ライターの置き場の `data.hasLighter` | `kind=lighter`・`location=object(その置き場)` のアイテムがあるか |

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
      "users": [], "availability": "available",
      "data": {
        "stock": [
          { "id": "file-01", "color": "#e63946", "status": "unedited" },
          { "id": "file-03", "color": "#2a9d5c", "status": "unedited" }
        ],
        "outputs": 1
      }
    },
    {
      "id": "lighter_stand-2", "kind": "lighter_stand", "scope": "personal", "owner": "p2",
      "users": [], "availability": "unavailable", "data": { "hasLighter": true }
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
| `write` / `web_search` / `image_generation` | 担当者が、対応する作成系の新しいファイル(`file_created` / `search_created` / `image_created`)をディレクトリに入れた。`file_created` はワークスペース(§5.4)、`image_created` はキャンバス(§5.4.1)で作る |

- 完了時刻はクライアントの送信時刻ではなく、**サーバーが受け付けた時刻**(`serverAcceptedAt`)とする。
- `serverAcceptedAt < deadlineAt` なら締切内、`>=` なら締切後。締切処理と完了処理はセッションごとに単一の順序で処理する。サーバーは時刻を持つ入力を処理する前に締切を確かめるので、締切を過ぎてから届いた `interact` は、Tick より先に届いても締切の処理の後で扱う(その時点では `intermission` なので `unavailable` で拒否される)。
- 1回入れて達成になるタスクは1つだけ。編集済みのファイルはディレクトリに入れると `unedited` に戻るので(§5.2.1)、取り出して入れ直しても増えない。同じファイルでも、別のプレイヤーが取り出して編集し直し、入れれば、その人のタスクの達成になる。作ったファイルは成果物になって取り出せないので、2回数えることはない。
- 達成になるのは、担当者が自分で `interact` で入れたときだけ。切断で手持ちのファイルがディレクトリに入った場合(§5.6)は、在庫・成果物にはなるが、誰のタスクの達成にも数えない(「作ってすぐ切断すれば達成」という抜け道を作らないため。回線が不安定な人に優しくはないが、達成はサーバーが確かめた本人の操作だけにする)。
- 検索(PC)で新しいファイルが作られる操作の要求の形は未確定(§9)。

### 5.2 フェーズ進行

1. 人間のプレイヤー全員が接続して `playing` になったら、`session.started` に続けて第1フェーズを始める(`phase.started`。`serverTime` 付き)。
1. フェーズ開始時に、そのフェーズのタスクリストを作り、各生存プレイヤーへ分配する(→ §5.2.1)。
1. 生存プレイヤー全員が担当タスクを完了したら、締切前でも `intermission` に進む。
1. 誰かに未完了タスクが残っていれば、締切までフェーズを続ける。
1. 締切時点で未達のプレイヤーは脱落する(`eliminated` にした `player.updated` と同時に、落下の `effect`(`fall`)を送る。手持ちはディレクトリに戻す)。未完了タスクは持ち越さない。
1. フェーズが終わったら、作業中のワークスペース・キャンバスのアクションはすべて取りやめ、`phase.ended`(`eliminatedPlayerIds`、`next`)を送る。
1. 生存者がいなければ敗北。次フェーズがあれば、脱落者分の負荷を生存者に再分配して開始する。
1. フェーズ間はサーバーが `intermission` 状態を管理し、クライアントはその間に演出する。
1. フェーズごとにアイテムを初期状態にリセットする(ディレクトリの在庫を初期化し、成果物・手持ちは消す)。次のフェーズの開始時に、`phase.started` の前にディレクトリの `object.upsert` と、手持ちが消えた人の `player.updated` を送る。
1. 決着:
   - 途中で全員脱落したら、その締切で `defeat`。
   - 最後のフェーズを生存者 1 人以上で終えたら(締切、または全員の完了)、`phase.ended`(`next: completed`)に続けて `team.bypassPermission` を立て(`team.updated`)、生存者のライターの置き場を `available` にする。セッションは `playing` のまま(フェーズは `completed`)で、まだ決着しない。
   - ライターで火をつけたら(§5.5)、`IUBEO_FIRE_DURATION` の後に `victory`。誰も火をつけないまま `IUBEO_BYPASS_DURATION` たっても、時間切れで `victory`(火はつかないまま)。
   - 決着したら `session.finished`(`result`)を送り、送信キューに残ったメッセージを送ってから接続を切ってセッションを破棄する(close のコード 4000、reason `finished`)。

決着をこの形にした理由:

- 生き残り + ライター: IDEA.md の「一定フェーズを超えると実質クリア」と、フロント担当の「勝利条件を満たしたらライターが使える(燃やすのは演出)」を両立させるため。`team` のフラグ(`bypassPermission` / `fireStarted`)はスキーマに既にあり、そのまま使える。
- 演出の時間を待ってから決着: 決着と同時にセッションを破棄すると、接続が切れて燃える演出が途中で終わるため。
- 時間切れでも `victory`: 最後のフェーズを生き残った時点で勝利条件は満たしており、ライターは締めくくりの演出であるため。時間切れを設けないと、接続したまま放置されたセッションが残り続ける。時間切れで `defeat` にする案は、生き残ったのに負けになるので採らなかった。
- 1 人でも生き残れば勝ち: 脱落者が出ても残りで乗り切る、という遊びを残すため(全員が生き残らないと負け、にすると再分配の意味がなくなる)。

フェーズの数と長さは環境変数で変えられる。

| 環境変数 | 既定 | 意味 |
|---|---|---|
| `IUBEO_PHASE_COUNT` | `3` | フェーズの数 |
| `IUBEO_PHASE_DURATION` | `30s` | フェーズの長さ(開始から締切まで) |
| `IUBEO_INTERMISSION_DURATION` | `10s` | フェーズの間(`intermission`)の長さ。フェーズが終わった時刻(締切、または全員が完了した時刻)から数える |
| `IUBEO_BYPASS_DURATION` | `30s` | 最後のフェーズを生き残って `bypassPermission` を立ててから、火がつかなくても `victory` にするまで |
| `IUBEO_FIRE_DURATION` | `10s` | 火をつけてから `victory` にするまで(燃える演出の時間) |

数値はすべて仮で、遊んでみて調整する。まず短い数値で流れを確かめるため、1 ゲームが数分で終わる値にしている。今の値だと、第3フェーズで生存者が 1 人のとき 30 秒で 9 件になり、ほぼ達成できない。

#### 5.2.1 タスクの分配

- 第 n フェーズの全体の件数は **n × セッション開始時の人数**。
- 生存者で均等に割り、端数は乱数で選んだ生存者に 1 件ずつ足す。脱落者が出たら、全体の件数はそのままで生存者に再分配する(例: 3 人で始めて 1 人脱落 → 第3フェーズは 9 件を 4・5 件に分ける)。
- 種類は `read_edit` / `write` / `image_generation` の 3 つから均等に乱数で選ぶ。PC がまだ無いので、`web_search` は出さない。
- `read_edit` の `targetFileId` は在庫のファイルから乱数で選ぶ。**別のプレイヤーとは重なってよい**。同じファイルが要る人どうしで取り合いになり、「今それ編集しようとしてたのに」というコンフリクトを起こすため。同じプレイヤーの中では重複させず、自分の分で在庫を使い切ってから `read_edit` を引いたら、`write` と `image_generation` から乱数で選び直す(3 種類の割合をなるべく崩さないため)。在庫はフェーズごとに初期状態に戻る。
- 同じファイルを何人もが編集できるように、編集済み(`edited`)は持っている間だけの状態にする。ディレクトリに入れたら(達成の判定の後で)`unedited` に戻し、次の人がまた取り出して編集できる。達成にならないまま入れた場合も、切断で戻った場合も同じく `unedited` に戻る(編集は無駄になる)。
- タスクの id は `task-{フェーズ番号}-{連番}`。乱数はセッションごとの種から作り、状態に持って進める(規則の関数を純粋に保つため)。

フェーズ番号に比例させるのは、フェーズを追うごとに忙しくするため(毎フェーズ同じ件数だと難しくならない)。脱落者の分を生存者に再分配するのは、IDEA.md の「脱落者の負荷を生存者に再分配する」に沿い、脱落がチームへの圧力になるようにするため。

### 5.3 インタラクト(例: ディレクトリからファイルを取る)

1. プレイヤーAがディレクトリの在庫のファイルAを選ぶ → `interact { objectId, heldItem: null, target: "file-A" }` を送る。
1. サーバーが検証する(存在する・在庫にある・手ぶら・生存中など)。
1. 通れば、内部でファイルAの `location` を `held_by(A)` にし、全員に `object.upsert`(在庫からAが消えたディレクトリ)と `player.updated`(Aの `heldItem`)を配る。
1. Bが同時にファイルAを取ろうとしても、サーバーの処理上の先着で決まる。負けたBには `object.interactRejected { reason: "not_found" }` を返すだけ。

手持ちでのインタラクトでは、要求の `heldItem` は識別用の主張にすぎず、サーバーは自分が持つ実際の手持ちで判定する。

### 5.4 ワークスペース(編集・新規作成)

ワークスペースは各プレイヤーの区画にある personal のオブジェクト。アクションは共通で 2 秒(`WORKSPACE_ACTION_MS`)かかり、結果はその後に反映する。

- `unedited` のファイルを持って `interact` → 2 秒後に、手持ちのファイルが `edited` になる(ディレクトリに戻すと `unedited` に戻る。§5.2.1)
- 手ぶらで `interact` → 2 秒後に、新しいファイル(`file_created`)を手に持つ。id はサーバーが UUID で採番する
- `edited`・作成系・ファイル以外を持っていると `missing_item`、作業中は `unavailable` で拒否する
- 作業中はそのプレイヤーを `users` に入れ、終わったら外す(フロントは `users` から外れたら移動とカメラのロックを解く)
- 作業中にワークスペースが消えたら、結果は適用しない
- 作業中に手持ちが条件を外れたら(編集中のファイルを手放した、新規作成中に何かを持ったなど)、結果は適用せず `users` から外すだけ。切断・脱落したときも作業は取りやめ、結果は出さない

#### 5.4.1 キャンバス(画像生成)

キャンバスは各プレイヤーの区画にある personal のオブジェクト(`canvas-{席}`)。ワークスペースの新規作成とほぼ同じ形で、プレイヤーは描かずに待つだけ。アクションは 2 秒(`CANVAS_ACTION_MS`)かかり、結果はその後に反映する。

- 手ぶらで `interact` → 2 秒後に、新しいファイル(`image_created`。色なし)を手に持つ。id はサーバーが UUID で採番する
- 何かを持っていると `missing_item`(新しいファイルを手に持つので、手が空いている必要がある)、作業中は `unavailable` で拒否する。他人のキャンバスは `not_owner`(共通の検証)
- 作業中はそのプレイヤーを `users` に入れ、終わったら外す
- 作業中に手が塞がった・切断した・キャンバスが消えた場合は、結果は適用しない(ワークスペースと同じ)
- 作ったファイルをディレクトリに入れると成果物になり、担当者の `image_generation` の達成になる(§5.1)。手持ちの `FileItemData` は他のファイルと同じ形で、画像用の情報は持たない

### 5.5 ライター

- ライターは 1 人 1 つ(`lighter-{席}`)。自分の区画のワークスペース(机)の天板の上に置いた personal の置き場 `lighter_stand-{席}` に、ずっと置かれている。
- 内部状態では `items[]` のアイテム(`kind: lighter`)。置き場にあるときは `location: object(置き場)`、持っている間は `held_by`。
- 置き場は `bypassPermission` が立つまで `availability: unavailable`。立ったら生存者の置き場だけ `available` にする。
- 置き場への `interact`: 手ぶらなら持つ、ライターを持っていれば戻す。ファイルを持っていると `missing_item`(手は 1 つ)。
- ライターを持ってディレクトリに `interact` → `team.fireStarted` を立て(`team.updated`)、`effect`(`fire`。`playerId` と `objectId`)を全員に送る。燃やすのは演出なので、ファイルは消さない。火は最初の 1 人がつけた時点で始まり、2 人目からは `unavailable`。
- ライターを持ってディレクトリ以外(ワークスペースなど)に `interact` すると `missing_item`。

置き場を別のオブジェクトにしたのは、狙う対象が分かれ、フロントのアウトラインや使用可否(`availability`)の仕組みをそのまま使えるため。ワークスペースへの `interact` に `target: "lighter"` を付けて区別する案は、フロントが机のどこを狙ったかで `target` を切り替える必要があるので採らなかった(手ぶらでワークスペースに触れるのは「新規作成」のまま)。`lighter_stand` は v0.2 で暫定の名前として定義済みだったが、「置き場」であることが名前から分かるので変えない。

### 5.6 切断・死亡

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

- マッチングが成立すると、セッションは `waiting` で作られる。人間のプレイヤー全員が WebSocket で接続したら自動で `playing` にし、`session.started` を送って第1フェーズを始める。30 秒たってもそろわなければセッションを解散する。フロントはシーンの読み込みを済ませてから接続する。
- 1セッションの人数は環境変数 `IUBEO_MATCH_SIZE` で変えられる(既定 3)。開発中は 1 にすれば1人で試せる。2人以上で試すときは、別のブラウザかシークレットウィンドウで Cookie を分ける。
- **オブジェクトの位置とプレイヤーの初期位置はサーバーが持たない**。サーバーはオブジェクトの状態(`availability`・`users`・`data`)だけを持って配り、配置はフロントが決める。サーバーが配置を持つと、フロントのレイアウトがサーバーの定数に縛られるため。判定は位置を使わないので(§8)、ルールには影響しない。
- ディレクトリの初期在庫(6色)はサーバーの定数(`backend/internal/session/layout.go`)。

オブジェクトの id と数はフロントとの約束として固定する。フロントは id(personal なら `owner` の席)から置き場所を決める。

| id | kind | scope | 数 |
|---|---|---|---|
| `directory-1` | `directory` | shared | 1 |
| `workspace-{席}` | `workspace` | personal | 席ごと(1〜3) |
| `canvas-{席}` | `canvas` | personal | 席ごと(1〜3) |
| `lighter_stand-{席}` | `lighter_stand` | personal | 席ごと(1〜3) |

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
| `transforms` | 全員・最大 20Hz | 前回の配信から動いた(`transform.seq` が増えた)プレイヤーの `transform` だけ。誰も動いていなければ送らない |
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

### 7.4 接続の管理

- 同じプレイヤーが2つ目の接続を開いたら、古い接続を切る。
- 送信キューがあふれたら、`transforms` は古いものを捨てて最新だけを送り、確定状態のメッセージがあふれたら切断する(再接続すれば `snapshot` で復旧する)。
- 接続時は Origin ヘッダーを検証する。
- 終了したセッションは結果を送ってから破棄する。人間が全員切断したセッションは、一定時間(例: 60 秒)誰も戻らなければ破棄する。個人の切断には期限を設けない。
- WebSocket の ping で死活を確認する(間隔は実装時に決める)。

## 8. プレイヤーの座標・向き

- `position` は**足元**のワールド座標 `[x, y, z]`(Y-up)。
- 初期位置はサーバーが持たない。フロントが `seat` から決める。サーバーは最初の `transform` を受け取るまで、そのプレイヤーの `transform` を `null` で配る(snapshot)。
- `yaw` / `pitch` はラジアン。`yaw = 0` で -Z を向き、`pitch` は上向きが正(フロントの `Look` と同じ規約)。
- `transform.seq` はそのプレイヤーの更新ごとに増やし、古い更新で巻き戻らないようにする(サーバーは `seq` が増えない更新を捨てる)。
- 送信の目安は 20Hz。描画側で補間する。
- 報告された座標は見た目の同期用として扱い、`life` の判定には使わない。
- 床・壁・区画の境界との当たり判定は、MVP ではクライアントのコライダーに任せる。サーバーは地形を持たず、距離の判定(`too_far`)もしない。
- 落下は脱落の演出。サーバーは落下の `effect` を送るのと同時に、そのプレイヤーを `eliminated` にする。
- MediaPipe などの骨格の姿勢、IK、アニメーションの状態は含めない。

## 9. 未確定の項目

- PC の操作の要求の形(検索)。検索の体験と完了の確かめ方が決まっていないので保留(キャンバスは §5.4.1 で決めた)
- シングルモードでの CPU の参加・行動ルール
- 自動マッチングで人数がそろわないときの扱い。**デバッグ用の暫定として、待機列に `IUBEO_CPU_FILL_AFTER`(既定 30s)たつと足りない分を CPU で埋める**ものを入れた。
  - CPU は `kind: "cpu"` のプレイヤーで、接続しない(`connection` は `connected` で作る)。開始と解散の判定は人間だけを見る(`§5.2` の「人間のプレイヤー全員」のまま)
  - CPU はフェーズごとの自分のノルマを自動でこなす(`read_edit` の対象を誰かが持っている間は待つ)。ライターは使わない
  - 位置は配らない(§6 のまま)。見た目はフロントが席のスポーン地点の周りで動かす
  - `IUBEO_CPU_FILL_AFTER=0` で無効。CPU の人数は `IUBEO_MATCH_SIZE` までの不足分
- ボイスチャットの実装方式(ゲーム状態のスキーマには含めない)
- `ObjectKind` の正式な名前(canvas・pc)
