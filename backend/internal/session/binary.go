package session

import (
	"encoding/binary"
	"errors"
	"math"

	"github.com/jogi-hackathon/iubeo/backend/internal/api"
)

const (
	binTransform  byte = 1
	binTransforms byte = 2

	binTransformSize  = 1 + 4 + 5*4
	binTransformsHead = 1 + 8 + 1
	binPlayerSize     = 1 + 4 + 5*4
)

var le = binary.LittleEndian

var errInvalidBinary = errors.New("invalid binary message")

func putF32(b []byte, v float64) { le.PutUint32(b, math.Float32bits(float32(v))) }

func getF32(b []byte) float64 { return float64(math.Float32frombits(le.Uint32(b))) }

func decodeTransformBinary(b []byte) (api.TransformMessage, error) {
	if len(b) != binTransformSize || b[0] != binTransform {
		return api.TransformMessage{}, errInvalidBinary
	}
	return api.TransformMessage{
		Type:     api.TransformMessageTypeTransform,
		Seq:      int64(le.Uint32(b[1:])),
		Position: api.Vec3{getF32(b[5:]), getF32(b[9:]), getF32(b[13:])},
		Yaw:      getF32(b[17:]),
		Pitch:    getF32(b[21:]),
	}, nil
}

func encodeTransformsBinary(msg api.TransformsMessage, st *State) []byte {
	b := make([]byte, binTransformsHead+binPlayerSize*len(msg.Players))
	b[0] = binTransforms
	le.PutUint64(b[1:], math.Float64bits(float64(msg.ServerTime.UnixNano())/1e6))
	b[9] = byte(len(msg.Players))
	off := binTransformsHead
	for _, p := range msg.Players {
		seat := 0
		if ps := st.player(p.PlayerId); ps != nil {
			seat = ps.Seat
		}
		t := p.Transform
		b[off] = byte(seat)
		le.PutUint32(b[off+1:], uint32(t.Seq))
		if len(t.Position) == 3 {
			putF32(b[off+5:], t.Position[0])
			putF32(b[off+9:], t.Position[1])
			putF32(b[off+13:], t.Position[2])
		}
		putF32(b[off+17:], t.Yaw)
		putF32(b[off+21:], t.Pitch)
		off += binPlayerSize
	}
	return b
}

func (s *Session) ReceiveBinary(playerID string, data []byte) error {
	m, err := decodeTransformBinary(data)
	if err != nil {
		return err
	}
	return s.send(ClientTransform{PlayerID: playerID, Msg: m})
}
