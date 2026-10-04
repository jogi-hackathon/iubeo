package session

import (
	"strconv"

	"github.com/jogi-hackathon/iubeo/backend/internal/api"
)

// オブジェクトとプレイヤーの初期配置。サンドボックス(#14)ができるまでは、フロントの開発用の配置
// (frontend/src/dev/authority.ts)を写す(state-schema.md §6)

// directoryID はディレクトリ(全員共通の 1 つ)の id
const directoryID = "directory-1"

var directoryPosition = api.Vec3{14, 0, 1}

// directoryStock は、ディレクトリの初期在庫(はっきり見分けられる 6 色)
var directoryStock = []struct{ id, color string }{
	{"3f0c6a52-8d1e-4b7a-9c35-1a2e4f6b8d01", "#e63946"},
	{"7b19d4e3-2c58-4a06-8f71-5d3a9c0e2b02", "#f4a261"},
	{"c2e85f10-6a47-4d93-b1e8-0f7d3a5c9e03", "#ffd60a"},
	{"91a4b7d6-0e3f-4c28-a5b9-6e1d8f2c4a04", "#2a9d5c"},
	{"5d8e2c93-b7a1-4f60-83d4-9a0c6e1f7b05", "#1d6fe0"},
	{"e07a1b48-3d95-4c2e-9f86-2b5d7a0c8e06", "#9b5de5"},
}

// workspacePositions は席ごとのワークスペース(personal)の位置。席 1 がフロントの開発用の位置で、
// 席 2・3 は x にずらす。机は 1.6m x 0.8m なので、2.5m 間隔で 0.9m 空く
var workspacePositions = map[int]api.Vec3{
	1: {14, 0, -5},
	2: {11.5, 0, -5},
	3: {16.5, 0, -5},
}

// spawnPositions は席ごとの初期位置(フロントの START_POSITION を席ごとに x にずらす)
var spawnPositions = map[int]api.Vec3{
	1: {0, 2, 0},
	2: {-1.5, 2, 0},
	3: {1.5, 2, 0},
}

func workspaceID(seat int) string {
	return "workspace-" + strconv.Itoa(seat)
}
