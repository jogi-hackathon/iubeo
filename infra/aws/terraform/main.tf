locals {
  name = "${var.project_name}-${var.environment}"

  common_tags = merge(var.tags, {
    Environment = var.environment
  })
}

data "aws_availability_zones" "available" {
  state = "available"
}

data "aws_secretsmanager_secret_version" "signing_key" {
  secret_id = var.signing_key_secret_arn
}

resource "aws_vpc" "main" {
  cidr_block           = "10.40.0.0/16"
  enable_dns_hostnames = true
  enable_dns_support   = true

  tags = { Name = "${local.name}-vpc" }
}

resource "aws_internet_gateway" "main" {
  vpc_id = aws_vpc.main.id

  tags = { Name = "${local.name}-igw" }
}

# NAT Gateway は置かない。ゲームの通信は「クライアント → ALB → タスク」で VPC 内で完結し、
# NAT を通るのはタスク自身の外向き(ECR のイメージ取得、CloudWatch Logs、AWS API)だけなので、
# 月 45 ドルを払う価値がない。タスクは public subnet に置き、外向きは IGW を使う。
# public IP は付くが、セキュリティグループは ALB からの 8080 しか許さないので外からは触れない。
#
# ALB は 2 つ以上の AZ のサブネットを必要とするため、public subnet は 2 つ作る。
resource "aws_subnet" "public" {
  count = 2

  vpc_id                  = aws_vpc.main.id
  cidr_block              = cidrsubnet(aws_vpc.main.cidr_block, 8, count.index)
  availability_zone       = data.aws_availability_zones.available.names[count.index]
  map_public_ip_on_launch = true

  tags = { Name = "${local.name}-public-${count.index + 1}" }
}

resource "aws_route_table" "public" {
  vpc_id = aws_vpc.main.id

  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.main.id
  }

  tags = { Name = "${local.name}-public" }
}

resource "aws_route_table_association" "public" {
  count = 2

  subnet_id      = aws_subnet.public[count.index].id
  route_table_id = aws_route_table.public.id
}

resource "aws_security_group" "alb" {
  name        = "${local.name}-alb"
  description = "Public HTTP and HTTPS access to the IUBEO backend load balancer."
  vpc_id      = aws_vpc.main.id

  ingress {
    description = "HTTP for redirect to HTTPS."
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    description = "HTTPS API and WebSocket traffic."
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = { Name = "${local.name}-alb" }
}

resource "aws_security_group" "backend" {
  name        = "${local.name}-backend"
  description = "Allow the application port only from the load balancer."
  vpc_id      = aws_vpc.main.id

  ingress {
    description     = "HTTP API and WebSockets from the ALB."
    from_port       = 8080
    to_port         = 8080
    protocol        = "tcp"
    security_groups = [aws_security_group.alb.id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = { Name = "${local.name}-backend" }
}

resource "aws_lb" "backend" {
  name               = "${var.project_name}-${var.environment}"
  internal           = false
  load_balancer_type = "application"
  security_groups    = [aws_security_group.alb.id]
  subnets            = aws_subnet.public[*].id

  # タスクは 1 つなので、どちらか一方の AZ にしか居ない。ALB は 2 AZ にまたがるため、
  # これを false にするとタスクの居ない AZ に来た接続が 503 になる。必ず有効のままにする。
  # AZ 間のホップは東京リージョンでは 1ms 未満。
  enable_cross_zone_load_balancing = true

  tags = { Name = "${local.name}-alb" }
}

resource "aws_lb_target_group" "backend" {
  name        = "${var.project_name}-${var.environment}"
  port        = 8080
  protocol    = "HTTP"
  target_type = "ip"
  vpc_id      = aws_vpc.main.id

  health_check {
    enabled             = true
    path                = "/healthz"
    protocol            = "HTTP"
    matcher             = "200"
    interval            = 15
    timeout             = 5
    healthy_threshold   = 2
    unhealthy_threshold = 3
  }

  stickiness {
    enabled = true
    type    = "lb_cookie"
  }

  tags = { Name = "${local.name}-targets" }
}

resource "aws_lb_listener" "http" {
  load_balancer_arn = aws_lb.backend.arn
  port              = 80
  protocol          = "HTTP"

  default_action {
    type = "redirect"

    redirect {
      port        = "443"
      protocol    = "HTTPS"
      status_code = "HTTP_301"
    }
  }
}

resource "aws_lb_listener" "https" {
  load_balancer_arn = aws_lb.backend.arn
  port              = 443
  protocol          = "HTTPS"
  certificate_arn   = var.acm_certificate_arn
  ssl_policy        = "ELBSecurityPolicy-TLS13-1-2-2021-06"

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.backend.arn
  }
}

resource "aws_ecs_cluster" "main" {
  name = local.name

  # Container Insights はログ取り込み($0.76/GB)とカスタムメトリクス($0.30/個・月)の
  # 両方で課金される。小さいクラスタでも月数ドルになるので切る。
  # メトリクスが欲しくなったら enabled に戻す。
  setting {
    name  = "containerInsights"
    value = "disabled"
  }

  tags = { Name = "${local.name}-cluster" }
}

resource "aws_cloudwatch_log_group" "backend" {
  name              = "/ecs/${local.name}"
  retention_in_days = 7

  tags = { Name = "${local.name}-logs" }
}

resource "aws_iam_role" "execution" {
  name = "${local.name}-execution"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "ecs-tasks.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })

  tags = local.common_tags
}

resource "aws_iam_role_policy_attachment" "execution_managed" {
  role       = aws_iam_role.execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

resource "aws_iam_role_policy" "read_signing_key" {
  name = "${local.name}-read-signing-key"
  role = aws_iam_role.execution.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["secretsmanager:GetSecretValue"]
      Resource = var.signing_key_secret_arn
    }]
  })
}

resource "aws_ecr_repository" "backend" {
  name                 = "${local.name}/backend"
  image_tag_mutability = "IMMUTABLE"
  force_delete         = false

  image_scanning_configuration {
    scan_on_push = true
  }

  encryption_configuration {
    encryption_type = "AES256"
  }

  tags = { Name = "${local.name}-backend" }
}

resource "aws_ecs_task_definition" "backend" {
  family                   = local.name
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = var.task_cpu
  memory                   = var.task_memory
  execution_role_arn       = aws_iam_role.execution.arn

  # Graviton (ARM64) は vCPU・メモリの単価が x86 より約 2 割安い。
  # x86 と比べるために var.cpu_architecture で切り替えられるようにしてある。
  # イメージのアーキテクチャと一致させること(buildx の --platform)。
  runtime_platform {
    operating_system_family = "LINUX"
    cpu_architecture        = var.cpu_architecture
  }

  container_definitions = jsonencode([{
    name      = "backend"
    image     = "${aws_ecr_repository.backend.repository_url}:${var.image_tag}"
    essential = true
    portMappings = [{
      name          = "http"
      containerPort = 8080
      hostPort      = 8080
      protocol      = "tcp"
    }]
    environment = [
      { name = "IUBEO_ADDR", value = ":8080" },
      { name = "IUBEO_ALLOWED_ORIGINS", value = join(",", var.allowed_origins) },
      { name = "IUBEO_MATCH_SIZE", value = "3" },
    ]
    secrets = [{
      name      = "IUBEO_SIGNING_KEY"
      valueFrom = var.signing_key_secret_arn
    }]
    logConfiguration = {
      logDriver = "awslogs"
      options = {
        "awslogs-group"         = aws_cloudwatch_log_group.backend.name
        "awslogs-region"        = var.aws_region
        "awslogs-stream-prefix" = "backend"
      }
    }
  }])

  depends_on = [aws_iam_role_policy_attachment.execution_managed, aws_iam_role_policy.read_signing_key]

  tags = { Name = "${local.name}-task" }
}

resource "aws_ecs_service" "backend" {
  name             = "${local.name}-backend"
  cluster          = aws_ecs_cluster.main.id
  task_definition  = aws_ecs_task_definition.backend.arn
  desired_count    = var.desired_count
  launch_type      = "FARGATE"
  platform_version = "LATEST"

  deployment_minimum_healthy_percent = 100
  deployment_maximum_percent         = 200
  health_check_grace_period_seconds  = 60
  wait_for_steady_state              = true

  network_configuration {
    # NAT Gateway を置かないので public subnet に置き、外向きは IGW から出す。
    # インバウンドは backend のセキュリティグループが ALB からの 8080 だけに絞っている。
    subnets          = aws_subnet.public[*].id
    security_groups  = [aws_security_group.backend.id]
    assign_public_ip = true
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.backend.arn
    container_name   = "backend"
    container_port   = 8080
  }

  lifecycle {
    ignore_changes = [desired_count]
  }

  depends_on = [aws_lb_listener.https, aws_iam_role_policy.read_signing_key]

  tags = { Name = "${local.name}-backend" }
}
