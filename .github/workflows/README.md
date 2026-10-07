# CI/CD

## ワークフロー

| ファイル | きっかけ | 内容 |
| --- | --- | --- |
| `ci.yml` | PR と、`deploy-*.yml` からの呼び出し（`workflow_call`） | backend の gofmt/build/vet/test、frontend の typecheck/lint/test/build、terraform の fmt/validate |
| `preview.yml` | **main に向けた PR**（`frontend/**` の変更） | Worker Preview を作り、URL を PR にコメント |
| `deploy-cloudflare.yml` | main への push（`frontend/**` か `backend/**`）、手動実行 | CI → バックエンド Worker（backend に変更があるときだけ）→ フロント Worker |
| `deploy-backend.yml` | main への push（`backend/**`）、手動実行 | CI → arm64 のイメージを ECR へ push し、デプロイ対象のタグを更新 |

### デプロイは CI の成功が前提

`deploy-*.yml` は最初のジョブで `ci.yml` を呼び出し、`needs: ci` でデプロイを待たせています。
CI が赤なら、その run ではデプロイされません。

main への push で CI を単独で走らせることはしていません（デプロイの run の中で走る）。
そのため、デプロイ対象外のパスだけを変えた push では main 上の CI は走りません。
変更は PR の段階で CI を通す前提です。

### 必須にする設定（リポジトリの Settings 側・未設定）

ワークフローの中で CI を通しても、**PR を CI なしで merge できる状態のままだと意味が薄くなります**。
Settings → Rules → Rulesets の `main` に、`ci.yml` の次の各ジョブを必須のステータスチェックとして追加してください
（チェック名はジョブ名の `backend` / `frontend` / `terraform`。候補に出ない場合は一度 PR で CI を走らせると出ます）。

### `deploy-cloudflare` の backend 判定

`backend/**` も `.github/workflows/deploy-cloudflare.yml` も変わっていない push では、
バックエンド Worker を再デプロイしません。frontend だけの変更でコンテナを作り直すと、
メモリ上のセッションが消えるためです。手動実行（`workflow_dispatch`）と判定できない push では、
安全側に倒して再デプロイします。

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

## OIDC の信頼ポリシー

`deploy-backend.yml` は GitHub OIDC で一時資格情報を受け取ります。信頼ポリシーは
**main への push だけ**に絞ってあります（`infra/aws/terraform/ci.tf`）。

リポジトリの OIDC sub は不変 ID 形式です（`use_immutable_subject: true`）。sub は次のとおりです。

```text
repo:jogi-hackathon@331157460/iubeo@1378523961:ref:refs/heads/main
```

ID を含めているのは、名前の使い回しを防ぐためです。

### ブランチから試したいとき

上の sub が `main` に一致しないので、ブランチから `deploy-backend.yml` を試すと
OIDC の引き受けに失敗します。試したい場合は `infra/aws/terraform/ci.tf` の
`StringLike` の sub 末尾を `ref:refs/heads/main` から `*` に変えて `terraform apply` してください。
作業が終わったら必ず元に戻してください。

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
