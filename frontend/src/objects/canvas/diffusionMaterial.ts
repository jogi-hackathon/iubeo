import {Vector4} from "three";
import {
  exp2,
  float,
  floor,
  fract,
  length,
  max,
  min,
  mix,
  pow,
  select,
  sin,
  smoothstep,
  sRGBTransferEOTF,
  sqrt,
  uniform,
  uv,
  vec2,
  vec3,
} from "three/tsl";
import {MeshStandardNodeMaterial, type Node} from "three/webgpu";

import {cellHash} from "../../core/cellHash";
import {PAPER_SIZE} from "./easel";

/** 潜在のマス(拡散モデルの latent の画素)の、紙 1m あたりの数。マスが正方形になるよう、縦横とも同じにする */
const LATENT_PER_METER = 50;
/** 潜在のマスの数。横 x 縦(紙 0.8 x 0.9m なら 40 x 45) */
const LATENT = [
  Math.round(PAPER_SIZE[0] * LATENT_PER_METER),
  Math.round(PAPER_SIZE[1] * LATENT_PER_METER),
] as const;
/** 絵の上の位置(0〜1)を、縦横の長さを揃えた位置に直す倍率(太陽を、紙の縦横比に関わらず真円にする) */
const PAPER_ASPECT = PAPER_SIZE[0] / PAPER_SIZE[1];
/** ノイズを取り除く段数(サンプラーのステップ数)。段ごとに、新しいノイズを引き直す */
const STEPS = 24;
/** 粗い→細かいの段階の数。最初は 2^COARSE_LEVELS マス単位の大づかみな絵から始める */
const COARSE_LEVELS = 4;
/** 絵の階調の数(空と同じく、なめらかにせず段に刻む) */
const TONES = 6;
/** 絵のいちばん暗い色。真っ白な世界なので、暗くしすぎない */
const INK = 0.32;
/**
 * 潜在の値(平均 0)と明るさの対応。明るさ = LATENT_MEAN + LATENT_SCALE·x。
 * ノイズ(x が標準正規)が、白い紙から浮きすぎない、明るめの灰色のざらつきになるようにする
 */
const LATENT_MEAN = 0.72;
const LATENT_SCALE = 0.3;
/** ノイズの強さ(1-t)^NOISE_FALLOFF。1 より大きいほど、早めにノイズが引いて絵が見えてくる */
const NOISE_FALLOFF = 1.6;
/** 段ごとに引き直すノイズの割合(残りは、作業ごとに固定のノイズ)。DDPM のように、段ごとに新しいノイズを足す */
const FRESH_NOISE = 0.6;
/** 白へ戻すときの、消える境目のぼかしの幅(紙の高さに対する割合) */
const WIPE_EDGE = 0.15;

/** 絵の組み立てに使う乱数の数(4 つずつ vec4 の uniform に詰める) */
const PICTURE_RANDOMS = 12;

/** 平均 0・分散およそ 1 のノイズ(一様乱数 3 つの和で、ガウス分布に寄せる) */
const gaussian = (
  cell: Node<"vec2">,
  step: Node<"float">,
  seed: number,
): Node<"float"> =>
  cellHash(cell, step, seed)
    .add(cellHash(cell, step, seed + 1))
    .add(cellHash(cell, step, seed + 2))
    .sub(1.5)
    .mul(2);

/**
 * 描き上がりの絵(x0)。p は紙の上の位置(0〜1、y は上)。乱数 r(作業ごとに CPU で引き直す)で、空・太陽・遠い丘・近い丘の風景を組む。
 * 明るさ(INK〜1)を TONES 段に刻んで返す
 */
const picture = (
  p: Node<"vec2">,
  r: (k: number) => Node<"float">,
): Node<"float"> => {
  const wave = (freq: Node<"float">, phase: Node<"float">) =>
    sin(p.x.mul(freq).add(phase.mul(Math.PI * 2)));

  const horizon = r(0).mul(0.15).add(0.3);
  const far = horizon
    .add(0.14)
    .add(wave(r(1).mul(4).add(3), r(2)).mul(0.06))
    .add(wave(r(3).mul(8).add(9), r(4)).mul(0.02));
  const near = horizon
    .add(wave(r(5).mul(3).add(2), r(6)).mul(0.08))
    .add(wave(r(7).mul(7).add(6), r(8)).mul(0.03));
  const sunCenter = vec2(r(9).mul(0.6).add(0.2), r(10).mul(0.15).add(0.68));
  const sunRadius = r(11).mul(0.05).add(0.09);

  const sky = mix(float(1), float(0.8), smoothstep(horizon, 1, p.y));
  // smoothstep の境目は小さい順に渡す(逆順は WGSL の変換先によって結果が決まらない)
  const sun = smoothstep(
    sunRadius.sub(0.01),
    sunRadius,
    length(p.sub(sunCenter).mul(vec2(PAPER_ASPECT, 1))),
  ).oneMinus();
  let tone: Node<"float"> = mix(sky, float(0.55), sun);
  tone = select(p.y.lessThan(far), float(0.72), tone);
  tone = select(
    p.y.lessThan(near),
    mix(float(0.5), float(INK), smoothstep(0, near, p.y).oneMinus()),
    tone,
  );
  const level = floor(
    tone
      .sub(INK)
      .div(1 - INK)
      .mul(TONES - 1)
      .add(0.5),
  );
  return level
    .div(TONES - 1)
    .mul(1 - INK)
    .add(INK);
};

/**
 * 描き上がりの絵を、block マス単位に粗くしたもの(まとまりの中心で引く)。
 * マスの数は block で割り切れないので、端のまとまりの中心は紙の外に出うる。紙の内側に寄せて引く
 */
const coarsePicture = (
  cell: Node<"vec2">,
  block: Node<"float">,
  r: (k: number) => Node<"float">,
): Node<"float"> =>
  picture(
    floor(cell.div(block))
      .add(0.5)
      .mul(block)
      .clamp(vec2(0.5), vec2(...LATENT).sub(0.5))
      .div(vec2(...LATENT)),
    r,
  );

export interface DiffusionPaper {
  material: MeshStandardNodeMaterial;
  /** ノイズを取り除いた度合い(0: ノイズだけ、1: 描き上がり)。段(STEPS)に刻んで描く */
  progress: {value: number};
  /** ノイズが出ているマスの割合(0: 真っ白な紙、1: 全マス)。マスごとに、ばらばらの順で現れる */
  appear: {value: number};
  /** 演出が残っている高さ(1: 全面、0: 真っ白な紙)。下げると、上のマスの行から順に白へ消えていく */
  fade: {value: number};
  /** 新しい作業のために、描く絵とノイズを引き直す */
  reseed(random?: () => number): void;
}

/**
 * キャンバスの紙(CanvasPaper)のマテリアル。拡散モデル(Diffusion)が、ノイズから絵を起こしていく様子をシェーダーで描く。
 * 空(skybox)と同じく、マスごと・段ごとの乱数(cellHash)でノイズを作り、段ごとに引き直して重ねる。
 *
 * - 紙を LATENT のマス(潜在の画素)に分け、マスごとに x_t = √(1-σ²)·x̂0 + σ·ε を描く。σ(ノイズの強さ)は段が進むほど 0 へ下がる(NOISE_FALLOFF)
 * - x̂0(その段で見えている絵)は、最初は 2^COARSE_LEVELS マス単位の大づかみな絵で、進むにつれ細かくなる(粗い形 → 細部の順に決まる)
 * - ε は作業ごとに固定のノイズと、段ごとに引き直すノイズを混ぜたもの。段が進むたびに、ざらつきが入れ替わりながら薄れる
 * - 色は灰色だけ(真っ白な世界に合わせる)
 * - まだノイズが出ていないマス・消えたマスは、真っ白な紙のまま
 * - ノードのマテリアルなので、ベイク AO(aoMap)も、そのまま貼れる(BakedAO)
 */
export const createDiffusionPaper = (): DiffusionPaper => {
  const progress = uniform(0);
  const appear = uniform(0);
  const fade = uniform(1);
  const seed = uniform(0);
  const randoms = Array.from({length: PICTURE_RANDOMS / 4}, () =>
    uniform(new Vector4()),
  );
  const r = (k: number): Node<"float"> => {
    const v = randoms[Math.floor(k / 4)]!;
    return [v.x, v.y, v.z, v.w][k % 4]!;
  };

  const cell = min(floor(uv().mul(vec2(...LATENT))), vec2(...LATENT).sub(1));
  const step = floor(progress.mul(STEPS));
  const t = step.div(STEPS);
  const seedKey = seed.mul(STEPS + 2);

  const level = float(1).sub(t).mul(COARSE_LEVELS);
  const fine = floor(level);
  const x0 = mix(
    coarsePicture(cell, exp2(fine), r),
    coarsePicture(cell, exp2(fine.add(1)), r),
    fract(level),
  )
    .sub(LATENT_MEAN)
    .div(LATENT_SCALE);

  // pow の底が 0 だと WGSL では未定義(黒く潰れる)なので、0 にしない
  const noiseLevel = pow(max(t.oneMinus(), 1e-4), NOISE_FALLOFF);
  const noise = mix(
    gaussian(cell, seedKey.add(STEPS + 1), 0),
    gaussian(cell, seedKey.add(step), 10),
    FRESH_NOISE,
  ).div(Math.hypot(1 - FRESH_NOISE, FRESH_NOISE));
  const xt = sqrt(noiseLevel.mul(noiseLevel).oneMinus())
    .mul(x0)
    .add(noiseLevel.mul(noise));
  const tone = xt.mul(LATENT_SCALE).add(LATENT_MEAN).clamp(0, 1);

  const shown = cellHash(cell, seedKey, 20).lessThan(appear);
  const row = cell.y.add(0.5).div(LATENT[1]);
  const remain = fade
    .mul(1 + WIPE_EDGE)
    .sub(row)
    .div(WIPE_EDGE)
    .clamp(0, 1);
  const srgb = mix(float(1), select(shown, tone, float(1)), remain);
  const material = new MeshStandardNodeMaterial();
  // 明るさは見た目(sRGB)で決めているので、線形に直して渡す
  material.colorNode = sRGBTransferEOTF(vec3(srgb)) as Node<"vec3">;

  return {
    material,
    progress,
    appear,
    fade,
    reseed(random = Math.random) {
      seed.value = Math.floor(random() * 65536);
      for (const v of randoms) {
        v.value.set(random(), random(), random(), random());
      }
    },
  };
};
