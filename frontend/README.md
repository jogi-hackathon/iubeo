# iubeo frontend

React 19 + React Three Fiber + Three.js(WebGPU)+ three-mesh-bvh。Vite で開発・ビルドする。

## 前提

- Node.js と pnpm
- 最新の Google Chrome(WebGPU 必須。WebGL へのフォールバックは無く、非対応なら起動エラー画面になる)
- AO ベイクには **実 GPU の WebGPU** が使える環境が必要

## セットアップと日常のコマンド

```sh
pnpm install
pnpm dev          # 開発サーバー http://localhost:5173
```

PC の画面（Web 検索）を使うには、別途 Gecko エンジンの取り込みが要る（約 34MB。リポジトリには入らない）。
入れなくても起動はするが、PC の画面は「NO ENGINE」のままになる。

```sh
# ビルド済みリリースを取ってリンクする（最新のタグは releases ページで確認。
# 自分でビルドした dist や firefox-wasm のリポジトリも渡せる）
curl -LO https://github.com/thirdlf03/firefox-wasm/releases/download/v0.0.9/gecko.js-v0.0.9.tar.gz
pnpm engine:link -- --from gecko.js-v0.0.9.tar.gz
```

詳しくは下の「PC（Web 検索の画面）」節。

| コマンド | 用途 |
| --------------------------------- | ---------------------------------------- |
| `pnpm dev` | 開発サーバー(5173 固定) |
| `pnpm engine:link` | PC の画面の Gecko エンジンを取り込む(初回だけ) |
| `pnpm build` | 型チェック後にビルド(出力は `.cloudflare/output/`) |
| `pnpm preview` | ビルド結果の確認 |
| `pnpm typecheck` | `tsc --noEmit`(本体・Node 側・Worker の3系統) |
| `pnpm test` | vitest(テストは各所の `__tests__/`) |
| `pnpm lint` / `pnpm lint:fix` | oxlint + oxfmt のチェック / oxlint の自動修正 |
| `pnpm format` / `pnpm format:check` | oxfmt で整形 / 整形のチェック |
| `pnpm gen:api` | `backend/api/openapi.yaml` から `src/net/schema.gen.ts` を生成([ADR-0006](../docs/adr/ADR-0006-typescript7-openapi-codegen.md)) |
| `pnpm wisp` | WISP プロキシを単独で立てる(下記) |
| `pnpm cf:build` / `pnpm cf:dry-run` | 型チェック後に `cf build` / `cf deploy --dry-run`(アップロードなし) |
| `pnpm deploy` | 型チェック後に `cf deploy`(フロントの Worker) |
| `pnpm bake:ao` | AO のベイク(下記) |
| `pnpm shot:pc --out=<path>` | PC の 3D モデルを 3 視点で撮る(`pc.html`。下記) |

コミット前に `pnpm typecheck && pnpm lint && pnpm test` が通ること。

## デバッグ機能

`.env.development` の `VITE_ENABLE_DEBUG=true` のとき有効。

- `?debug` クエリ
- `F10`: dev パネルの開閉 / `Shift+F10`: 次のタブへ(View・Scene・PostFX、`pnpm dev` のときは Game・Flow・Tutorial も)
- `F6`: stats と grid / `F8`: フリーカメラ(プレイ中に切り替えられるよう、パネルとは別のキーにしてある)

`VITE_RENDERER=webgl` にすると WebGL2 を強制し、起動エラー画面を確認できる。

## PC（Web 検索の画面）

試合（sandbox）の机の上の PC の画面は、Firefox のエンジン（Gecko）を WebAssembly にしたものが動く（部屋の PC は下の「部屋の PC(デスクトップ)」）。HUD は使わず、お題は机のメモに、状態は画面そのものに出す。参考: iubeo-lab の `browser-in-browser`（同じ仕組みの実験。画面の接続部を移植した）。

```sh
# 1. エンジンを取り込む（約 34MB。engine-local/ に置き、リポジトリには入れない）
pnpm engine:link -- --from <gecko.js/dist | firefox-wasm のリポジトリ | gecko.js-v*.tar.gz>

# 2. 開発サーバーを起動する。WISP プロキシ（127.0.0.1:5001）も一緒に立つ
pnpm dev     # http://localhost:5173/?debug（debug シーン）
```

- WISP は実サイトへ出るためのプロキシ。`pnpm dev` が 127.0.0.1:5001 に自動で立て、画面の既定の接続先は `.env.development` の `VITE_WISP_URL`（`ws://127.0.0.1:5001/`）。

- 自動起動を止めるなら `IUBEO_WISP=0 pnpm dev`。ポートを変えるなら `WISP_PORT` と `VITE_WISP_URL` を揃える。`?wisp=` を空（`?wisp=`）にすると、その場だけ無効になる。

- 単独で立てるなら `pnpm wisp`（開発サーバーとは別に動かすとき）。5001 が使われていると、dev は警告を出して続行する。

- 使い方: PC を狙って左クリックすると電源が入り、画面の前へ寄る。画面の上ではマウスと鍵盤がエンジンに届く。Esc で離れる（一人称に戻り、マウスルックもそのまま続く。クリックし直さなくてよい）。

- **検索の判定**: 今のお題にふさわしいものを検索できているかを、**ページを開くたびに** Clef が見る（プレイヤーが判定を要求する操作は無い）。HUD は使わず、外れているときだけ CRT が一瞬乱れて理由を画面の中に出す。合っていれば検索は成果物（`search_created` のファイル）として手に入り、合図のあと PC が畳まれる。手元の dev サーバーでは常に一致を返す（本物は Workers AI 上で動く）。

- 初回の起動は、エンジンの wasm を読むので数十秒かかる（画面に「BOOTING」と出る）。2 回目以降は速い。

- wasm（約 33MB）は、アプリの起動の裏（PC に近づいたとき。`search/SearchProgram.tsx` の `prewarm`）で先に取っておき、
  PC を開くときは blob URL としてエンジンに渡す。クリック時に残るのは展開とコンパイル（1 秒弱）だけ。
  33MB のリソースはブラウザの HTTP キャッシュに入らないので、バイト列を自分で持って渡している
  （`src/objects/pc/search/browser/engine.ts` の `prefetchEngineWasm`）

- エンジンが無いときは、画面に「NO ENGINE」と出る（`pnpm engine:link` を実行する）。

- `pnpm dev` の開発サーバーは、エンジンの SharedArrayBuffer のために COOP/COEP を付ける（vite.config.ts）。

- エンジンは静的アセットには載せない。静的アセットは 1 ファイル 25 MiB までで、エンジン（約 34MB）は配れない。本番は R2 から配る（下の「エンジンの配信元」）。

- 検索は、バックエンドの `GET /api/v1/search/page?q=…&t=…` に送る。バックエンドが Brave Search API（鍵は `IUBEO_BRAVE_API_KEY`）で引いて、自前の HTML の結果ページを返す。`t` は WISP のトークン（エンジンはクッキーを送れないため）。結果ページのリンクは、WISP 経由で実サイトを開く。Google は、データセンターの IP から来ると reCAPTCHA を出すため使わない（アドレス欄に Yahoo! JAPAN などの URL を打てば、そのまま WISP 経由で開ける）。

### 部屋の PC(デスクトップ)

部屋の PC だけは Web 検索ではなく、Windows 2000 風のデスクトップが動く(レイアウトの `program: "desktop"`)。アイコンをダブルクリックしてアプリ(マッチング・設定)を開く。

- チュートリアルの間は PC の電源が落ちていて、画面は真っ暗。最後の手順で PC を触ると電源が入り、BIOS 風の起動画面(IUBEO のロゴと読み込みの棒)を 9 秒ほど出してからデスクトップになり、そこでチュートリアルが完了する(起動の間は入力を受けない)。終えたあとの部屋で触れるのは PC だけ
- マッチング: 「開始」で対戦相手を探し始め、探している間は「キャンセル」で止める。見つかったら、そのまま画面へ飛び込んで試合へ移る
- 設定: マウスの感度(一人称で見回す速さの倍率)。動かしたらすぐ効き、localStorage の `iubeo:mouse` に残る

- 使っている間は pointer lock を保ったまま、マウスの移動量で画面の中のカーソルを動かす(ディレクトリの俯瞰ビューと同じ)。画面が視界の 9 割を占めるまで寄る
- 離れるのは、右クリックか Esc。右クリックなら、一人称に戻ってもクリックし直さなくてよい(Esc は pointer lock が外れるのでクリックし直す)
- PC にシャットダウンは無く、画面はいつも点いている。開いた窓やスタートメニューは、離れてもそのまま残る
- 部屋の PC に近づいたときも、試合の PC で使う検索のエンジンを先に取っておく
- 見た目は 3D を通さずに `http://localhost:5173/desktop.html`(dev 専用。build には入らない)で触って確かめられる。2 倍に拡大して出し、本物のマウスで操作する。マッチングはサーバーにつながず、ページの下のボタンで状態(探している・成立・エラーなど)を切り替える

### PC の 3D モデルを撮る

見た目（`PcModel`）を直したときの比較用に、ゲームへ入らずにモデルだけを撮れる。ゲームと同じライト・同じ CRT マテリアルで、正面・斜め 45°・モニタ接写の 3 視点を 1 枚にする。

```sh
pnpm shot:pc --out=/tmp/pc-after.png
```

- 実 GPU の WebGPU が使える Chrome が要る（`pnpm bake:ao` と同じ）。ページは `pc.html`（dev 専用。build には入らない）
- 撮影しているのは `src/objects/pc/page.tsx`。視点や背景を変えたいときはここを直す

### 本番の WISP（トークンで保護）

本番では、WISP は誰でも使えないようにする（オープンプロキシになるため）。

- バックエンドが `GET /api/v1/wisp/token` で、セッション中・マッチング待機/成立後・アプリを開いて遊んでいる間（`POST /api/v1/tutorial/presence` の heartbeat）のプレイヤーにだけ、期限つき（5 分）の署名トークン付き URL を返す（鍵は `IUBEO_WISP_KEY`）。合言葉（`IUBEO_WISP_PASS`）は廃止した
- WISP の Worker（`worker/wisp.ts`）は、KV の `target` で転送先を決める（backend と同じ切り替え）:
  - `ec2` のとき: EC2 上の WISP（8081、EIP から出る）へそのまま流す。トークンは EC2 側がインスタンス上の鍵で検証する。Cloudflare の共有 IP を避けられるので Google が使える
  - それ以外: トークンを Worker で検証してから、Container（`wisp/`、wisp-js）へ流す
  - フロントの Worker が `/wisp/*` をここへ転送する
- デプロイの順は backend → wisp → frontend（サービスバインディングの参照先が先に要るため）。
  - `pnpm exec cf deploy --mode backend`
  - `pnpm exec cf deploy --mode wisp`
  - `IUBEO_WISP_ENABLED=1 pnpm exec cf deploy`（WISP を deploy した後。付けないと `/wisp` は 503。プレビューも付けない）
- 手元から frontend をデプロイするときは `VITE_ENGINE_BASE_URL` も要る。付けないと本番でエンジンが取れず PC が「NO ENGINE」のままになる（CI はリポジトリ変数から入れる）。例: `IUBEO_WISP_ENABLED=1 VITE_ENGINE_BASE_URL=https://pub-0f02f960393243b2ad1e49137b42875a.r2.dev pnpm exec cf deploy`
- 本番のドメイン（`iubeo.thirdlf03.com`）は、`iubeo-frontend` の Custom Domain としてアタッチしてある（Cloudflare が DNS と証明書を管理する）。cf からは管理しないので、消した・作り直したときはダッシュボード（Workers → iubeo-frontend → Domains & Routes）か Workers Domains API で付け直す。`iubeo-origin.thirdlf03.com` は EC2 の EIP への A レコード（DNS only）で、Worker からオリジンへ向けるために要る
- secret は、backend（`iubeo-backend`）に `IUBEO_SIGNING_KEY`・`IUBEO_WISP_KEY`・`IUBEO_VC_PRIVATE_KEY`、wisp（`iubeo-wisp`）に `WISP_KEY` を登録する。`IUBEO_WISP_KEY` と `WISP_KEY` は同じ値（32 バイト以上）。EC2 側の鍵は別物で、インスタンス上の `/etc/iubeo/env` に置く（infra/aws/terraform/README.md）

`VITE_WISP_URL`（開発の既定は `ws://127.0.0.1:5001/`）があれば、トークンは使わずそこへ直結する。

#### トークンの流れを手元だけで確かめる

本番と同じ流れ（バックエンドがトークンを発行 → 同じオリジンの `/wisp/` でトークンを検証 → WISP）を、Cloudflare に繋がずに動かせる。`pnpm dev` が `/wisp` を手元の WISP へ転送し、WISP は `IUBEO_WISP_KEY` があればトークンを検証する。

```sh
# バックエンド(backend/ で)。鍵は 32 バイト以上なら何でもよい
IUBEO_SIGNING_KEY=<32 バイト以上> IUBEO_ALLOWED_ORIGINS=http://localhost:5173 \
  IUBEO_WISP_KEY=<32 バイト以上> IUBEO_WISP_URL=ws://localhost:5173/wisp/ \
  go run ./cmd/server

# フロント(frontend/ で)。VITE_WISP_URL を空にして直結をやめ、同じ鍵で WISP にトークンを検証させる
IUBEO_WISP_KEY=<バックエンドと同じ鍵> VITE_WISP_URL= pnpm dev
```

`http://localhost:5173/?debug` で開くと、プレイヤーの Cookie が作られてトークンが発行され、検索できる。トークンが発行されないと、画面は「オフライン」になる。

### エンジンの配信元

本番のエンジンは R2（`iubeo-engine` バケットの `engine/...`）から配る。ビルドの成果物には入れない（静的アセットの上限が 25 MiB のため）。
`VITE_ENGINE_BASE_URL` に配信元を入れると、そこから読む（例: `https://pub-xxxx.r2.dev`）。空なら同じオリジンの `/engine/`（`engine-local/` を開発サーバーが配る）。

## シーン

`src/scenes/index.ts` の `scenes` に登録する。`room` / `sandbox` が本番、`test` は開発時のみ。

## AO ベイク

静的なジオメトリの AO(アンビエントオクルージョン)を事前に GPU で計算し、テクスチャとして焼き込む。ゲーム本体では焼いた AO を `aoMap` として貼り、リアルタイムの GTAO は省く。

### 実行

```sh
pnpm bake:ao                       # test シーンを焼く
pnpm bake:ao --scene=room          # シーンを指定(src/scenes/index.ts のキー)
```

dev サーバーの別途起動は不要。スクリプトが空きポートで Vite を起動し、インストール済みの Chrome(ヘッドレス)で `bake.html` を開いて完了まで待つ。

| オプション | 内容 |
| ------------------------ | -------------------------------------------------------- |
| `--scene=<name>` | ベイク対象のシーン(既定 `test`) |
| `--timeout=<秒>` | 既定 300 |
| `--allow-software` | SwiftShader 等のソフトウェア実装でも続行(既定は中断) |
| `--headed` | ウィンドウを表示して実行(デバッグ用) |
| `--chrome-arg=<flag>` | Chrome への追加フラグ(複数指定可) |

終了コード: 成功 `0` / 失敗・タイムアウト `1` / 引数エラー `2`。

### 出力

`public/ao/<scene>.png` と `public/ao/<scene>.bin`。**git にコミットする**(ゲーム本体はこれを読む)。

- `.png`: 全 mesh のチャートを1枚に詰めた AO アトラス(8bit グレースケール)
- `.bin`: アトラス内の配置情報。本体はシーンの mesh と照合し、不一致なら警告してベイク AO を無効化する(GTAO のみで描画)

シーンの mesh 構成を変えたら再ベイクが必要。ファイルが無いときも本体は動き、コンソールに `pnpm bake:ao` を案内する。

### ベイク対象にする

| 書き方 | 意味 |
| ------------------------------------- | --------------------------------------------- |
| `<BVHCollider>` 配下の mesh | 動かないコライダーは自動で対象 |
| `<BakeTarget>` 配下の mesh | コライダーにしない見た目だけの mesh を対象に(マウント時の子孫のみ) |

対象の条件: `uv` を持つこと。ジオメトリには `index` / `normal` / `uv` が必要で、`geometry.groups` の1グループ(groups が無ければ全体)が1チャートとなり、チャートごとに `[0,1]²` の uv を持つこと。

### AO モード

`userData={aoModeUserData("baked")}` で指定する(祖先を辿って最初の指定を採用)。

| モード | 内容 |
| ---------- | ---------------------------------------------------------- |
| `baked` | 既定。ベイク AO のみ(GTAO なし) |
| `both` | ベイク AO と GTAO の暗い方。動く物が載る床など |
| `realtime` | ベイク対象外で GTAO のみ。動く物・uv の無い物向け |

`realtime` との切り替えは再ベイクが必要。`baked` ↔ `both` は不要。

### 新しい物を焼くときの流れ

1. mesh を `<BVHCollider>` または `<BakeTarget>` で囲む(必要なら AO モードを指定)
1. 新規シーンなら `src/scenes/index.ts` に登録
1. `pnpm bake:ao --scene=<name>`
1. `public/ao/` の更新分をコミット

### 仕組み(参考)

- `bake.html` / `src/bake/page.tsx`: dev 専用のベイクページ。`build` には含まれない
- `src/bake/run.ts`: ジオメトリ結合 → BVH → アトラス配置 → テクセルごとの AO(GPU)
- `scripts/bakeSavePlugin.ts`: dev 専用の Vite プラグイン。ページから `POST /__bake/save` で受けて `public/ao/` に書く
- `src/bake/BakedAO.tsx`: 本体側の読み込み。`.bin` / `.png` を読み、各 mesh の `uv1` と `aoMap` に設定する

## ディレクトリ構成(`src/`)

| ディレクトリ | 役割 |
| ------------ | ------------------------------------------------------------ |
| `authority/` | オーソリティ(`local/` の `LocalAuthority`、`server/` の `ServerAuthority`)と、その登録・勝利フラグ |
| `bake/` | AO ベイク一式 |
| `boot/` | 起動処理(WebGPU 判定、アセット読み込み、エラー画面) |
| `camera/` | カメラ、`postprocess/`(ポストプロセスと設定パネル) |
| `core/` | Canvas・レンダラー・入力・`bvh/`(コライダー登録)・`cover/`(白いオーバーレイ)・`debug/`・観戦 |
| `dev/` | 開発時のみのデバッグパネル(本番に入らない) |
| `flow/` | ゲームの流れ(プレイヤー ID の発行 → マッチング → sandbox → room) |
| `game/` | フェーズ・タスク・結果の状態と HUD、脱落後の観戦 |
| `items/` | 手に持つアイテム(ファイル・ライター) |
| `judge/` | 検索の判定(Workers AI の Clef)の要求と応答。Worker(`worker/judge.ts`)からも使う |
| `net/` | HTTP と WebSocket の接続、位置のバイナリ形式、OpenAPI から生成した型(`schema.gen.ts`) |
| `objects/` | オーソリティが置くオブジェクト(`directory/`、`workspace/`、`canvas/`、`pc/`、`lighter_stand/`)と狙い・インタラクト |
| `player/` | プレイヤー操作・物理・スケルトン、他のプレイヤーの描画 |
| `props/` | `BVHCollider` で包む基本プロップ |
| `scenes/` | シーン定義と環境、シーンの切り替えと準備完了 |
| `transition/` | シーン切り替えの演出(`dive/`) |
| `tutorial/` | チュートリアルの進行の仕組み・終えたかの保存・在席の通知(どのシーンにも依存しない。部屋の手順と見せ方は `scenes/RoomScene/tutorial/`) |
| `voice/` | ボイスチャット([docs/voice-chat.md](../docs/voice-chat.md)) |

`objects/pc/` は、PC 本体(モデル・CRT・使っている状態・撮影ページの `page.tsx`)を直下に置き、`display/` に画面の約束(`ScreenSource`)・解像度・キー入力、`search/` に Web 検索(お題・判定・成果物と、`browser/` に Gecko・WISP の接続先)、`desktop/` に部屋の PC の 2000 風デスクトップ(`kernel/` が状態と入力の解釈、`paint/` と `theme/` が見た目、`apps/` がアプリ)を置く。どちらを動かすかはレイアウトの `program` で選ぶ(`programs.ts`)。

`worker/` は Cloudflare の Worker(`frontend.ts`・`backend.ts`・`wisp.ts`・`judge.ts`。`wispToken.ts` は WISP のトークンの検証)、`scripts/` は開発用のスクリプトと Vite のプラグイン。

## コード規約

- フォーマットは oxfmt(スペース2、printWidth 80、ダブルクォート、`{a: 1}` 形式、import 自動ソート)
- テストは対象と同じ階層の `__tests__/*.test.ts`
