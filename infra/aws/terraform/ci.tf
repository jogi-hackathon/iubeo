
resource "aws_iam_openid_connect_provider" "github" {
  url            = "https://token.actions.githubusercontent.com"
  client_id_list = ["sts.amazonaws.com"]

  thumbprint_list = ["6938fd4d98bab03faadb97b34396831e3780aea1"]
}

resource "aws_iam_role" "github_deploy" {
  name = "${local.name}-github-deploy"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Federated = aws_iam_openid_connect_provider.github.arn }
      Action    = "sts:AssumeRoleWithWebIdentity"
      Condition = {
        StringEquals = {
          "token.actions.githubusercontent.com:aud" = "sts.amazonaws.com"
        }
        StringLike = {
          "token.actions.githubusercontent.com:sub" = "repo:${split("/", var.github_repository)[0]}@${var.github_owner_id}/${var.github_repository_name}@${var.github_repository_id}:ref:refs/heads/main"
        }
      }
    }]
  })

  tags = local.common_tags
}

resource "aws_iam_role_policy" "github_deploy" {
  name = "${local.name}-github-deploy"
  role = aws_iam_role.github_deploy.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = "ecr:GetAuthorizationToken"
        Resource = "*"
      },
      {
        Effect = "Allow"
        Action = [
          "ecr:BatchCheckLayerAvailability",
          "ecr:InitiateLayerUpload",
          "ecr:UploadLayerPart",
          "ecr:CompleteLayerUpload",
          "ecr:PutImage",
          "ecr:BatchGetImage",
          "ecr:GetDownloadUrlForLayer",
        ]
        Resource = [
          aws_ecr_repository.backend.arn,
          aws_ecr_repository.wisp.arn,
        ]
      },
      {
        Effect = "Allow"
        Action = ["ssm:GetParameter", "ssm:PutParameter"]
        Resource = [
          aws_ssm_parameter.image_tag.arn,
          aws_ssm_parameter.wisp_image_tag.arn,
        ]
      },
    ]
  })
}

resource "aws_ssm_parameter" "image_tag" {
  name  = "/${local.name}/image-tag"
  type  = "String"
  value = var.image_tag

  tags = { Name = "${local.name}-image-tag" }

  lifecycle {
    ignore_changes = [value]
  }
}

resource "aws_ssm_parameter" "wisp_image_tag" {
  name  = "/${local.name}/wisp-image-tag"
  type  = "String"
  value = var.wisp_image_tag

  tags = { Name = "${local.name}-wisp-image-tag" }

  lifecycle {
    ignore_changes = [value]
  }
}
