/**
 * スケルトンの関節(15点)。MediaPipe Pose から顔(頭の1点に集約)と手指を除き、かかとをつま先に寄せた最小構成。
 * ポーズ座標はプレイヤーのローカル空間: 原点は足元、+Y が上、-Z が前(yaw=0 の向き)、+X が右
 */
export const JOINTS = [
  "head",
  "lShoulder",
  "rShoulder",
  "lElbow",
  "rElbow",
  "lWrist",
  "rWrist",
  "lHip",
  "rHip",
  "lKnee",
  "rKnee",
  "lAnkle",
  "rAnkle",
  "lToe",
  "rToe",
] as const;

export type JointName = (typeof JOINTS)[number];

export const JOINT_COUNT = JOINTS.length;

/** 関節名 → ポーズ内の関節番号 */
export const J = Object.fromEntries(JOINTS.map((n, i) => [n, i])) as Record<
  JointName,
  number
>;

/** 描画専用の導出点。首は両肩の中点で、保存はしない(番号は関節の次) */
export const NECK = JOINT_COUNT;

/** 骨。端点は関節番号か NECK。MediaPipe 風に胴は肩・腰の四角形で描く */
export const BONES: readonly (readonly [number, number])[] = [
  [J.head, NECK],
  [J.lShoulder, J.rShoulder],
  [J.lHip, J.rHip],
  [J.lShoulder, J.lHip],
  [J.rShoulder, J.rHip],
  [J.lShoulder, J.lElbow],
  [J.lElbow, J.lWrist],
  [J.rShoulder, J.rElbow],
  [J.rElbow, J.rWrist],
  [J.lHip, J.lKnee],
  [J.lKnee, J.lAnkle],
  [J.lAnkle, J.lToe],
  [J.rHip, J.rKnee],
  [J.rKnee, J.rAnkle],
  [J.rAnkle, J.rToe],
];

/** 左右を入れ替えた関節名("lKnee" ↔ "rKnee")。head はそのまま */
export const mirrorName = (name: JointName): JointName => {
  if (name === "head") {
    return name;
  }
  return `${name[0] === "l" ? "r" : "l"}${name.slice(1)}` as JointName;
};
