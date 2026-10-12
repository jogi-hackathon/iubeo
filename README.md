# iubeo

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
