export const LAPTOP = {
  z: 0,
  width: 0.34,
  depth: 0.245,
  thickness: 0.016,
} as const;

export const HINGE = {
  y: LAPTOP.thickness,
  z: LAPTOP.z - LAPTOP.depth / 2 + 0.01,
  radius: 0.007,
} as const;

export const LID = {
  height: 0.245,
  thickness: 0.007,
  tilt: 0.35,
} as const;

export const SCREEN = {
  width: 0.296,
  height: 0.222,
} as const;

export const TRACKPAD = {
  z: LAPTOP.z + 0.06,
  width: 0.12,
  depth: 0.075,
} as const;

export const MEMO = {
  x: -0.29,
  z: -0.09,
  width: 0.2,
  height: 0.14,
  tilt: -0.5,
} as const;

export const ON_DESK = {
  x: 0.45,
  z: -0.12,
  yaw: -0.3,
} as const;
