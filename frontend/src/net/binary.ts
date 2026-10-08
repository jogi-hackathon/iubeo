import type {ServerMessageOf, TransformMessage} from "./types";

/**
 * 位置のメッセージ(transform / transforms)のバイナリ形式。サーバーの backend/internal/session/binary.go と同じ。
 * 量のほとんどは 20Hz の位置なので、ここだけをバイナリにする(JSON の約 1/5。state-schema.md §7.5)。
 * すべてリトルエンディアン。小数は float32。
 *
 *   transform  (クライアント → サーバー, 25B): type=1 u8 | seq u32 | x y z f32 | yaw f32 | pitch f32
 *   transforms (サーバー → クライアント, 10+25n B): type=2 u8 | serverTime f64(Unix ミリ秒) | n u8 |
 *              n × (seat u8 | seq u32 | x y z f32 | yaw f32 | pitch f32)
 *
 * プレイヤーは playerId ではなく席(seat)で表す。席と playerId の対応は snapshot(JSON)で知る
 */
const TYPE_TRANSFORM = 1;
const TYPE_TRANSFORMS = 2;
const TRANSFORM_SIZE = 1 + 4 + 5 * 4;
const TRANSFORMS_HEAD = 1 + 8 + 1;
const PLAYER_SIZE = 1 + 4 + 5 * 4;

type TransformsMessage = ServerMessageOf<"transforms">;

/** transform を 25 バイトにする */
export const encodeTransform = (m: TransformMessage): ArrayBuffer => {
  const buf = new ArrayBuffer(TRANSFORM_SIZE);
  const v = new DataView(buf);
  v.setUint8(0, TYPE_TRANSFORM);
  v.setUint32(1, m.seq >>> 0, true);
  v.setFloat32(5, m.position[0] ?? 0, true);
  v.setFloat32(9, m.position[1] ?? 0, true);
  v.setFloat32(13, m.position[2] ?? 0, true);
  v.setFloat32(17, m.yaw, true);
  v.setFloat32(21, m.pitch, true);
  return buf;
};

/**
 * バイナリの transforms を、JSON と同じ形のメッセージに直す。席が分からないプレイヤー(snapshot の前など)は除く。
 * 形が合わなければ null
 */
export const decodeTransforms = (
  buf: ArrayBuffer,
  playerOfSeat: ReadonlyMap<number, string>,
): TransformsMessage | null => {
  if (buf.byteLength < TRANSFORMS_HEAD) {
    return null;
  }
  const v = new DataView(buf);
  const n = v.getUint8(9);
  if (
    v.getUint8(0) !== TYPE_TRANSFORMS ||
    buf.byteLength !== TRANSFORMS_HEAD + n * PLAYER_SIZE
  ) {
    return null;
  }
  const players: TransformsMessage["players"] = [];
  for (let i = 0; i < n; i++) {
    const o = TRANSFORMS_HEAD + i * PLAYER_SIZE;
    const playerId = playerOfSeat.get(v.getUint8(o));
    if (playerId === undefined) {
      continue;
    }
    players.push({
      playerId,
      transform: {
        seq: v.getUint32(o + 1, true),
        position: [
          v.getFloat32(o + 5, true),
          v.getFloat32(o + 9, true),
          v.getFloat32(o + 13, true),
        ],
        yaw: v.getFloat32(o + 17, true),
        pitch: v.getFloat32(o + 21, true),
      },
    });
  }
  return {
    type: "transforms",
    serverTime: new Date(v.getFloat64(1, true)).toISOString(),
    players,
  };
};
