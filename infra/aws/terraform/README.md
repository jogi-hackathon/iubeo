# AWS backend infrastructure

> **このモジュールは現在使っていません（休眠中）。**
>
> バックエンドは Cloudflare Containers で動かす方針にしたため、いまはデプロイしていません。
> 判断の理由は [ADR-0005](../../../docs/adr/ADR-0005-deployment-architecture.md) にあります。
> 常時起動のコストが問題になった場合や、複数インスタンスに広げるときに戻ってこられるよう、
> 検証済みの状態で残してあります（`terraform validate` が通ることは確認済み）。
> 使う場合は Secrets Manager と ACM を用意して `terraform apply` してください。

Terraform manages the AWS foundation, container registry and ECS/Fargate service for the Go backend. The default region is Tokyo (`ap-northeast-1`).

## Why there is no NAT Gateway

The ECS task runs in a **public** subnet with a public IP, and there are no private subnets.

A NAT Gateway in Tokyo costs about **$45/month** (plus $0.062/GB), and it is the single most expensive part of this stack — more than the Fargate task itself. Game traffic never uses it: players connect to the ALB, and the ALB forwards to the task inside the VPC. The NAT would only carry the task's own outbound calls (ECR image pulls, CloudWatch Logs, AWS APIs).

Running the task in a public subnet removes that cost without touching the player-facing path. The public IP does not expose the service: the backend security group only allows port 8080 from the ALB security group. The trade-offs are that the task gets an IP that changes when it is replaced, and outbound traffic leaves through the internet gateway rather than a NAT.

Alternatives considered: VPC interface endpoints are not cheaper (1 endpoint = $0.014/hour ≈ $10/month, and ECR needs two plus CloudWatch Logs, across two AZs = about $61/month).

The task must keep a public IP (or gain a NAT Gateway or VPC endpoints) because the `awslogs` log driver sends logs over the task's network interface. Removing the public IP without adding one of those would leave the task unable to deliver logs or pull images.

The ALB still spans two AZs because that is required, and the task sits in only one of them, so `enable_cross_zone_load_balancing` must stay `true`. Otherwise connections that land on the AZ without a task return 503. The cross-AZ hop is under a millisecond in Tokyo.

## Graviton (ARM64)

The task defaults to `cpu_architecture = "ARM64"` (Graviton). In Tokyo, ARM64 Fargate costs **$0.04045 per vCPU-hour and $0.00442 per GB-hour**, against **$0.05056 and $0.00553** for x86_64 — about 20% less for the same 0.5 vCPU / 1 GB task ($17.99 instead of $22.49 per month).

**The image platform must match the task architecture.** Building for the wrong one makes the task fail to start:

```sh
docker buildx build --platform linux/arm64 -t "$REPOSITORY:release-arm" --push ./backend
```

`var.cpu_architecture` exists so the two can be compared. `backend/cmd/loadtest` measures the player-visible latency (RTT) and the broadcast interval against either deployment and renders a comparison chart; see [backend/cmd/loadtest/README.md](../../../backend/cmd/loadtest/README.md).

Do not compare the two architectures by running the `linux/amd64` container on an Apple Silicon Mac: the emulation makes x86_64 look far slower than it is on Fargate. Measure on Fargate.

## Prerequisites

- Terraform >= 1.6 and AWS CLI credentials with permissions for VPC, EC2 networking, ALB, ECS, ECR, IAM, CloudWatch Logs, and Secrets Manager.
- A registered domain and an ACM certificate in `ap-northeast-1` covering the backend hostname. The certificate is managed outside this module.
- An AWS Secrets Manager secret containing a randomly generated `IUBEO_SIGNING_KEY` of at least 32 bytes. Do not put its value in Terraform variables or source control. ECS injects the secret at task startup. Terraform state may contain the secret value because it reads the secret to configure the task; secure and restrict access to state.
- A remote Terraform state backend with encryption and locking configured before team use. Do not commit local state or plan files.

## Bootstrap

1. Copy `terraform.tfvars.example` to `terraform.tfvars` and set at least one HTTPS origin, the secret ARN, and the ACM certificate ARN. The server exits at startup if `allowed_origins` is empty, so the ECS task will crash-loop until a real frontend origin is set.

1. Initialize and review the plan:

   ```sh
   terraform init
   terraform fmt -check
   terraform validate
   terraform plan
   ```

1. Create the foundation and ECR repository:

   ```sh
   terraform apply -target=aws_ecr_repository.backend
   ```

1. Build and push the first image using an immutable tag. `backend/Dockerfile` builds with Go 1.27.1; ensure the CI/deployment Docker builder supports that Go release.

   ```sh
   REPOSITORY="$(terraform output -raw ecr_repository_url)"
   aws ecr get-login-password --region ap-northeast-1 | docker login --username AWS --password-stdin "${REPOSITORY%%/*}"
   docker buildx build --platform linux/amd64 -t "$REPOSITORY:release-bootstrap" --push ./backend
   ```

1. Set `image_tag = "release-bootstrap"`, then run a full `terraform apply` to create the ALB and ECS service.

The two-stage bootstrap is required because ECS cannot pull an image before the ECR repository has been created and populated. For later releases, push `release-<git-sha>`, set `image_tag` to that immutable tag, and review/apply Terraform. Old release images are pruned by the ECR lifecycle policy.

## Constraints / not production-ready yet

- The backend currently keeps sessions and matchmaking state in process memory. This template uses one task for a prototype; it is not highly available and active sessions are lost on replacement. Do not increase `desired_count` until shared session coordination/state is implemented. ALB cookie stickiness does not make memory state shared.
- The frontend does not yet call the backend API or WebSocket endpoint. Set up frontend API/WSS configuration and an HTTPS DNS name pointing at the ALB before exposing the app.
- The ACM certificate must cover the hostname users access. Create the DNS record outside this module or add Route 53 resources once the domain/zone is known.
- Configure/test ALB idle timeout with the WebSocket ping interval, and measure p50/p95 RTT and reconnect behavior from Japanese networks.
- The task's public IP is billed as an in-use public IPv4 address ($0.005/hour), and it changes when the task is replaced. The ALB target group registers the task by IP, so this is handled automatically.
- State uses a local backend until an S3 backend is configured. Do not run `apply` for shared or production use before setting up encrypted remote state and locking.
