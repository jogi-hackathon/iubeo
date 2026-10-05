// Package api は api/openapi.yaml から生成した型と HTTP サーバーのインターフェースを持つ。
package api

//go:generate go tool oapi-codegen -config ../../api/oapi-codegen.yaml ../../api/openapi.yaml
