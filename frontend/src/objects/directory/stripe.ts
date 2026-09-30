// 紙を重ねた束の側面(小口)の、細かい横縞。上面・下面は無地の紙。三角形は増やさず、マテリアルで描く。
// 縞の計算は、束の高さ(インスタンスのスケール)を掛けたワールド単位の位相で行うので、
// 束の高さが違っても、縞の間隔は一定(STRIPE_PITCH)で、伸び縮みしない

/** 縞の間隔(m)。紙 1 束(数十枚)ぶんの細かさ */
export const STRIPE_PITCH = 0.012;
/** 縞の線の太さ(間隔に対する割合)。ページごとに揺らす */
export const LINE_WIDTH = 0.16;
/** 線の暗さ(紙の白に対する減り具合)。控えめな灰にする */
export const LINE_STRENGTH = 0.16;
/** 遠くて縞が 1px を下回るとき、縞を平均の濃さにぼかす。平均の線の被覆率 */
export const AVG_COVERAGE = 0.14;

/** 底からの高さの比率 y01(0〜1)と、束の高さ(m)から、縞の位相。位相が 1 増えるごとに縞が 1 本 */
export const stripePhase = (
  y01: number,
  height: number,
  pitch = STRIPE_PITCH,
): number => (y01 * height) / pitch;

const hash = (x: number): number => {
  const v = Math.sin(x * 127.1 + 311.7) * 43758.5453;
  return v - Math.floor(v);
};

/**
 * 縞の明るさの係数(1 が地の紙の白、小さいほど線で暗い)。位相の整数部(何本目の縞か)と seed から線ごとの
 * ばらつき(位置・太さ・濃さ)を決めるので、線は少し不規則になる。TSL 側(stripeFactorNode)と同じ式
 */
export const stripeFactor = (phase: number, seed = 0): number => {
  const i = Math.floor(phase);
  const f = phase - i;
  const n = hash(i + seed);
  const n2 = hash(i + seed + 17.3);
  const center = 0.5 + (n - 0.5) * 0.3;
  const width = LINE_WIDTH * (0.6 + 0.8 * n2);
  const d = Math.abs(f - center);
  const t = Math.min(1, Math.max(0, (d - width * 0.5) / (width * 0.5)));
  const line = 1 - t * t * (3 - 2 * t);
  return 1 - line * LINE_STRENGTH * (0.4 + 0.6 * n);
};

/** 縞の平均の明るさ係数(縞が細かすぎて見分けられない距離で使う) */
export const AVG_FACTOR = 1 - AVG_COVERAGE * LINE_STRENGTH * 0.7;
