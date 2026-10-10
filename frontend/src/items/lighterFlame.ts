import {
  abs,
  color,
  float,
  Fn,
  mix,
  normalGeometry,
  normalView,
  positionGeometry,
  sin,
  smoothstep,
  time,
  vec3,
} from "three/tsl";
import {
  BackSide,
  LatheGeometry,
  MeshBasicNodeMaterial,
  type Node,
  Vector2,
} from "three/webgpu";

import {setSkipGTAO} from "../camera/postprocess/skipGTAO";
import {
  LIGHTER_FLAME_CORE,
  LIGHTER_FLAME_PROFILE,
  LIGHTER_FLAME_SIZE,
  LIGHTER_HELD_OUTLINE,
} from "./lighter";

/*
 * ライターの炎(手元でだけ描く)。リアルな炎ではなく、手元の他の部品と同じ「ソリッドな色の形+縁取り」で描く。
 *
 * 形は回転体(LatheGeometry)1 枚。単位の形(根元が原点、高さ 1・最大の幅 1)を LIGHTER_FLAME_SIZE の scale で伸ばす。
 * 色は世界の色に合わせたくすんだ赤のベタ塗りで、中ほどに一段明るい赤の舌(LIGHTER_FLAME_CORE)を、境目をくっきりさせて重ねる(セル調の 2 トーン)。
 * 不透明で、明るさは 1 を超えない(bloom で滲ませない)。
 * 縁取りは、同じ形を法線の向きへ FLAME_OUTLINE だけ膨らませた裏面(赤茶で、他の部品より細い)。
 * 揺らぎは頂点シェーダーで付ける。周期の合わない正弦波を重ねて、上ほど大きく横へなびき、高さも伸び縮みする。
 * 炎と縁取りは同じ揺らぎの式を使うので、ずれない。毎フレームの JS は要らず、uniform の time だけが進む
 */

const SEGMENTS = 12;
const PROFILE_STEPS = 16;

/**
 * 高さ h(0〜1)での、炎の輪郭の半径(一番太いところを 1 とする前の値)。
 * 根元は芯の太さ(baseRadius)から sin の山で膨らみ、先細りの係数(tipPower)で尖る。
 * sin の山は widestAt に置くが、先細りの係数が掛かるので、実際に一番太くなる高さはそれより少し下
 */
const rawRadius = (h: number): number => {
  const {baseRadius, widestAt, tipPower} = LIGHTER_FLAME_PROFILE;
  const k = Math.log(0.5) / Math.log(widestAt);
  const swell = Math.sin(Math.PI * h ** k);
  return (1 - h) ** tipPower * (baseRadius + (1 - baseRadius) * swell);
};

/** 回転体。一番太いところの幅が 1 になるように正規化する。先端の半径は 0 にせず、法線が潰れないようにわずかに残す */
const flameGeometry = (): LatheGeometry => {
  const radii = Array.from({length: PROFILE_STEPS + 1}, (_, i) =>
    rawRadius(i / PROFILE_STEPS),
  );
  const widest = Math.max(...radii);
  const points = radii.map(
    (r, i) => new Vector2(Math.max(r / widest, 0.008) * 0.5, i / PROFILE_STEPS),
  );
  return new LatheGeometry(points, SEGMENTS);
};

export const FLAME_GEOMETRY = flameGeometry();

/** 高さ(単位の炎での 0〜1)。揺らぎは上ほど大きい */
const height = positionGeometry.y;

/**
 * 揺らぎを付けた頂点の位置。横へのなびき(x, z)は高さの 2 乗で大きくし、根元は芯に留める。
 * 高さの伸び縮みは根元を固定して上を動かす。周波数は互いに約分されない値にして、周期が見えないようにする
 */
const swayedPosition: Node<"vec3"> = Fn(() => {
  const w = height.mul(height);
  const t = time;
  const x = sin(t.mul(7.3).add(height.mul(4)))
    .mul(0.1)
    .add(sin(t.mul(11.7).add(height.mul(2)).add(1.3)).mul(0.05))
    .mul(w);
  const z = sin(t.mul(9.1).add(height.mul(3)).add(2))
    .mul(0.07)
    .mul(w);
  const y = height.mul(
    sin(t.mul(8.9))
      .mul(0.06)
      .add(sin(t.mul(13.3).add(0.7)).mul(0.04)),
  );
  return positionGeometry.add(vec3(x, y, z));
})();

/**
 * 炎の色。手元の物は照明もトーンの落ち込みも受けない(MeshBasic)ので、素の色をそのまま出すと、世界の中で一番鮮やかな色になって浮く。
 * 世界の色付きの物(ディレクトリのファイル)は、画面では彩度 0.2〜0.5・明るさ 0.5 前後に落ちて見える(赤いファイル #e63946 は #804f43)。
 * 炎はそれと同じ系統の、くすんだ赤にする。外側はファイルの赤より一段だけ明るく(炎として読める分)、舌はさらに一段明るく
 */
const FLAME_RED = color("#9e4e42");
const TONGUE = color("#c77f6d");
/** 縁取りの色。黒(他の部品の縁取り)では色との対比が強すぎるので、炎の赤を暗くした赤茶にする */
const OUTLINE = color("#47221c");
/** 縁取りの太さ。他の部品(LIGHTER_HELD_OUTLINE)より細くして、輪郭を主張させすぎない */
const FLAME_OUTLINE = LIGHTER_HELD_OUTLINE * 0.6;

/** こちらを向いている度合い(1: 正面、0: 縁) */
const facing = abs(normalView.z);

/**
 * 舌の見える範囲(0〜1)。幅 LIGHTER_FLAME_CORE.width の内側の円筒を正面から見ると、その縁の facing は sqrt(1 - width^2) なので、そこを境にする。
 * 高さは LIGHTER_FLAME_CORE.height まで。境目はくっきりさせ、ジャギーが出ない程度にだけぼかす
 */
const tongueMask: Node<"float"> = Fn(() => {
  const {width, height: tongueHeight} = LIGHTER_FLAME_CORE;
  const edge = Math.sqrt(1 - width * width);
  const inside = smoothstep(edge - 0.02, edge + 0.02, facing);
  const below = float(1).sub(
    smoothstep(tongueHeight - 0.03, tongueHeight, height),
  );
  return inside.mul(below).mul(smoothstep(0.06, 0.09, height));
})();

const flameMaterial = new MeshBasicNodeMaterial();
flameMaterial.positionNode = swayedPosition;
flameMaterial.colorNode = mix(FLAME_RED, TONGUE, tongueMask);
setSkipGTAO(flameMaterial, true);

/**
 * 縁取り: 揺らいだ位置を、法線の向きへ膨らませる。炎は単位の形を LIGHTER_FLAME_SIZE で伸ばす(縦と横で倍率が違う)ので、
 * 膨らませる量を軸ごとに倍率で割り、伸ばした後の太さが向きによらず FLAME_OUTLINE になるようにする
 */
const outlineMaterial = new MeshBasicNodeMaterial({side: BackSide});
outlineMaterial.positionNode = swayedPosition.add(
  normalGeometry.mul(
    vec3(
      FLAME_OUTLINE / LIGHTER_FLAME_SIZE[0],
      FLAME_OUTLINE / LIGHTER_FLAME_SIZE[1],
      FLAME_OUTLINE / LIGHTER_FLAME_SIZE[2],
    ),
  ),
);
outlineMaterial.colorNode = OUTLINE;
setSkipGTAO(outlineMaterial, true);

export const FLAME_MATERIAL = flameMaterial;
export const FLAME_OUTLINE_MATERIAL = outlineMaterial;
