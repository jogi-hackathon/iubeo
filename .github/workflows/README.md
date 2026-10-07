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

## Worker Previews は使えない

`cf previews deploy` は **DO 管理のコンテナに対応していません**。

```text
Preview deployments do not support Durable Object-managed Containers
(schedulingPolicy: "durable-object").
```

実機で確認済み（2026-10-07）。私たちの Worker は署名鍵をコンテナへ渡すために
`schedulingPolicy: "durable-object"` が必須なので、この制限に当たります。

プレビューが要るなら、**コンテナを持つ Worker と、静的アセットだけの Worker を
分ける**必要があります（フロントだけならプレビューできる）。分けた場合は
フロントの Worker がサービスバインディングでコンテナの Worker を呼びます。
