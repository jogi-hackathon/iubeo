output "ecr_repository_url" {
  description = "ECR repository URL. Push the backend container image here before applying the ECS service."
  value       = aws_ecr_repository.backend.repository_url
}

output "backend_alb_dns_name" {
  description = "Public ALB hostname for the backend API and WebSocket endpoint."
  value       = aws_lb.backend.dns_name
}

output "ecs_cluster_name" {
  description = "ECS cluster name."
  value       = aws_ecs_cluster.main.name
}

output "ecs_service_name" {
  description = "ECS service name."
  value       = aws_ecs_service.backend.name
}
