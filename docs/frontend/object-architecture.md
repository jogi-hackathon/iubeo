# フロントエンドのオブジェクト設計

フロントエンドで、オブジェクト(ディレクトリ・ワークスペースなど)の状態がどこから来て、誰が置き、どう描くかの方針をまとめる。
サーバーとの通信の形は [state-schema.md](../backend/state-schema.md) を正とし、この文書はクライアント側の責務を扱う。

> **状態: 実装済み(A〜E)。** 残りは §8・§9。

## 1. 用語

| 用語 | 意味 |
|---|---|
| オブジェクト | サーバーの状態にある、置かれた物(`GameObject`)。持ち歩くアイテム(ファイル・ライター)とは別 |
| 種類(`kind`) | オブジェクトの種類。`directory` / `workspace` / `canvas` / `pc` など |
| `scope` / `owner` / `seat` | オブジェクトが個人の物(`personal`)か共有(`shared`)か / 個人の物の持ち主 / プレイヤーの席番号。state-schema の値 |
| id の約束 | サーバーが付けるオブジェクトの id の決まり(`directory-1` / `workspace-{席}` / `canvas-{席}` / `lighter_stand-{席}`)。state-schema §6 |
| プロップ | イス・壁・窓など、シーンが自分で置く飾り。オブジェクトではなく、状態を持たない |
| オーソリティ(authority) | オブジェクトの状態を持ち、ルールを決める相手。状態を配り、インタラクトの要求を受けて結果を決める。`LocalAuthority` か `ServerAuthority`(→ §2) |
| `LocalAuthority` | フロントに埋め込んだ、ブラウザの中の簡易サーバー |
| `ServerAuthority` | 本物のサーバー(Go)のセッションにつなぐオーソリティ。sandbox でセッションに入っているときに置く |
| `ObjectManager` | 今いるシーンのオブジェクトの状態を持つ入れ物。オーソリティから届いたメッセージを反映するだけで、自分では判定しない。手持ちのアイテムは `ItemManager` が持つ |
| スナップショット | サーバーが接続直後に送る、セッションの状態の全体(state-schema §4) |
| レイアウト | シーンの `layout.ts` に書く、オブジェクトをどこに、どう置くかの定義(→ §5) |
| レイアウトの項目 | レイアウトの中の、オブジェクト 1 つ分の定義。項目名・id・位置・向き・見た目の選び方を持つ |
| ゲームの流れ | シーンの外で進む手順(プレイヤー ID の発行、マッチング、シーンの移動、セッションの終わり)。`flow/`(→ §4) |
| 準備完了(readiness) | シーンが描かれてよい状態になったこと。`authority`(オーソリティが物を置き終えた、または最初の snapshot を受け取った)か `mount`(マウントされた)かを、シーンごとに表で決める(→ §4) |
| 白いオーバーレイ | シーンを切り替える間と起動の間、画面を白で覆う幕。中央に細い進捗バーを出す(→ §4) |
| ベイク AO | 事前に焼いておく、建物の陰影の画像(`public/ao/`)。置いた物の数・位置が焼いたときと違うとずれる |
| 俯瞰ビュー | 手ぶらでディレクトリにインタラクトしたとき開く、ファイルを選ぶ画面 |
| フック | React のフック(`useXxx`)。コンポーネントの中で振る舞いを宣言する部品 |

## 2. シーンとオーソリティ

| シーン | オーソリティ | 用途 |
|---|---|---|
| room | `LocalAuthority` | チュートリアル。完全にローカルで、サーバーを使わない |
| test | `LocalAuthority` | 開発用。見た目・インタラクトの確認 |
| sandbox | `ServerAuthority`(マルチ) | ゲーム本体。セッションに入っていないとき(デバッグでの直接移動・AO のベイク)は、オーソリティを置かず建物だけを出す |

- シーンが決まればオーソリティも決まり、シーンの中で切り替わらない(ローカルとオンラインを行き来する退避・復元はしない)。sandbox は、マウントのときのセッションの有無で決める。
- オーソリティは、シーンの中に置くコンポーネントにする。マウントでつなぎ、アンマウントで片付ける。
- 開発用のマルチ専用シーン(`multiplayer`)は無くした。実サーバーとのつなぎ込みは、ゲームの流れ(→ §4)で sandbox に入って確かめる。

```tsx
// room(RoomScene)。initial は、シーンが決める初期設定(項目名ごと。在庫など)
<LocalAuthority scene="room" layout={ROOM_LAYOUT} initial={ROOM_INITIAL} />
<ManagedObjects layout={ROOM_LAYOUT} />

// sandbox(SandboxScene)。session は、マウントのときの gameFlow.currentSession()
{session && (
  <>
    <ServerAuthority
      scene="sandbox"
      sessionId={session.sessionId}
      playerId={session.playerId}
      spawnOf={sandboxSpawnOf}
      onReady={gameFlow.sessionReady}
      onClosed={gameFlow.sessionClosed}
    />
    <ManagedObjects layout={SANDBOX_LAYOUT} ao="realtime" />
    <RemotePlayers />
  </>
)}
```

## 3. オーソリティの共通の形

`LocalAuthority` と `ServerAuthority` は、`ObjectManager`・`ItemManager` から見て同じ形にする。

- **受け取る**: サーバーと同じ内容のメッセージ(`object.upsert` / `object.remove` / `object.interactRejected` と、手持ちのアイテムが載る `player.updated`)。`ObjectManager`・`ItemManager` の型への変換はオーソリティの中で行う。
- **送る**: サーバーと同じ要求(`interact`)。

`ObjectManager`・オブジェクトのコンポーネント・`Interaction` は、相手がローカルかサーバーかを知らない。

### 3.1 ゲームのルール

- interact の結果(ファイルを取る、机で編集する、など)を決めるのはオーソリティだけ。クライアントのコンポーネントは判定しない。
- `ServerAuthority` のルールはサーバー(Go)が正。
- `LocalAuthority` のルールはチュートリアル用の簡略版で、サーバーの動作を正確に再現しなくてよい。揃えるのはやり取りの形だけ。

### 3.2 自分の ID

「自分のプレイヤー ID」は、今のオーソリティが 1 つだけ持つ(`authorityRegistry.current().playerId`)。`ObjectManager`・操作のロック・「自分の物か」の判定・`playerManager`(自分の位置を持たない)・`RemotePlayers`(`useMyPlayerId()`)は、すべてこれを読む。`playerManager` に自分の ID を持たせない。

- `ServerAuthority`: サーバーが発行した ID(`POST /api/v1/players`。ゲームの流れが受け取り、シーンに渡す)。
- `LocalAuthority`: 固定の `"local-player"`(`LOCAL_AUTHORITY_PLAYER_ID`)。room・test は完全にローカルで、発行された ID は使わない(発行された ID を使うのは `ServerAuthority` だけ)。

## 4. ゲームの流れとシーンの切り替え

```
room(LocalAuthority)にいる
  → startMatchmaking(今は開発用パネルのボタンだけがきっかけ)
  → プレイヤー ID を発行(Cookie)。参加中のセッションがあれば、待機を飛ばして成立
  → マッチングの待機を要求(room にいたまま待つ。1 秒ごとに状況を見る)
  → マッチング成立(sessionId が決まる)
  → 白いオーバーレイで覆う → sandbox に切り替える
  → ServerAuthority が sessionId につなぎ、最初のスナップショットを受け取って自分を置く(= 準備完了)
  → オーバーレイを外す
```

ゲームの流れ(`flow/gameFlow.ts`)は、シーンもオーソリティも知らない純粋な状態機械で、状態は `idle` → `issuing` → `queued` → `matched` → `entering` → `inSession`(失敗は `error`)。HTTP・シーンの移動・待ちは引数で受け取る。

- マッチングはゲームの流れの仕事で、シーンやオーソリティの仕事ではない。きっかけは今は開発用パネル(`dev/GameFlowPanel.tsx`)のボタンだけで、`gameFlow.startMatchmaking()` を 1 回呼ぶ。将来、チュートリアルの終わりから同じ関数を呼ぶ。
- 待機中の扱い(サーバー側の事実に合わせる):
  - サーバーは 10 秒見ないと待機列から外すので、1 秒ごとに GET する。GET が 404(`not_queued`)なら入り直す。
  - 入るとき 409(`in_session`)なら、既にセッションに居る。`GET /players/me` の `sessionId` で成立として進む。
  - 取り消し(DELETE)が 409 なら、既に成立している。そのまま成立として進む。取り消した後は、ポーリングの応答を捨てる。
  - 列に入る要求(POST)が返る前に取り消したら、返ってきた時点で待機列を抜ける(サーバーには入ってしまっているため)。
  - 成立したときに既に sandbox にいたら(待機中にデバッグパネルで移っていた)、移れないので error にする。room から start し直せば、参加中のセッションに戻れる。
- シーンの移動(`navigator.enter`)は `scenes/sceneStore.ts` が結ぶ(`flow/` はシーンを import しない)。`goTo` は遷移中と起動の覆いの間は黙って無視するので、`enter` はそれらが終わるまで待ってから呼ぶ。
- どのシーンへの切り替えも、新しいシーンの準備完了まで白いオーバーレイで覆う。`LocalAuthority` は置き終わった時点、`ServerAuthority` は最初の snapshot を受け取って自分を置いた時点で準備完了。
  - 準備完了の条件は、シーンごとに表(`scenes/readiness.ts`)で型として決める(`authority` / `mount`。書き忘れるとコンパイルが通らない)。sandbox は、セッションがあれば `authority`、無ければ `mount`(建物だけで、マウントで足りる)。`mount` のシーンにだけ `ReportSceneReady` を置く(`App` と bake)。
  - `ServerAuthority` は、最初の snapshot の前に接続が終わっても、先に準備完了を報告する(覆いが外れなくなるのを避ける)。
- 覆いは `opacity: 0.995`(完全な不透明にしない)。不透明な間はブラウザが下の Canvas を合成せず、外し始めた瞬間に重い合成が走ってフェードが飛ぶため(目には白のまま)。進捗バーは、起動の段階と、シーンの準備を待つ間(0.5 秒を超えたとき)に出す。
- これで、前のシーンのオブジェクトの映り込みや、ベイク AO のずれを防ぐ(新しいシーンが描かれる前に同期で置き直す仕組みは使わない)。
- 準備完了とゲームの開始は別。snapshot は全員がそろうのを待つ間にも届く。全員がつながるとサーバーが `session.started` を送る(state-schema §6)。人間が 30 秒そろわないとセッションは解散する。
- セッションの終わり(接続の close)は、ゲームの流れが受ける(`sessionClosed(code)`)。
  - 再接続を諦めた、`4000`(セッション終了: finished / dissolved / abandoned)は、room へ戻る。
  - `4001`(同じプレイヤーが別のタブで入り直した)も room へ戻るが、`notice: "replaced"` を付け、自動では入り直さない(入り直すと、置き換えたタブを今度はこちらが切ってしまう)。
  - sandbox を手動で離れたとき(`leftSession`)は、流れが `idle` に戻るだけ。サーバーのセッションは残るので、次の `startMatchmaking` で `sessionId` を引いて戻れる。

## 5. レイアウト

オブジェクトをどこに、どの向き・見た目で置くかは、クライアントのシーンが決める(サーバーは位置を配らない。state-schema §6)。

```ts
// RoomScene/layout.ts(イメージ)。キーが項目名
export const ROOM_LAYOUT = {
  directory: directoryItem({id: "directory-1", position: [...], look: "small"}),
  desk: {id: "workspace-1", position: [...], yaw: 0},
  easel: {id: "canvas-1", position: [...], yaw: CANVAS_YAW}, // canvas の id はまだ約束に無い(仮)
};
```

- 届いたオブジェクトは、id でレイアウトの項目に割り当てる(項目の `id` と一致する物)。`LocalAuthority` も同じ id で物を作る(room・test には席が無いので、自分を席 1 とみなす)。
  - id の約束は席ごと: `directory-1` → 中心の山、`workspace-{席}` → 区画の机、`canvas-{席}` → 区画のキャンバス、`lighter_stand-{席}` → 区画の机の天板の右手前。sandbox のレイアウトの項目名は `workspace-1` のように席の番号つき。
  - 約束に無い種類(PC など)の id は、サーバーと決めてから足す(sandbox のレイアウトには `pc-{席}` の項目を先に置いてあるが、サーバーが配るまで出ない)。
  - どの項目にも当てはまらない物(レイアウトに無い種類など)は描かない。インタラクトもできない。警告をログに(id ごとに 1 回)出し、レイアウトに項目を足すきっかけにする。
- 各プレイヤーのスポーン地点も、席からシーンが決める(`sandboxSpawnOf(seat)`。サーバーは最初の位置を配らない)。`ServerAuthority` は、最初の snapshot で自分の `transform` が `null` なら自分の席のスポーン地点へ、あれば(再読み込み・再参加)その位置へ置く。他のプレイヤーの `transform` が `null` の間は、その席のスポーン地点に居るとみなす。
- `LocalAuthority` に渡す初期の配置も、同じレイアウトから作る(`planLocalObjects`)。置く物の初期設定(ディレクトリの在庫、ダミーの scope など)は、シーンの `initial`(項目名ごと)が決める。
- 向き・見た目(小さい山か大きい山か、など)もレイアウトの項目が持つ。`GameObject` には足さない。
- room のトグル(出す・使えるようにする)は、種類ではなく項目名で指定する。同じ種類が複数あっても 1 つずつ指定できる。
  - 一部の機能だけを止めるトグルは `<項目名>:<機能>`(例: `directory:overview` で、項目 `directory` の山の俯瞰ビューだけを止める)。機能の名前は、その種類のコンポーネントが宣言する。

## 6. オブジェクトのコンポーネント

1 つの種類の見た目と、クライアントで完結する振る舞いは、その種類のコンポーネントの中にフックで閉じ込める。

```tsx
function WorkspaceObject({object}: {object: GameObject}) {
  const data = useWorkspaceData(object); // data の解釈
  useControlLockWhileWorking(object); // 作業中の操作のロック
  useInteraction(object, onInteract); // マウントで登録、アンマウントで解除
  return <Desk />;
}
```

- 中央に残すのは、`ObjectManager`(状態)、`ManagedObjects`(種類 → コンポーネントの表と、レイアウトの適用)、`Interaction`(視線の先の判定)だけ。
- 種類を足す・消すときに触るのは、その種類のフォルダと、表の 1 行だけ。種類の一覧を中央に別に持たない。
- コンポーネントが持つのは見た目と、俯瞰ビューを開く・操作をロックするなどのクライアント側の振る舞いだけ。ルールは持たない(→ §3.1)。
- 見た目の形(ディレクトリの山の積み方など)は、オブジェクトの `id` ではなくレイアウトの項目から決める(今は `id` を山の乱数の種にしていて、見た目が id の付け方に左右される)。
- room の小さいディレクトリと sandbox の大きいディレクトリは、種類は同じ `directory` で、見た目のコンポーネントを分ける(`SmallDirectory` / `LargeDirectory`)。振る舞いは共通のフックで共有し、どちらで描くかはレイアウトの項目が決める。
- レイアウトの項目はあるが、種類 → コンポーネントの表に無い種類は、箱で描く(test の確認用の種類 `dummy` は `LocalAuthority` の中だけで使い、スキーマには足さない)。

## 7. `LocalAuthority` と開発用の操作

- ゲームとして要る部分(簡略版のルール)は、本番のコードに置く(room は本番で動くため。`dev/` には置かない)。
- 他人として借りる・アイテムを出すなど、開発でしか使わない操作は `dev/` に残し、`LocalAuthority` の開発用のメソッドを通して使う。
- 開発用のメソッドは `LocalAuthority` にだけある。`ServerAuthority` のシーンでは、デバッグパネルのこれらの操作は効かない。
- 本番のコードは `dev/` を import しない(例外は `App` の動的 import の `DevTools` だけ)。ゲームの流れの開始ボタンなど、開発用のパネルは `dev/` に置く。

## 8. 実装の状況

| 段階 | 内容 | 状態 |
|---|---|---|
| A | 種類ごとのコンポーネント(インタラクト・ロックを種類に閉じ込める)(#70) | 済 |
| B | レイアウト(`GameObject` をスキーマと同じ形にし、位置・向き・見た目をレイアウトの項目へ)(#71) | 済 |
| C | 白いオーバーレイと準備完了、起動の進捗バー(#72) | 済 |
| D | `LocalAuthority`(room・test)、自分の ID と要求の送り先をオーソリティから引く | 済 |
| E | `ServerAuthority`、ゲームの流れ(マッチング → sandbox → room)、開発用マルチシーンの削除 | 済 |

残り:

- マッチングのきっかけは開発用パネルのボタンだけ(チュートリアルの終わりから呼ぶのは未実装)。
- 開始の合図(`session.started`)・フェーズ・タスク・結果(`session.finished`)の表示は未実装。接続の終わりは、room へ戻るだけ。
- `ServerAuthority` の再接続を諦めた後の案内(エラー表示など)は無い。room へ戻る。

## 9. 後で片付けるもの・依頼事項

- **PC のサーバー側の実装**: backend への依頼事項(id の約束も一緒に決める)。それまで sandbox には PC が出ない(room・test では動く)。キャンバスは #75 でサーバーに入った。
- **sandbox にセッション無しで居る間のマッチング**: デバッグパネルのボタンは、sandbox にいる間は押せない(シーンの途中でオーソリティを切り替えないため)。room などへ移ってから始める。
