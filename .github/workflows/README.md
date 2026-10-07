# CI/CD

## ワークフロー

| ファイル | きっかけ | 内容 |
| --- | --- | --- |
| `ci.yml` | PR と main への push | backend の build/vet/test、frontend の typecheck/lint/test/build、terraform の fmt/validate |
| `deploy-frontend.yml` | main への push（`frontend/**`） | Cloudflare へデプロイ（`cf deploy`） |
| `deploy-backend.yml` | main への push（`backend/**`） | arm64 のイメージを ECR へ push し、デプロイ対象のタグを更新 |

**AWS の長期アクセスキーは使いません。** `deploy-backend.yml` は GitHub OIDC で
一時資格情報を受け取ります。信頼ポリシーは **main への push だけ**に絞ってあります。

## 最初に設定するもの

リポジトリの Settings → Secrets and variables → Actions に登録します。

### Variables（秘密ではない）

| 名前 | 値の取り方 |
| --- | --- |
| `AWS_DEPLOY_ROLE_ARN` | `terraform output -raw github_deploy_role_arn` |
| `ECR_REPOSITORY` | `terraform output -raw ecr_repository_url` |
| `CLOUDFLARE_ACCOUNT_ID` | `bf2196e6a0e1ba61db76cf62ca00cafa` |

### Secrets

| 名前 | 値の取り方 |
| --- | --- |
| `CLOUDFLARE_API_TOKEN` | Cloudflare のダッシュボードで発行。権限は **Workers Scripts: Edit** + **Workers KV Storage: Edit** |

## バックエンドのデプロイの仕組み

EC2 は**停止していることが多い**（それが節約の仕組み）ので、CI はインスタンスを触りません。

```text
CI: イメージを ECR へ push（release-<git sha>）
    → SSM パラメータ /iubeo-prototype/image-tag を書き換える
                    │
インスタンス:        └─ 次に起動したとき /usr/local/bin/iubeo-deploy が
                       そのタグを引いて iubeo-current に付け替え、再起動する
```

なので**デプロイは「次に起動したとき」に反映**されます。すぐ反映したいときは、
インスタンスを起動してから SSM で `iubeo-deploy` を叩いてください。

```sh
aws ssm send-command --region ap-northeast-1 \
  --document-name AWS-RunShellScript \
  --targets Key=instanceids,Values=<instance-id> \
  --parameters commands=/usr/local/bin/iubeo-deploy
```

## ブランチから試したいとき

信頼ポリシーは `repo:jogi-hackathon/iubeo:ref:refs/heads/main` に限定しています。
ブランチから `deploy-backend.yml` を試すと OIDC の引き受けに失敗します。
試したい場合は `infra/aws/terraform/ci.tf` の `sub` を `repo:<owner>/<repo>:*` に
緩めて `terraform apply` してください。

## Worker は 2 つある

**DO 管理のコンテナを持つ Worker は Worker Previews に対応していません。**
プレビューを取れるように、静的アセット側を分けてあります。

| Worker | 中身 | デプロイ |
| --- | --- | --- |
| `iubeo-frontend` | 静的アセット(SPA) + プロキシ | `cf deploy` |
| `iubeo-backend` | コンテナ + Durable Object + KV | `cf deploy --mode backend` |

フロントはサービスバインディングでバックエンドを呼びます。**プレビューは
本番のバックエンドを向きます**（セッションはメモリ上にしか無いので実害なし）。

```sh
cd frontend
cf previews deploy <name>                  # PR ごとのプレビュー URL
cf deploy                                  # フロント
cf deploy --mode backend                   # バックエンド(要 secrets file)
```

**バックエンドを先に**デプロイしてください。サービスバインディングは
相手の Worker が存在しないと解決できません。

初回だけ secrets file が要ります（2 回目以降は Worker に保存済みの鍵を使うので不要）。

```sh
KEY=$(openssl rand -hex 32)
printf 'IUBEO_SIGNING_KEY=%s\n' "$KEY" > /tmp/iubeo-secrets.env
cf deploy --mode backend --secrets-file /tmp/iubeo-secrets.env
rm -f /tmp/iubeo-secrets.env
```
