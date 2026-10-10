locals {
  name = "${var.project_name}-${var.environment}"

  common_tags = merge(var.tags, {
    Environment = var.environment
  })

  cloudflare_ipv4 = jsondecode(data.http.cloudflare_ips.response_body).result.ipv4_cidrs
}

data "aws_availability_zones" "available" {
  state = "available"
}

# AL2023 の ARM64 AMI。SSM の公開パラメータを使うと常に最新が取れる
data "aws_ssm_parameter" "al2023_arm64" {
  name = "/aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-arm64"
}

data "http" "cloudflare_ips" {
  url = "https://api.cloudflare.com/client/v4/ips"
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

resource "aws_subnet" "public" {
  vpc_id                  = aws_vpc.main.id
  cidr_block              = cidrsubnet(aws_vpc.main.cidr_block, 8, 0)
  availability_zone       = data.aws_availability_zones.available.names[0]
  map_public_ip_on_launch = true

  tags = { Name = "${local.name}-public" }
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
  subnet_id      = aws_subnet.public.id
  route_table_id = aws_route_table.public.id
}

resource "aws_security_group" "backend" {
  name        = "${local.name}-backend"
  description = "Allow the game server only from Cloudflare."
  vpc_id      = aws_vpc.main.id

  ingress {
    description = "HTTP API and WebSockets from Cloudflare."
    from_port   = 8080
    to_port     = 8080
    protocol    = "tcp"
    cidr_blocks = local.cloudflare_ipv4
  }

  ingress {
    description = "WISP proxy from Cloudflare."
    from_port   = 8081
    to_port     = 8081
    protocol    = "tcp"
    cidr_blocks = local.cloudflare_ipv4
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = { Name = "${local.name}-backend" }
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

resource "aws_ecr_repository" "wisp" {
  name                 = "${local.name}/wisp"
  image_tag_mutability = "IMMUTABLE"
  force_delete         = false

  image_scanning_configuration {
    scan_on_push = true
  }

  encryption_configuration {
    encryption_type = "AES256"
  }

  tags = { Name = "${local.name}-wisp" }
}

resource "aws_iam_role" "instance" {
  name = "${local.name}-instance"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "ec2.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })

  tags = local.common_tags
}

resource "aws_iam_role_policy_attachment" "instance_ecr" {
  role       = aws_iam_role.instance.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryReadOnly"
}

resource "aws_iam_role_policy_attachment" "instance_ssm" {
  role       = aws_iam_role.instance.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

resource "aws_iam_role_policy" "instance_read_image_tag" {
  name = "${local.name}-read-image-tag"
  role = aws_iam_role.instance.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = "ssm:GetParameter"
      Resource = [
        aws_ssm_parameter.image_tag.arn,
        aws_ssm_parameter.wisp_image_tag.arn,
      ]
    }]
  })
}

resource "aws_iam_instance_profile" "instance" {
  name = "${local.name}-instance"
  role = aws_iam_role.instance.name
}

resource "aws_instance" "backend" {
  ami                    = data.aws_ssm_parameter.al2023_arm64.value
  instance_type          = var.instance_type
  subnet_id              = aws_subnet.public.id
  vpc_security_group_ids = [aws_security_group.backend.id]
  iam_instance_profile   = aws_iam_instance_profile.instance.name

  # t4g はバースト型。クレジットが切れるとスロットルしてレイテンシが乱れるので、
  # unlimited にして「スロットルせず余剰分を課金で買う」方にする
  credit_specification {
    cpu_credits = "unlimited"
  }

  root_block_device {
    volume_type = "gp3"
    volume_size = var.root_volume_gb
    encrypted   = true
  }

  user_data = templatefile("${path.module}/templates/user_data.sh.tftpl", {
    region                   = var.aws_region
    registry                 = split("/", aws_ecr_repository.backend.repository_url)[0]
    ecr_repository           = aws_ecr_repository.backend.repository_url
    wisp_repository          = aws_ecr_repository.wisp.repository_url
    image_tag                = var.image_tag
    wisp_image_tag           = var.wisp_image_tag
    allowed_origins          = join(",", var.allowed_origins)
    container_memory         = var.container_memory_mib
    image_tag_parameter      = aws_ssm_parameter.image_tag.name
    wisp_image_tag_parameter = aws_ssm_parameter.wisp_image_tag.name
    wisp_enabled             = var.wisp_enabled
    wisp_url                 = "${replace(var.allowed_origins[0], "https://", "wss://")}/wisp/"
  })

  user_data_replace_on_change = false

  lifecycle {
    ignore_changes = [ami]
  }

  tags = { Name = "${local.name}-backend" }
}

resource "aws_eip" "backend" {
  domain = "vpc"

  tags = { Name = "${local.name}-backend" }
}

resource "aws_eip_association" "backend" {
  instance_id   = aws_instance.backend.id
  allocation_id = aws_eip.backend.id
}
