# CI/CD

## ワークフロー

| ファイル | きっかけ | 内容 |
| --- | --- | --- |
| `ci.yml` | PR と、`deploy-*.yml` からの呼び出し（`workflow_call`） | まず `changes` で変更パスを見て、関係するジョブだけ走らせる。backend の gofmt/build/vet/test と golangci-lint（`backend/**`）、frontend の API 型の生成物のずれの確認（`pnpm gen:api` の差分）と lint/test/build（`frontend/**` か `backend/api/**`）、terraform の fmt/validate（`infra/**`） |
| `preview.yml` | **main に向けた PR**（`frontend/**` の変更） | Worker Preview を作り、URL を PR にコメント |
| `deploy-cloudflare.yml` | main への push（`frontend/**`・`backend/**`・`wisp/**`・`.github/workflows/deploy-cloudflare.yml`）、手動実行 | CI → バックエンド Worker（backend に変更があるときだけ）→ WISP Worker → フロント Worker |
| `deploy-backend.yml` | main への push（`backend/**` または `.github/workflows/deploy-backend.yml`）、手動実行 | CI → arm64 のイメージを ECR へ push（同じ sha のタグが既にあれば push は飛ばす）→ デプロイ対象のタグを更新 |
| `deploy-wisp.yml` | main への push（`wisp/**` または `.github/workflows/deploy-wisp.yml`）、手動実行 | CI → arm64 の WISP イメージを ECR へ push（同じ sha のタグが既にあれば push は飛ばす）→ WISP のデプロイ対象タグを更新 |

### デプロイは CI の成功が前提

`deploy-*.yml` は最初のジョブで `ci.yml` を呼び出し、`needs: ci` でデプロイを待たせています。
CI が赤なら、その run ではデプロイされません。

main への push で CI を単独で走らせることはしていません（デプロイの run の中で走る）。
そのため、デプロイ対象外のパスだけを変えた push では main 上の CI は走りません。
変更は PR の段階で CI を通す前提です。

`ci.yml` か `.github/scripts/` が変わった run では、判定を信用せず全ジョブを走らせます。

### 必須にする設定（リポジトリの Settings 側・未設定）

ワークフローの中で CI を通しても、**PR を CI なしで merge できる状態のままだと意味が薄くなります**。
Settings → Rules → Rulesets の `main` に、`ci.yml` の次の各ジョブを必須のステータスチェックとして追加してください
（チェック名はジョブ名の `backend` / `frontend` / `terraform`。候補に出ない場合は一度 PR で CI を走らせると出ます）。

### `deploy-cloudflare` の backend 判定

比較の基準は **main で直近に成功した deploy-cloudflare の sha** です（直前の push ではありません）。
そのため、前回の backend デプロイが失敗していても、次の push でまとめて載ります。

`backend/**` も `.github/workflows/deploy-cloudflare.yml` も基準から変わっていなければ、
バックエンド Worker は再デプロイしません。frontend だけの変更でコンテナを作り直すと、
メモリ上のセッションが消えるためです。直近の成功が無いとき、手動実行（`workflow_dispatch`）、
判定できない push では、念のため再デプロイします。

`workflow_dispatch` は main 以外のブランチから実行しても、本番へのデプロイ（`deploy` ジョブ）は skip されます。

## 最初に設定するもの

リポジトリの Settings → Secrets and variables → Actions に登録します。

### Variables（秘密ではない）

| 名前 | 値の取り方 |
| --- | --- |
| `AWS_DEPLOY_ROLE_ARN` | `terraform output -raw github_deploy_role_arn` |
| `ECR_REPOSITORY` | `terraform output -raw ecr_repository_url` |
| `ECR_WISP_REPOSITORY` | `terraform output -raw wisp_ecr_repository_url` |
| `CLOUDFLARE_ACCOUNT_ID` | `bf2196e6a0e1ba61db76cf62ca00cafa` |
| `VITE_ENGINE_BASE_URL` | PC の画面のエンジンの配信元（R2 の公開 URL。[frontend/README.md](../../frontend/README.md) の「エンジンの配信元」） |
| `VITE_ENABLE_DEBUG` | 本番ビルドの `VITE_ENABLE_DEBUG`（デバッグ機能を有効にするか） |

### Secrets

| 名前 | 値の取り方 |
| --- | --- |
| `CLOUDFLARE_API_TOKEN` | Cloudflare のダッシュボードで発行。権限は **Workers Scripts: Edit** + **Workers KV Storage: Edit** |

### Worker の Secrets（Cloudflare 側に置く）

`iubeo-backend`・`iubeo-wisp` の秘密は GitHub ではなく Cloudflare 側に持ちます。CI のデプロイは
`--secrets-file` を渡さない（既存の値をそのまま使う）ので、初回だけ手で入れます。

`iubeo-backend`:

| 名前 | 用途 |
| --- | --- |
| `IUBEO_SIGNING_KEY` | プレイヤーの Cookie の署名 |
| `IUBEO_WISP_KEY` | WISP のトークンの署名 |
| `IUBEO_VC_PRIVATE_KEY` | VC の JWT の署名（値は VC ホストの `private.jwk` の `d`。[voice-chat.md](../../docs/voice-chat.md)） |
| `IUBEO_BRAVE_API_KEY` | ゲーム内の検索（`/api/v1/search/page`）の Brave Search API キー。未設定なら Yahoo! JAPAN の検索結果へ 302 で飛ばす |

`iubeo-wisp`:

| 名前 | 用途 |
| --- | --- |
| `WISP_KEY` | WISP のトークンの検証。`iubeo-backend` の `IUBEO_WISP_KEY` と同じ値 |

```sh
cf workers secrets update IUBEO_VC_PRIVATE_KEY --worker iubeo-backend --text <d>
```

## バックエンドのデプロイの仕組み

EC2 は**停止していることが多い**（それが節約の仕組み）ので、CI はインスタンスを触りません。

```text
CI: イメージを ECR へ push（release-<git sha>）
    → SSM パラメータ /iubeo-prototype/image-tag を書き換える
                    │
インスタンス:        └─ 次に起動したとき /usr/local/bin/iubeo-deploy が
                       そのタグを引いて iubeo-current に付け替え、再起動する
```

そのため、**デプロイは「次に起動したとき」に反映**されます。すぐ反映したいときは、
インスタンスを起動してから SSM で `iubeo-deploy` を実行してください。

```sh
aws ssm send-command --region ap-northeast-1 \
  --document-name AWS-RunShellScript \
  --targets Key=instanceids,Values=<instance-id> \
  --parameters commands=/usr/local/bin/iubeo-deploy
```

## OIDC の信頼ポリシー

`deploy-backend.yml` と `deploy-wisp.yml` は GitHub OIDC で一時資格情報を受け取ります。信頼ポリシーは
**main への push だけ**に絞ってあります（`infra/aws/terraform/ci.tf`）。

リポジトリの OIDC sub は不変 ID 形式です（`use_immutable_subject: true`）。sub は次のとおりです。

```text
repo:jogi-hackathon@331157460/iubeo@1378523961:ref:refs/heads/main
```

ID を含めているのは、名前の使い回しを防ぐためです。

### ブランチから試したいとき

上の sub が `main` に一致しないので、ブランチから `deploy-backend.yml` / `deploy-wisp.yml` を試すと
OIDC の引き受けに失敗します。試したい場合は `infra/aws/terraform/ci.tf` の
`StringLike` の sub 末尾を `ref:refs/heads/main` から `*` に変えて `terraform apply` してください。
作業が終わったら必ず元に戻してください。

## Worker は 3 つある

**DO 管理のコンテナを持つ Worker は Worker Previews に対応していません**。
プレビューを取れるように、静的アセット側を分けてあります。

| Worker | 中身 | デプロイ |
| --- | --- | --- |
| `iubeo-frontend` | 静的アセット(SPA) + プロキシ | `cf deploy` |
| `iubeo-backend` | コンテナ + Durable Object + KV（転送先の切り替え） | `cf deploy --mode backend` |
| `iubeo-wisp` | WISP のコンテナ + Durable Object + KV（転送先の切り替え） | `cf deploy --mode wisp` |

フロントはサービスバインディングでバックエンドと WISP を呼びます。**プレビューは
本番のバックエンドを向きます**（セッションはメモリ上にしか無いので実害なし）。
プレビューには WISP のバインディングを付けない（`IUBEO_WISP_ENABLED` を付けない）ので、`/wisp` は 503 になります。

```sh
cd frontend
cf previews deploy <name>                  # PR ごとのプレビュー URL
cf deploy --mode backend                   # バックエンド(初回は要 secrets file)
cf deploy --mode wisp                      # WISP
IUBEO_WISP_ENABLED=1 VITE_ENGINE_BASE_URL=<エンジンの配信元> cf deploy   # フロント
```

`VITE_ENGINE_BASE_URL` が無いと、本番で PC の画面のエンジンを取得できません（[frontend/README.md](../../frontend/README.md) の「エンジンの配信元」）。

**バックエンド → WISP → フロントの順**にデプロイしてください。サービスバインディングは
相手の Worker が存在しないと解決できません。

初回だけ secrets file が要ります（2 回目以降は Worker に保存済みの鍵を使うので不要）。

```sh
SIGNING_KEY=$(openssl rand -hex 32)
WISP_KEY=$(openssl rand -hex 32)
printf 'IUBEO_SIGNING_KEY=%s\nIUBEO_WISP_KEY=%s\nIUBEO_VC_PRIVATE_KEY=%s\n' "$SIGNING_KEY" "$WISP_KEY" "<VC ホストの private.jwk の d>" > /tmp/iubeo-secrets.env
cf deploy --mode backend --secrets-file /tmp/iubeo-secrets.env
printf 'WISP_KEY=%s\n' "$WISP_KEY" > /tmp/iubeo-wisp-secrets.env   # backend の IUBEO_WISP_KEY と同じ値
cf deploy --mode wisp --secrets-file /tmp/iubeo-wisp-secrets.env
rm -f /tmp/iubeo-secrets.env /tmp/iubeo-wisp-secrets.env
```
