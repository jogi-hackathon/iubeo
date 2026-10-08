# AWS バックエンド基盤（Terraform）

バックエンド（Go）を **EC2 + Elastic IP** で動かす構成です。方針の理由は
[ADR-0005](../../../docs/adr/ADR-0005-deployment-architecture.md) にあります。
ALB・ECS・NAT・ACM は使いません。

## 作られるもの

| 役割 | リソース | ファイル |
| --- | --- | --- |
| ネットワーク | VPC、公開サブネット 1 つ、IGW、ルートテーブル | `main.tf` |
| 入口 | セキュリティグループ（8080 を **Cloudflare の IP 帯だけ**に許可。SSH は開けない） | `main.tf` |
| バックエンド | EC2（既定 `t4g.small`、ARM64）、EIP、SSM Session Manager で操作 | `main.tf` |
| イメージ | ECR（tag は immutable、30 世代を残す lifecycle） | `main.tf`、`ecr-lifecycle.tf` |
| デプロイ | GitHub OIDC のロール、デプロイ対象タグの SSM パラメータ | `ci.tf` |
| 起動・停止 | Lambda（Discord の interactions 受付と EC2 の起動・停止）、Function URL | `lambda.tf`、`lambda/index.mjs` |
| 自動停止 | EventBridge Scheduler（既定 3 時間後に 1 回だけ停止） | `lambda.tf` |

起動時の設定は `templates/user_data.sh.tftpl` が行います。署名鍵は**初回起動時にインスタンス上で生成**し、
`/etc/iubeo/env` に置きます。Secrets Manager は使わないので、署名鍵は state に入りません。

## デプロイの流れ

1. `deploy-backend.yml`（CI）が `release-<git sha>` のイメージを ECR へ push する
1. 同じ workflow が SSM パラメータ `/iubeo-prototype/image-tag` を書き換える
1. インスタンスが次に起動したとき、`iubeo-deploy` がそのタグを pull して再起動する

インスタンスは止まっていることが多いので、CI はインスタンスを触りません。
すぐ反映したいときは、起動したあとに `outputs.tf` の `deploy_command` を実行します。

## 初回セットアップ

1. `terraform.tfvars.example` をコピーして `terraform.tfvars` を作る（このファイルは git の管理外です）
1. `terraform init` → `terraform plan` → `terraform apply`
1. `terraform output` の値を GitHub の Variables に登録する（手順は [.github/workflows/README.md](../../../.github/workflows/README.md)）
   - `github_deploy_role_arn` → `AWS_DEPLOY_ROLE_ARN`
   - `ecr_repository_url` → `ECR_REPOSITORY`
1. `deploy-backend.yml` を走らせて最初のイメージを push する
1. インスタンスを起動し、`deploy_command` で反映する

Discord の interactions エンドポイントには `control_function_url` を設定します。

## 秘密情報の扱い

- `discord_public_key`、`discord_webhook_url`、`cloudflare_api_token` は `terraform.tfvars` から渡します。
  **Lambda の環境変数として平文で入り、state にも残ります。**
- `terraform.tfstate` と `terraform.tfvars` は `.gitignore` で除外しています。コミットしないでください。
- state は現在ローカルに置いています。チームで共有する前に、暗号化されたリモート backend とロックを設定してください。
  それまでは `apply` を共有環境に対して実行しないでください。

## 注意

- セッションはバックエンドのメモリ上にしか無いので、インスタンスを停止・再起動すると**全セッションが消えます**。
  自動停止（既定 3 時間後）もこの対象です。
- EIP は停止しても解放されず、アドレスも変わりません。フロントの向き先（オリジン）を書き換える必要はありません。
- `user_data` を変えてもインスタンスは作り直しません（`user_data_replace_on_change = false`）。反映は手で行います。
