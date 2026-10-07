package api

import (
	"encoding/json"
	"testing"
	"time"
)

// TestPayloadBudget は WebSocket で配るメッセージの実サイズを測る。
//
// このサイズがそのまま転送料と ALB の LCU になる(20Hz で全員に配るため)。
// フィールドを足したり double を増やしたりすると、ここが増えてコストに直結する。
// 上限を超えたら、増えたバイト数が妥当か考えてから更新すること。
//
// 3人セッション(既定の IUBEO_MATCH_SIZE)の 1 配信あたりの予算。
const (
	transformsBudgetBytes = 700
	transformBudgetBytes  = 180
)

func TestPayloadBudget(t *testing.T) {
	// 実際の player.NewID() と同じ長さ(rand.Text() は 26 文字)
	const playerIDLen = 26
	id := func(seed byte) PlayerId {
		b := make([]byte, playerIDLen)
		for i := range b {
			b[i] = 'A' + (seed+byte(i))%26
		}
		return PlayerId(b)
	}
	pos := func() Vec3 { return Vec3{1.2345678901234567, -0.5, 3.141592653589793} }

	down := TransformsMessage{Type: Transforms, ServerTime: time.Now()}
	for i, pid := range []PlayerId{id(0), id(1), id(2)} {
		down.Players = append(down.Players, struct {
			PlayerId  PlayerId  `json:"playerId"`
			Transform Transform `json:"transform"`
		}{PlayerId: pid, Transform: Transform{
			Position: pos(), Yaw: 1.5707963267948966, Pitch: -0.1234567890123456, Seq: int64(1000 + i),
		}})
	}
	b, err := json.Marshal(down)
	if err != nil {
		t.Fatal(err)
	}
	t.Logf("transforms 3人(下り) = %d バイト / 1人あたり %.0f バイト", len(b), float64(len(b))/3)
	if len(b) > transformsBudgetBytes {
		t.Errorf("transforms が %d バイトで予算 %d を超えた", len(b), transformsBudgetBytes)
	}

	up := TransformMessage{Type: TransformMessageTypeTransform, Position: pos(),
		Yaw: 1.5707963267948966, Pitch: -0.1234567890123456, Seq: 1000}
	bu, err := json.Marshal(up)
	if err != nil {
		t.Fatal(err)
	}
	t.Logf("transform 自分(上り) = %d バイト", len(bu))
	if len(bu) > transformBudgetBytes {
		t.Errorf("transform が %d バイトで予算 %d を超えた", len(bu), transformBudgetBytes)
	}

	// 20Hz で 1 クライアントが送受信する量(KB/s)
	downKB := float64(len(b)) * 20 / 1024
	upKB := float64(len(bu)) * 20 / 1024
	t.Logf("1クライアントあたり: 下り %.1f KB/s + 上り %.1f KB/s = %.1f KB/s", downKB, upKB, downKB+upKB)
}
