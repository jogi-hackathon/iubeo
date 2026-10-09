# AWS バックエンド基盤（Terraform）

バックエンド（Go）を **EC2 + Elastic IP** で動かす構成です。方針の理由は
[ADR-0005](../../../docs/adr/ADR-0005-deployment-architecture.md) にあります。
ALB・ECS・NAT・ACM は使いません。

## 作られるもの

| 役割 | リソース | ファイル |
| --- | --- | --- |
| ネットワーク | VPC、公開サブネット 1 つ、IGW、ルートテーブル | `main.tf` |
| 入口 | セキュリティグループ（8080 と 8081 を **Cloudflare の IP 帯だけ**に許可。SSH は開けない） | `main.tf` |
| バックエンド | EC2（既定 `t4g.small`、ARM64）、EIP、SSM Session Manager で操作 | `main.tf` |
| WISP | 同じ EC2 で動くプロキシ（8081）。出口が EIP になるので、Cloudflare の共有 IP で出るより検索エンジンに通りやすい | `main.tf`、`wisp/` |
| イメージ | ECR(backend / wisp。tag は immutable、30 世代を残す lifecycle) | `main.tf`、`ecr-lifecycle.tf` |
| デプロイ | GitHub OIDC のロール、デプロイ対象タグの SSM パラメータ(backend / wisp) | `ci.tf` |
| 起動・停止 | Lambda（Discord の interactions 受付と EC2 の起動・停止）、Function URL | `lambda.tf`、`lambda/index.mjs` |
| 自動停止 | EventBridge Scheduler（既定 3 時間後に 1 回だけ停止） | `lambda.tf` |

起動時の設定は `templates/user_data.sh.tftpl` が行います。署名鍵と WISP 用の鍵は**初回起動時にインスタンス上で生成**し、
`/etc/iubeo/env`・`/etc/iubeo/wisp-env` に置きます。Secrets Manager は使わないので、鍵は state に入りません。

## WISP（実サイトへ出るプロキシ）

同じインスタンスで `iubeo-wisp`（`wisp/` のイメージ、8081）が動きます。

- ブラウザ → `wss://<公開オリジン>/wisp/` → WISP Worker → `target` が `ec2` ならこの 8081 へ流す。
  それ以外は Cloudflare のコンテナ（iubeo-wisp）へ流すフォールバックになる
- トークンの検証は WISP 側が行う（`/etc/iubeo/wisp-env` の `IUBEO_WISP_KEY` + `IUBEO_WISP_REQUIRE_TOKEN=1`）。
  セキュリティグループは Cloudflare 帯だけだが、CF の IP は世界中で共有されるので検証を握りつぶさない
- トークンの発行は EC2 の backend が行う（`/etc/iubeo/env` の `IUBEO_WISP_*`）。
  合言葉は tfvars の `wisp_pass`。空だと backend はトークンを発行しない（WISP は動くが全て拒否する）
- Cloudflare 側の `IUBEO_WISP_KEY`/`IUBEO_WISP_PASS`（Workers の secret）とは別物。
  経路ごとに鍵が違うので、Worker は EC2 経路では検証しない（検証は必ず出口側が行う）

## デプロイの流れ

1. `deploy-backend.yml` / `deploy-wisp.yml`（CI）が `release-<git sha>` のイメージを ECR へ push する
1. 同じ workflow が SSM パラメータ `/iubeo-prototype/image-tag`・`/iubeo-prototype/wisp-image-tag` を書き換える
1. インスタンスが次に起動したとき、`iubeo-deploy` がそのタグを pull して再起動する

インスタンスは止まっていることが多いので、CI はインスタンスを触りません。
すぐ反映したいときは、起動したあとに `outputs.tf` の `deploy_command` を実行します。

## 初回セットアップ

1. `terraform.tfvars.example` をコピーして `terraform.tfvars` を作る（このファイルは git の管理外です）
1. `terraform init` → `terraform plan` → `terraform apply`
1. `terraform output` の値を GitHub の Variables に登録する（手順は [.github/workflows/README.md](../../../.github/workflows/README.md)）
   - `github_deploy_role_arn` → `AWS_DEPLOY_ROLE_ARN`
   - `ecr_repository_url` → `ECR_REPOSITORY`
   - `wisp_ecr_repository_url` → `ECR_WISP_REPOSITORY`
1. `deploy-backend.yml` と `deploy-wisp.yml` を走らせて最初のイメージを push する
1. インスタンスを起動し、`deploy_command` で反映する

Discord の interactions エンドポイントには `control_function_url` を設定します。

## 秘密情報の扱い

- `discord_public_key`、`discord_webhook_url`、`cloudflare_api_token`、`wisp_pass` は `terraform.tfvars` から渡します。
  **`wisp_pass` 以外は Lambda の環境変数として平文で入り、state にも残ります**（`wisp_pass` は user_data 経由で `/etc/iubeo/env` に入る。こちらも state に残ります）。
- `terraform.tfstate` と `terraform.tfvars` は `.gitignore` で除外しています。コミットしないでください。
- state は現在ローカルに置いています。チームで共有する前に、暗号化されたリモート backend とロックを設定してください。
  それまでは `apply` を共有環境に対して実行しないでください。

## 注意

- セッションはバックエンドのメモリ上にしか無いので、インスタンスを停止・再起動すると**全セッションが消えます**。
  自動停止（既定 3 時間後）もこの対象です。
- EIP は停止しても解放されず、アドレスも変わりません。フロントの向き先（オリジン）を書き換える必要はありません。
- `user_data` を変えてもインスタンスは作り直しません（`user_data_replace_on_change = false`）。反映は手で行います。
