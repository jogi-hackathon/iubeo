# iubeo

協力型ゲームのフロント(React + Three.js)とバックエンド(Go)、WISP プロキシ、インフラ(Terraform)のモノレポ。

## 前提

| 用途 | 必要なもの |
| --- | --- |
| フロント | **Node.js 24**、**pnpm 11**（CI と同じ。`corepack enable` で有効化できる） |
| バックエンド | **Go 1.27**（`backend/go.mod` の `go` ディレクティブ） |
| ブラウザ | **Google Chrome**（WebGPU 必須。非対応時は起動エラーになる） |
| PC の画面（Web 検索） | Gecko エンジン（約 34MB。別途 `pnpm engine:setup`。後述） |
| AO ベイク | WebGPU が使える GPU 環境 |

任意: [devenv](https://devenv.sh/) を使うと Go / pnpm / `air` が揃い、`devenv up` でバックエンドとフロントを同時に起動できる（`devenv.nix` 参照）。direnv 利用時は `.envrc` が有効になる。

## セットアップ

### 1. 依存関係のインストール

```sh
# フロント
cd frontend
pnpm install

# バックエンド（Go モジュールの取得）
cd ../backend
go mod download
```

### 2. 環境変数

#### バックエンド（必須）

起動時に読む主な変数（`backend/internal/config`）。devenv 利用時は `devenv.nix` に開発用の既定値があり、`.env` で上書きできる。

| 変数 | 説明 |
| --- | --- |
| `IUBEO_SIGNING_KEY` | 32 バイト以上の署名鍵（必須） |
| `IUBEO_ALLOWED_ORIGINS` | 許可するオリジン（カンマ区切り。例: `http://localhost:5173`） |
| `IUBEO_ADDR` | 待ち受けアドレス（既定 `:8080`） |
| `IUBEO_MATCH_SIZE` | 1〜3（既定 3） |
| `IUBEO_WISP_KEY` | WISP トークン検証用（32 バイト以上。トークン経由の WISP を使うとき） |
| `IUBEO_WISP_URL` | バックエンドから WISP へ渡す URL（本番向け） |
| `IUBEO_BRAVE_API_KEY` | Brave Search API（未設定なら検索は Yahoo! JAPAN へ 302） |
| `IUBEO_VC_*` | ボイスチャット（任意。[docs/voice-chat.md](docs/voice-chat.md)） |

手元で最小構成を動かす例:

```sh
cd backend
IUBEO_SIGNING_KEY='iubeo-dev-only-signing-key-do-not-use-in-prod' \
IUBEO_ALLOWED_ORIGINS='http://localhost:5173' \
  go run ./cmd/server
```

#### フロント（開発）

`frontend/.env.development`（リポジトリ同梱）に既定値がある。主なもの:

| 変数 | 説明 |
| --- | --- |
| `VITE_ENABLE_DEBUG` | `true` でデバッグ UI（F10 など） |
| `VITE_RENDERER` | `webgpu`（既定） / `webgl` で WebGL2 強制 |
| `VITE_WISP_URL` | 開発 WISP（既定 `ws://127.0.0.1:5001/`） |
| `VITE_ENGINE_BASE_URL` | 本番ビルド時のエンジン CDN（空なら同オリジンの `/engine/`） |

Vite が `/api` を `IUBEO_BACKEND_URL`（未設定時 `http://localhost:8080`）へプロキシする。

#### 開発 WISP（任意）

`pnpm dev` は 127.0.0.1:5001 に WISP を自動起動する。止める場合は `IUBEO_WISP=0 pnpm dev`。ポート変更は `WISP_PORT` と `VITE_WISP_URL` を揃える。

### 3. Gecko エンジン（PC の Web 検索画面）

エンジンは [thirdlf03/firefox-wasm](https://github.com/thirdlf03/firefox-wasm) の GitHub Releases から配布される。リポジトリには含めない（`frontend/engine-local/`）。

```sh
cd frontend
pnpm engine:setup
```

- 最新リリースを GitHub API で取得し、`gecko.js-v*.tar.gz` をダウンロードして `engine-local/` にリンクする。
- 同じ版が既に入っていればスキップ（再取得は `pnpm engine:setup -- --force`）。
- 版を固定: `pnpm engine:setup -- --tag v0.0.9`
- 手元ビルドや tar.gz を直接指定: `pnpm engine:link -- --from <path>`
- API レート制限で失敗する場合は `GITHUB_TOKEN` または `GH_TOKEN` を設定する。

未セットアップでもアプリは起動するが、PC 画面は「NO ENGINE」になる。

## ローカルで動かす

### devenv（推奨）

リポジトリルートで:

```sh
devenv up
```

`backend`（`air`）と `frontend`（`pnpm dev`）が起動する。ブラウザで `http://localhost:5173/?debug` を開く。

### 手動

ターミナル 1（バックエンド）:

```sh
cd backend
IUBEO_SIGNING_KEY='iubeo-dev-only-signing-key-do-not-use-in-prod' \
IUBEO_ALLOWED_ORIGINS='http://localhost:5173' \
  go run ./cmd/server
```

ターミナル 2（フロント）:

```sh
cd frontend
pnpm dev
```

PC の Web 検索を試す場合は事前に `pnpm engine:setup` を実行する。

## テスト・lint・ビルド

CI（[`.github/workflows/ci.yml`](.github/workflows/ci.yml)）と同じ流れ。

### バックエンド

```sh
cd backend
gofmt -l .   # 出力が空であること
go build ./...
go vet ./...
go test ./...
golangci-lint run ./...   # ローカルに golangci-lint がある場合
```

### フロント

```sh
cd frontend
pnpm install --frozen-lockfile
pnpm gen:api
git diff --exit-code -- src/net/schema.gen.ts   # 生成物のずれ確認
pnpm lint
pnpm test
pnpm build
```

コミット前の目安: `pnpm typecheck && pnpm lint && pnpm test`（`frontend/`）。

フロントの詳細は [frontend/README.md](frontend/README.md)、バックエンドの状態設計は [docs/backend/state-schema.md](docs/backend/state-schema.md) を参照。

## デプロイ

- フロント(React + Vite の SPA): Cloudflare Workers Static Assets。`cf` でデプロイする。設定は `frontend/cloudflare.config.ts`
- バックエンド(Go): 2 か所に置き、Cloudflare KV の `target` で切り替える
  - 本番相当: AWS EC2 + Elastic IP(`ap-northeast-1`)。インフラは `infra/aws/terraform/` の Terraform で管理し、必要なときだけ起動する
  - 開発用・フォールバック: Cloudflare Containers(`iubeo-backend` の Worker)
- WISP(PC の画面が実サイトへ出るプロキシ): バックエンドと同じく EC2 と Cloudflare Containers(`iubeo-wisp` の Worker)

判断の理由と制約は [ADR-0005](docs/adr/ADR-0005-deployment-architecture.md)、CI/CD は [.github/workflows/README.md](.github/workflows/README.md)、AWS 側の手順は [infra/aws/terraform/README.md](infra/aws/terraform/README.md) を参照する。

### フロント(Cloudflare)

main への push で `deploy-cloudflare.yml` がデプロイする。手元から行うとき:

```sh
cd frontend
pnpm install
pnpm cf:dry-run   # 型検査とデプロイ内容の検証(アップロードなし)
IUBEO_WISP_ENABLED=1 VITE_ENGINE_BASE_URL=<エンジンの配信元> pnpm deploy   # Cloudflare へデプロイ(認証が必要)
```

`IUBEO_WISP_ENABLED=1` を付けないと `/wisp` が 503 に、`VITE_ENGINE_BASE_URL` を付けないと PC の画面が「NO ENGINE」になる(CI はどちらも渡している)。

バックエンド・WISP の Worker を含む手順と順序は [frontend/README.md](frontend/README.md) の「本番の WISP」節を参照する。

### バックエンド(AWS)

```sh
cd infra/aws/terraform
cp terraform.tfvars.example terraform.tfvars   # 値を埋める
terraform init
terraform apply
```

コンテナイメージは `deploy-backend.yml` / `deploy-wisp.yml`(CI)が ECR へ push する。反映の流れは [infra/aws/terraform/README.md](infra/aws/terraform/README.md) に従う。
