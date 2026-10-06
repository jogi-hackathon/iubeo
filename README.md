# iubeo

## デプロイ

- フロント(React + Vite の SPA): Cloudflare Workers Static Assets。`cf` でデプロイする。設定は `frontend/cloudflare.config.ts`
- バックエンド(Go): AWS ECS/Fargate(`ap-northeast-1`)。インフラとタスク定義は `infra/aws/terraform/` の Terraform で管理する

判断の理由と制約は [ADR-0005](docs/adr/ADR-0005-deployment-architecture.md)、AWS 側の手順は [infra/aws/terraform/README.md](infra/aws/terraform/README.md) を参照する。

### フロント

```sh
cd frontend
pnpm install
pnpm cf:preview   # ビルドとデプロイ内容の検証(アップロードなし)
pnpm deploy       # Cloudflare へデプロイ(認証が必要)
```

### バックエンド

```sh
cd infra/aws/terraform
cp terraform.tfvars.example terraform.tfvars   # 値を埋める
terraform init
terraform apply
```

コンテナイメージのビルドとプッシュは [infra/aws/terraform/README.md](infra/aws/terraform/README.md) の手順に従う。
