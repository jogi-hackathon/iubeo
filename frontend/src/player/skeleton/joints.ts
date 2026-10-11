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

export const J = Object.fromEntries(JOINTS.map((n, i) => [n, i])) as Record<
  JointName,
  number
>;

export const NECK = JOINT_COUNT;

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

export const mirrorName = (name: JointName): JointName => {
  if (name === "head") {
    return name;
  }
  return `${name[0] === "l" ? "r" : "l"}${name.slice(1)}` as JointName;
};
