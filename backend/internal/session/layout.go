package session

import "strconv"

const directoryID = "directory-1"

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
