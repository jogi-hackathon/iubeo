# GitHub Actions から AWS へ、長期のアクセスキーを使わずに入るための設定。
# OIDC の一時資格情報だけを使う。
#
# ワークフロー側で必要なリポジトリ変数/シークレット:
#   vars.AWS_DEPLOY_ROLE_ARN   = output の github_deploy_role_arn
#   vars.ECR_REPOSITORY        = output の ecr_repository_url
#   vars.ECR_WISP_REPOSITORY   = output の wisp_ecr_repository_url
#   secrets.CLOUDFLARE_API_TOKEN
#   vars.CLOUDFLARE_ACCOUNT_ID

resource "aws_iam_openid_connect_provider" "github" {
  url            = "https://token.actions.githubusercontent.com"
  client_id_list = ["sts.amazonaws.com"]

  # AWS は GitHub の CA で検証するので、この値は実質使われないが API 上は必須
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
        # main への push でしか引き受けられないようにする。
        #
        # GitHub は sub に「オーナーとリポジトリの不変 ID」を含める:
        #   repo:<owner>@<owner_id>/<repo>@<repo_id>:ref:refs/heads/<branch>
        # ID が入るのは名前の使い回しを防ぐため。ID は変わらないので、
        # ここを固定しておけばリポジトリが移転しても意図せず一致しない。
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
        # ECR へのログインはリソースを絞れない
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
        # デプロイ対象のイメージタグを差し替える。インスタンスが起動時に読む
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

# デプロイ対象のイメージタグ。
# インスタンスは停止していることが多いので、CI はインスタンスを触らず
# ここを書き換えるだけにする。次に起動したときに新しいイメージを引く。
resource "aws_ssm_parameter" "image_tag" {
  name  = "/${local.name}/image-tag"
  type  = "String"
  value = var.image_tag

  tags = { Name = "${local.name}-image-tag" }

  # CI が書き換えるので、Terraform は値の差分を無視する
  lifecycle {
    ignore_changes = [value]
  }
}

# WISP 側のデプロイ対象タグ。image_tag と同じ仕組み
resource "aws_ssm_parameter" "wisp_image_tag" {
  name  = "/${local.name}/wisp-image-tag"
  type  = "String"
  value = var.wisp_image_tag

  tags = { Name = "${local.name}-wisp-image-tag" }

  lifecycle {
    ignore_changes = [value]
  }
}
