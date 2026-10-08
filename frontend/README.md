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

| コマンド | 用途 |
| --------------------------------- | ---------------------------------------- |
| `pnpm dev` | 開発サーバー(5173 固定) |
| `pnpm build` | 型チェック後に `dist/` へビルド |
| `pnpm preview` | ビルド結果の確認 |
| `pnpm typecheck` | `tsc --noEmit`(本体と Node 側の2系統) |
| `pnpm test` | vitest(テストは各所の `__tests__/`) |
| `pnpm lint` / `pnpm lint:fix` | oxlint + oxfmt のチェック / oxlint の自動修正 |
| `pnpm format` | oxfmt で整形 |
| `pnpm bake:ao` | AO のベイク(下記) |

コミット前に `pnpm typecheck && pnpm lint && pnpm test` が通ること。

## デバッグ機能

`.env.development` の `VITE_ENABLE_DEBUG=true` のとき有効。

- `?debug` クエリ
- `F9`: ポストプロセスパネル / `F10`: シーンパネル / `Shift+F10`: ゲームパネル

`VITE_RENDERER=webgl` にすると WebGL2 を強制し、起動エラー画面を確認できる。

## PC（Web 検索の画面）

机の上の PC の画面は、Firefox のエンジン（Gecko）を WebAssembly にしたものが動く。HUD は使わず、お題は机のメモに、状態は画面そのものに出す。参考: iubeo-lab の `browser-in-browser`（同じ仕組みの実験。画面の接続部を移植した）。

```sh
# 1. エンジンを取り込む（約 34MB。engine-local/ に置き、リポジトリには入れない）
pnpm engine:link -- --from <gecko.js/dist | firefox-wasm のリポジトリ | gecko.js-v*.tar.gz>

# 2. 開発サーバーを起動する。WISP プロキシ（127.0.0.1:5001）も一緒に立つ
pnpm dev     # http://localhost:5173/?debug（debug シーン）
```

- WISP は実サイトへ出るためのプロキシ。`pnpm dev` が 127.0.0.1:5001 に自動で立て、画面の既定の接続先は `.env.development` の `VITE_WISP_URL`（`ws://127.0.0.1:5001/`）。

- 自動起動を止めるなら `IUBEO_WISP=0 pnpm dev`。ポートを変えるなら `WISP_PORT` と `VITE_WISP_URL` を揃える。`?wisp=` を空（`?wisp=`）にすると、その場だけ無効になる。

- 単独で立てるなら `pnpm wisp`（開発サーバーとは別に動かすとき）。5001 が使われていると、dev は警告を出して続行する。

- 使い方: PC を狙って左クリックすると電源が入り、画面の前へ寄る。画面の上ではマウスと鍵盤がエンジンに届く。お題のメモをクリックすると、別のお題を引く。Esc で離れる。

- 初回の起動は、エンジンの wasm を読むので数十秒かかる（画面に「BOOTING」と出る）。2 回目以降は速い。

- エンジンが無いときは、画面に「NO ENGINE」と出る（`pnpm engine:link` を実行する）。

- `?task=<語>` でお題を固定できる（確認用）。

- `pnpm dev` の開発サーバーは、エンジンの SharedArrayBuffer のために COOP/COEP を付ける（vite.config.ts）。

- 本番（Cloudflare）には載せない。静的アセットは 1 ファイル 25 MiB までで、エンジン（約 34MB）は配れない。本番では「NO ENGINE」になる。

- 検索結果は、WISP 経由で Google に出る。Google は、プロキシ経由の通信に対して reCAPTCHA を出すことがある。

### 本番の WISP（トークンで保護）

本番では、WISP は誰でも使えないようにする（オープンプロキシになるため）。

- バックエンドが `GET /api/v1/wisp/token` で、プレイヤーの Cookie があるときだけ、期限つき（5 分）の署名トークン付きの URL を返す（鍵は `IUBEO_WISP_KEY`）。
- WISP の Worker（`worker/wisp.ts`）がトークンを検証してから、Container（`wisp/`、wisp-js）へ流す。フロントの Worker が `/wisp/*` をここへ転送する。
- デプロイの順は backend → wisp → frontend（サービスバインディングの参照先が先に要るため）。
  - `pnpm exec cf deploy --mode backend`
  - `pnpm exec cf deploy --mode wisp`
  - `IUBEO_WISP_ENABLED=1 pnpm exec cf deploy`（WISP を deploy した後。付けないと `/wisp` は 503。プレビューも付けない）
- secret は 2 つ。`IUBEO_WISP_KEY` は backend と wisp の両方に、同じ値で登録する（32 バイト以上）。

`VITE_WISP_URL`（開発の既定は `ws://127.0.0.1:5001/`）があれば、トークンは使わずそこへ直結する。

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
| `bake/` | AO ベイク一式 |
| `boot/` | 起動処理(WebGPU 判定、アセット読み込み、エラー画面) |
| `camera/` | カメラ、`postprocess/`(ポストプロセスと設定パネル) |
| `core/` | Canvas・レンダラー・入力・`bvh/`(コライダー登録) |
| `dev/` | 開発時のみのデバッグパネルとダミーサーバー役(本番に入らない) |
| `items/` | アイテム |
| `objects/` | サーバーが置くオブジェクト(`directory/`、`workspace/` など) |
| `player/` | プレイヤー操作・物理・スケルトン |
| `props/` | `BVHCollider` で包む基本プロップ |
| `scenes/` | シーン定義と環境 |

## コード規約

- フォーマットは oxfmt(スペース2、printWidth 80、ダブルクォート、`{a: 1}` 形式、import 自動ソート)
- テストは対象と同じ階層の `__tests__/*.test.ts`
