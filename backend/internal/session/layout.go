package session

import (
	"math"
	"strconv"

	"github.com/jogi-hackathon/iubeo/backend/internal/api"
)

const directoryID = "directory-1"

// CPU が歩く場所(区画ローカルの足元の位置)。フロントの SandboxScene/layout.ts の値を写したもので、
// 見た目のためだけに使う(判定に距離は使わない)。ディレクトリは全員の区画が接する中心にある
var (
	cpuLocalSpawn     = [3]float64{0, 0.05, 4.93}
	cpuLocalDirectory = [3]float64{0, 0.05, 1.1}
	cpuLocalDesk      = [3]float64{3.5, 0.05, 5.43}
	cpuLocalCanvas    = [3]float64{-4, 0.05, 3.0}
)

// cpuSeatYaw は区画 seat の、ローカルからワールドへの回転(Y 軸まわり)
func cpuSeatYaw(seat int) float64 {
	return float64(seat-1) * 2 * math.Pi / 3
}

// cpuWaypoint は区画ローカルの位置を、座席 seat の分だけ回してワールドへ置く(frontend の toWorld と同じ規約)
func cpuWaypoint(seat int, local [3]float64) [3]float64 {
	yaw := cpuSeatYaw(seat)
	cos, sin := math.Cos(yaw), math.Sin(yaw)
	return [3]float64{
		local[0]*cos + local[2]*sin,
		local[1],
		-local[0]*sin + local[2]*cos,
	}
}

// cpuStation はタスク種別ごとの作業台(の手前)への区画ローカルの位置
func cpuStation(t api.TaskType) [3]float64 {
	switch t {
	case api.ImageGeneration:
		return cpuLocalCanvas
	default:
		// write・read_edit・web_search は机(PC は机の上)で作業する
		return cpuLocalDesk
	}
}

var directoryStock = []struct{ id, color string }{
	{"3f0c6a52-8d1e-4b7a-9c35-1a2e4f6b8d01", "#e63946"},
	{"7b19d4e3-2c58-4a06-8f71-5d3a9c0e2b02", "#f4a261"},
	{"c2e85f10-6a47-4d93-b1e8-0f7d3a5c9e03", "#ffd60a"},
	{"91a4b7d6-0e3f-4c28-a5b9-6e1d8f2c4a04", "#2a9d5c"},
	{"5d8e2c93-b7a1-4f60-83d4-9a0c6e1f7b05", "#1d6fe0"},
	{"e07a1b48-3d95-4c2e-9f86-2b5d7a0c8e06", "#9b5de5"},
}

func workspaceID(seat int) string {
	return "workspace-" + strconv.Itoa(seat)
}

func canvasID(seat int) string {
	return "canvas-" + strconv.Itoa(seat)
}

func pcID(seat int) string {
	return "pc-" + strconv.Itoa(seat)
}

func lighterStandID(seat int) string {
	return "lighter_stand-" + strconv.Itoa(seat)
}

func lighterID(seat int) string {
	return "lighter-" + strconv.Itoa(seat)
}
