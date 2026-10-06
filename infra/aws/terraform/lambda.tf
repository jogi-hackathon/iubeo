# EC2 を Discord の /start /stop で起動・停止する Lambda。
#
# 目的は主に「自動停止」で、起動しっぱなしで $0.67/日 が漏れるのを防ぐこと。
# Discord の公開鍵を入れるまでは Function URL を叩いても 401 になるが、
# 直接 invoke で start / stop は動く。

data "aws_caller_identity" "current" {}

data "archive_file" "control" {
  type        = "zip"
  source_file = "${path.module}/lambda/index.mjs"
  output_path = "${path.module}/.terraform/tmp/control.zip"
}

resource "aws_iam_role" "control" {
  name = "${local.name}-control"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })

  tags = local.common_tags
}

resource "aws_iam_role_policy" "control" {
  name = "${local.name}-control"
  role = aws_iam_role.control.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["ec2:StartInstances", "ec2:StopInstances"]
        Resource = "arn:aws:ec2:${var.aws_region}:${data.aws_caller_identity.current.account_id}:instance/${aws_instance.backend.id}"
      },
      {
        # 起動待ちで状態を見るために要る。DescribeInstances は
        # リソース単位の制限が効かないので "*" にする
        Effect   = "Allow"
        Action   = "ec2:DescribeInstances"
        Resource = "*"
      },
      {
        # ヘルスチェックは Lambda から 8080 に届かない(SG が Cloudflare の
        # IP しか許していない)ので、SSM でインスタンスの中から curl する
        Effect   = "Allow"
        Action   = ["ssm:SendCommand", "ssm:GetCommandInvocation"]
        Resource = "*"
      },
      {
        # 自動停止の 1 回スケジュールを作り直せるようにする
        Effect   = "Allow"
        Action   = ["scheduler:CreateSchedule", "scheduler:DeleteSchedule", "scheduler:GetSchedule"]
        Resource = "arn:aws:scheduler:${var.aws_region}:${data.aws_caller_identity.current.account_id}:schedule/default/${local.name}-autostop"
      },
      {
        # スケジュールが Lambda を呼ぶために iam:PassRole が要る
        Effect   = "Allow"
        Action   = "iam:PassRole"
        Resource = aws_iam_role.scheduler.arn
      },
      {
        Effect   = "Allow"
        Action   = ["logs:CreateLogGroup", "logs:CreateLogStream", "logs:PutLogEvents"]
        Resource = "arn:aws:logs:${var.aws_region}:${data.aws_caller_identity.current.account_id}:*"
      }
    ]
  })
}

# スケジュールから Lambda を呼ぶためのロール。
# Lambda 自身のロールとは別に要る(呼ばれる側を許すため)
resource "aws_iam_role" "scheduler" {
  name = "${local.name}-scheduler"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "scheduler.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })

  tags = local.common_tags
}

resource "aws_iam_role_policy" "scheduler" {
  name = "${local.name}-scheduler"
  role = aws_iam_role.scheduler.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = "lambda:InvokeFunction"
      Resource = aws_lambda_function.control.arn
    }]
  })
}

resource "aws_lambda_function" "control" {
  function_name    = "${local.name}-control"
  role             = aws_iam_role.control.arn
  handler          = "index.handler"
  runtime          = "nodejs22.x"
  architectures    = ["arm64"]
  timeout          = 350
  memory_size      = 256
  filename         = data.archive_file.control.output_path
  source_code_hash = data.archive_file.control.output_base64sha256

  environment {
    variables = {
      INSTANCE_ID       = aws_instance.backend.id
      AUTO_STOP_HOURS   = tostring(var.auto_stop_hours)
      SCHEDULE_NAME     = "${local.name}-autostop"
      SCHEDULE_ROLE_ARN = aws_iam_role.scheduler.arn
      # 自分の ARN は自分の中で参照できない(自己参照)ので組み立てる
      LAMBDA_ARN                 = "arn:aws:lambda:${var.aws_region}:${data.aws_caller_identity.current.account_id}:function:${local.name}-control"
      DISCORD_PUBLIC_KEY         = var.discord_public_key
      DISCORD_WEBHOOK_URL        = var.discord_webhook_url
      CLOUDFLARE_API_TOKEN       = var.cloudflare_api_token
      CLOUDFLARE_ACCOUNT_ID      = var.cloudflare_account_id
      CLOUDFLARE_KV_NAMESPACE_ID = var.cloudflare_kv_namespace_id
      EC2_ORIGIN                 = "http://${aws_eip.backend.public_ip}:8080"
    }
  }

  tags = { Name = "${local.name}-control" }
}

# Discord の interactions エンドポイント。
# 署名検証があるので公開してよい(検証に失敗したら 401 を返す)
resource "aws_lambda_function_url" "control" {
  function_name      = aws_lambda_function.control.function_name
  authorization_type = "NONE"
}

resource "aws_lambda_permission" "function_url" {
  statement_id           = "AllowFunctionUrl"
  action                 = "lambda:InvokeFunctionUrl"
  function_name          = aws_lambda_function.control.function_name
  principal              = "*"
  function_url_auth_type = "NONE"
}

# Discord の 3 秒制限を避けるため、自分を非同期で呼んで実処理を任せる
resource "aws_iam_role_policy" "control_self_invoke" {
  name = "${local.name}-control-self-invoke"
  role = aws_iam_role.control.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = "lambda:InvokeFunction"
      Resource = "arn:aws:lambda:${var.aws_region}:${data.aws_caller_identity.current.account_id}:function:${local.name}-control"
    }]
  })
}

# EC2 の状態変化で Lambda を呼ぶ。
# 「コマンドを実行した時点」ではなく「実際に止まった時点」で Discord に投稿したいので、
# ポーリングではなくイベントで受ける。CLI から止めた場合も拾える。
resource "aws_cloudwatch_event_rule" "instance_state" {
  name        = "${local.name}-instance-state"
  description = "Notify Discord when the backend instance starts or stops."

  event_pattern = jsonencode({
    source        = ["aws.ec2"]
    "detail-type" = ["EC2 Instance State-change Notification"]
    detail = {
      "instance-id" = [aws_instance.backend.id]
      state         = ["running", "stopped"]
    }
  })

  tags = local.common_tags
}

resource "aws_cloudwatch_event_target" "instance_state" {
  rule = aws_cloudwatch_event_rule.instance_state.name
  arn  = aws_lambda_function.control.arn
}

resource "aws_lambda_permission" "eventbridge" {
  statement_id  = "AllowEventBridge"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.control.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.instance_state.arn
}
