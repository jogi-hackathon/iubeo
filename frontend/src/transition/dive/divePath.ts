import {Matrix4, Quaternion, Vector3} from "three";

import {SCREEN} from "../../objects/pc/dimensions";
import {EYE_FORWARD, EYE_HEIGHT} from "../../player/constants";

const COVER_MARGIN = 0.98;

const UP = new Vector3(0, 1, 0);

export const anchorFrame = (foot: Vector3, yaw: number, L: number): Matrix4 => {
  const sin = Math.sin(yaw);
  const cos = Math.cos(yaw);
  const eyeX = foot.x - sin * EYE_FORWARD;
  const eyeY = foot.y + EYE_HEIGHT;
  const eyeZ = foot.z - cos * EYE_FORWARD;
  const origin = new Vector3(eyeX + sin * L, eyeY, eyeZ + cos * L);
  const rotation = new Quaternion().setFromAxisAngle(UP, yaw);
  return new Matrix4().compose(origin, rotation, new Vector3(1, 1, 1));
};

const scratchScale = new Vector3();
const scratchLocal = new Vector3();

export const poseAt = (
  frame: Matrix4,
  d: number,
  out: {position: Vector3; quaternion: Quaternion},
): void => {
  frame.decompose(scratchLocal, out.quaternion, scratchScale);
  out.position.set(0, 0, d).applyMatrix4(frame);
};

export const coverDistance = (
  fovDeg: number,
  aspect: number,
  w: number = SCREEN.width,
  h: number = SCREEN.height,
): number => {
  const t = Math.tan((fovDeg * Math.PI) / 360);
  return Math.min(h / 2 / t, w / 2 / (aspect * t)) * COVER_MARGIN;
};

export const portalTransform = (anchor: Matrix4, screen: Matrix4): Matrix4 =>
  new Matrix4().copy(anchor).multiply(new Matrix4().copy(screen).invert());

const ENTRY_LATERAL_SLOP = 0.05;
const scratchInverse = new Matrix4();
const scratchCamera = new Vector3();

export const entryDistance = (
  screen: Matrix4,
  camera: Vector3,
  normal: number,
  cover: number,
): number => {
  const local = scratchCamera
    .copy(camera)
    .applyMatrix4(scratchInverse.copy(screen).invert());
  const inFront =
    Math.abs(local.x) <= ENTRY_LATERAL_SLOP &&
    Math.abs(local.y) <= ENTRY_LATERAL_SLOP;
  if (!inFront || local.z >= normal || local.z <= cover) {
    return normal;
  }
  return local.z;
};
