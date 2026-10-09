# Web Search の判定（Clef）

PC の Web Search で「今のお題にふさわしいものを検索できているか」を、Workers AI の
[System One モデル Clef](https://developers.cloudflare.com/workers-ai/models/clef-flash/)
に見てもらう仕組み。

判定は**お題と、今表示しているページ**を渡し、**型の付いた質問**（Choice / Score / Noul）で受け取る。
Clef は文字列を生成しないので、画面に出す「理由」はコード側で答えから組み立てる。

## トリガーは無い（彼らは常に見ている）

**プレイヤーが判定を要求する操作は無い。** 判定される側が「判定してくれ」と要求するのは、
AI が上・人間は道具という IUBEO の立て付けと逆になるため。

- プレイヤーが **サイトを開く（表示中の URL が変わる）** と、落ち着くまで 1.2 秒待ってから判定が走る
- **検索結果ページは見ない**（検索しただけでは判定しない。判定は結果を辿って着いたページで行う）
- お題のメモをクリックして**お題を引き直した**ときは、同じページをもう一度見る
- 同じページは二度見ない。PC から離れると（Esc）、判定は畳まれる

### 画面に出すのは「介入」が主

判定は HUD ではなく **PC の画面の中**（`BrowserScreen` の通知の帯）に出す。黙って見ているので、
**判定中は何も出さない**。

| 判定 | 画面 |
|---|---|
| 合っている | 「お題に合っている」と 3 秒出してから **PC を畳む**（タスクが済んだので座らせない）。画面は乱さない |
| **外れている** | **CRT の走査が 0.7 秒乱れてから**、理由を 9 秒出す（彼らの介入） |
| 判定できなかった | 理由を 6 秒出す（黙らない） |

一致で畳むまでの 3 秒の間に別のページへ進めば畳まない（検索を続けているので、途中で座席を奪わない）。

## 通った検索は成果物になる（開発時の写し）

Web Search のタスクは「検索 → ワークスペースでファイル作成 → ディレクトリへ保存」（[IDEA.md](../IDEA.md)）。
そこで、判定が通った時点で**その検索を成果物として手に持たせる**。

- status は `search_created`（[items/file.ts](../../frontend/src/items/file.ts) の作成系）
- ディレクトリに入れれば、既存の規則で成果物 +1 になる（ダミーのサーバー役の作成系ファイルの扱い）
- URL ごとに 1 回だけ。手が塞がっていたら渡さない（キャンバスの `image_created` と同じ規則）

これは**実サーバーが PC（Web Search）の規則を持つまでの写し**で、キャンバスの `image_created` と
同じ立場（[frontend/src/dev/searchDeliverable.ts](../../frontend/src/dev/searchDeliverable.ts)）。
サーバー側ができたら、この配線はサーバーの interact の規則へ移す。

## 流れ

```
プレイヤーがページを開く
  → BrowserScreen が URL の変化を onPageChange で知らせる
  → PcObject が検索結果ページを弾き、1.2 秒待つ（読み込みが落ち着くのを待つ）
  → ScreenSource.readPage()            … URL・タイトル・本文を読む（Gecko の content で JS を評価）
  → POST /judge {task, page}           … 同じオリジン
  → フロントの Worker（本番）/ Vite のミドルウェア（開発）
  → askClef() → env.AI.run("@cf/cloudflare/clef-flash", …)
  → answersToResult()                  … 答えを {verdict, score, confidence, reasons, source} に畳む
  → judgeAnnouncement()                … 出す/出さない、乱すかどうか、出す長さを決める
  → BrowserScreen.setNotice()          … 画面の中に出す
  → （通っていれば）dev/searchDeliverable が成果物を渡し、合図の後で PC を畳む
```

届かない・答えが壊れているときは、その場で**簡易判定**（お題の語が URL・タイトル・本文に
あるかを見るだけ）に落ち、`source: "heuristic"` として画面に「簡易判定」と出す。

## Clef に投げる質問

| id | 型 | 聞いていること |
|---|---|---|
| `query_on_topic` | Noul | お題の語を指す検索でこのページへ来たか |
| `page_on_topic` | Noul | ページの中身がお題についてか |
| `relevance` | Score | お題に対してこのページがどれだけ役に立つか（4 段階） |
| `verdict` | Choice | 一致 / 一部一致 / 不一致 のどれか |

`query_on_topic` と `page_on_topic` は、そのまま画面に出す理由になる。`score` は Score の答えを
0..1 に直した一致度、`confidence` は Choice の confidence（どれだけ自信があるか）で、一致度とは別物。

質問の文面と組み立ては [frontend/src/judge/clef.ts](../../frontend/src/judge/clef.ts)。

## 設定

| 名前 | どこ | 意味 |
|---|---|---|
| `AI` | フロントの Worker（`cloudflare.config.ts` の `bindings.ai()`） | Workers AI の binding。/judge はこれで Clef を呼ぶ。無ければ `/judge` は 503 |
| `JUDGE_IP_LIMIT` | フロントの Worker（`bindings.rateLimit()`） | /judge の IP ごとの回数の上限（20 回/分）。無ければ絞らない |
| `JUDGE_GLOBAL_LIMIT` | フロントの Worker（`bindings.rateLimit()`） | /judge の全体の回数の上限（300 回/分）。無ければ絞らない |
| `VITE_JUDGE_URL` | ビルド時の env（任意） | 判定のエンドポイント。既定は同じオリジンの `/judge`。Worker は同じオリジンからの呼び出ししか受けないので、別のオリジンは指せない |

API キーは要らない（課金は Workers AI の従量課金に乗る。無料枠は 10,000 Neurons/日で、
1 回の判定は 10 Neurons 前後）。

## /judge の守り

Workers AI は従量課金なので、/judge は誰でも叩ける入口にしない。Clef を呼ぶ前に、安い順に弾く
（[frontend/worker/judge.ts](../../frontend/worker/judge.ts)）。どれで弾かれても、画面は簡易判定に落ちる。

| 順 | 何を見るか | 弾いたとき |
|---|---|---|
| 1 | 同じオリジンの画面からか（`Origin` と `Sec-Fetch-Site`） | 403 |
| 2 | 回数（IP ごと 20 回/分・全体 300 回/分。Rate Limiting の binding） | 429 |
| 3 | 本文の大きさ（16KB まで） | 413 |
| 4 | 形と中身（お題は空でない、URL は http(s)）。お題 80 字・タイトル 200 字・本文 2000 字に切り詰める | 400 |

1 はヘッダーを偽れる相手（curl など）には効かないので、使用量の上限は 2 と 3 で抑える。
上限と検証は [frontend/src/judge/request.ts](../../frontend/src/judge/request.ts) にあり、画面も送る前に同じ切り詰めを掛ける。

開発サーバー（`pnpm dev`）の `/judge` は **常に一致を返す**開発用の判定（`source: "dev"`）。
Clef は Cloudflare 上でしか動かないので、本物を手元で試すには Worker を動かす環境
（`pnpm cf:build && pnpm preview` など）で確認する。

## ファイル

- [frontend/src/judge/clef.ts](../../frontend/src/judge/clef.ts) … state と質問の組み立て、答えの畳み方、Clef の呼び出し
- [frontend/src/judge/request.ts](../../frontend/src/judge/request.ts) … 依頼の上限・検証・切り詰め（画面と Worker で共有）
- [frontend/src/judge/types.ts](../../frontend/src/judge/types.ts) … 画面と Worker で共有する型
- [frontend/src/objects/pc/judge.ts](../../frontend/src/objects/pc/judge.ts) … 画面側の状態・出す/出さないの判断・簡易判定・`/judge` の呼び出し
- [frontend/src/dev/searchDeliverable.ts](../../frontend/src/dev/searchDeliverable.ts) … 通った検索を成果物にする（開発時のみ）
- [frontend/worker/judge.ts](../../frontend/worker/judge.ts) … 本番の受け口（`/judge`）
- [frontend/scripts/judgeDev.ts](../../frontend/scripts/judgeDev.ts) … 開発サーバーに `/judge` を生やす Vite プラグイン（常に一致）

## テスト

```sh
cd frontend
pnpm test    # src/judge, src/objects/pc/__tests__/judge, src/dev/__tests__/searchDeliverable, worker/__tests__/judge
```
