output "ecr_repository_url" {
  description = "ECR repository URL. Push the backend container image here, then run the deploy script on the instance."
  value       = aws_ecr_repository.backend.repository_url
}

output "backend_eip" {
  description = "Elastic IP of the backend. Point the origin hostname (for example iubeo-origin) at this A record. It does not change when the instance is stopped or started."
  value       = aws_eip.backend.public_ip
}

output "backend_instance_id" {
  description = "Instance ID, for starting and stopping it on demand."
  value       = aws_instance.backend.id
}

output "deploy_command" {
  description = "Command that pulls the current image tag on the instance and restarts the server. Run it after pushing a new image."
  value       = "aws ssm send-command --region ${var.aws_region} --document-name AWS-RunShellScript --targets Key=instanceids,Values=${aws_instance.backend.id} --parameters commands=/usr/local/bin/iubeo-deploy"
}
