/**
 * 伝票の紙の帯。スロット(原点)から +Y へ伸び、手前(+Z)へ巻く。
 * 頂点は帯に沿って STRIP_SEGMENTS+1 段 × 左右 2 列。毎フレーム位置と uv を書き直す
 */
export const SLIP_WIDTH = 0.058;
export const SLIP_LENGTH = 0.12;
export const STRIP_SEGMENTS = 24;
export const STRIP_VERTEX_COUNT = (STRIP_SEGMENTS + 1) * 2;

export type StripShape = {
  /** 出ている長さ(m) */
  length: number;
  /** 先端での巻きの角度(rad)。根元から二乗で増える */
  curl: number;
  /** 紙全体の長さ。uv の v はこれに対する「先端からの距離」で決める */
  total?: number;
};

export const stripIndices = (): Uint16Array => {
  const indices = new Uint16Array(STRIP_SEGMENTS * 6);
  for (let i = 0; i < STRIP_SEGMENTS; i++) {
    const lb = i * 2;
    const rb = lb + 1;
    const lt = lb + 2;
    const rt = lb + 3;
    indices.set([lb, rb, lt, rb, rt, lt], i * 6);
  }
  return indices;
};

/**
 * 帯の形を書く。positions / normals は STRIP_VERTEX_COUNT*3、uvs は STRIP_VERTEX_COUNT*2。
 * 先端(s = length)が紙の上端(v = 1)で、根元へ向かうほど下の行になる。
 * 紙の上端から total より遠い部分(まだ出ていない次の紙)は v < 0 になるので、呼ぶ側で total 以下に収める
 */
export const writeStrip = (
  positions: Float32Array,
  normals: Float32Array,
  uvs: Float32Array,
  {length, curl, total = SLIP_LENGTH}: StripShape,
): void => {
  const ds = length / STRIP_SEGMENTS;
  let y = 0;
  let z = 0;
  for (let i = 0; i <= STRIP_SEGMENTS; i++) {
    const s = i * ds;
    const u = total > 0 ? s / total : 0;
    const angle = curl * u * u;
    const ny = -Math.sin(angle);
    const nz = Math.cos(angle);
    const v = 1 - (length - s) / total;
    for (const side of [0, 1]) {
      const k = i * 2 + side;
      positions[k * 3] = (side === 0 ? -1 : 1) * (SLIP_WIDTH / 2);
      positions[k * 3 + 1] = y;
      positions[k * 3 + 2] = z;
      normals[k * 3] = 0;
      normals[k * 3 + 1] = ny;
      normals[k * 3 + 2] = nz;
      uvs[k * 2] = side;
      uvs[k * 2 + 1] = v;
    }
    if (i < STRIP_SEGMENTS) {
      const next = curl * ((s + ds) / total) ** 2;
      const mid = (angle + next) / 2;
      y += ds * Math.cos(mid);
      z += ds * Math.sin(mid);
    }
  }
};
