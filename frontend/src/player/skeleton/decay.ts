import {BackSide, type Side, type Vector3Tuple} from "three";
import {
  color,
  Discard,
  floor,
  Fn,
  hash,
  If,
  instanceIndex,
  positionLocal,
  time,
  uniform,
  varying,
  vec3,
} from "three/tsl";
import {MeshBasicNodeMaterial} from "three/webgpu";

import {setSkipGTAO} from "../../camera/postprocess/skipGTAO";
import {BODY_FIRE_SECONDS} from "./BodyFire";

export const MAX_DECAY = 0.45;
const BLINK_RATIO = 0.35;
const BLINK_FPS = 12;
export const BONE_CELLS: Vector3Tuple = [1.5, 8, 1.5];
export const JOINT_CELLS: Vector3Tuple = [1.5, 1.5, 1.5];

export const bodyDecay = (elapsed: number): number =>
  MAX_DECAY * Math.min(1, Math.max(0, elapsed / BODY_FIRE_SECONDS));

const createUniforms = () => ({decay: uniform(0), blink: uniform(0)});

const createDecayMaterial = (
  fill: string,
  side: Side | undefined,
  cells: Vector3Tuple,
  {decay, blink}: ReturnType<typeof createUniforms>,
): MeshBasicNodeMaterial => {
  const material = new MeshBasicNodeMaterial();
  if (side !== undefined) {
    material.side = side;
  }
  const instance = varying(instanceIndex.toFloat());
  material.colorNode = Fn(() => {
    const cell = floor(positionLocal.mul(vec3(...cells)));
    const key = cell.x
      .add(cell.y.mul(31))
      .add(cell.z.mul(977))
      .add(instance.mul(7919));
    const step = floor(time.mul(BLINK_FPS));
    const gone = hash(key).lessThan(decay);
    const blinking = hash(key.add(step.mul(131))).lessThan(
      blink.mul(BLINK_RATIO),
    );
    If(gone.or(blinking), () => {
      Discard();
    });
    return color(fill);
  })();
  setSkipGTAO(material, true);
  return material;
};

export type SkeletonMaterials = ReturnType<typeof createUniforms> & {
  boneFill: MeshBasicNodeMaterial;
  boneOutline: MeshBasicNodeMaterial;
  jointFill: MeshBasicNodeMaterial;
  jointOutline: MeshBasicNodeMaterial;
  dispose: () => void;
};

export const createSkeletonMaterials = (
  fill: string,
  outline: string,
): SkeletonMaterials => {
  const uniforms = createUniforms();
  const boneFill = createDecayMaterial(fill, undefined, BONE_CELLS, uniforms);
  const boneOutline = createDecayMaterial(
    outline,
    BackSide,
    BONE_CELLS,
    uniforms,
  );
  const jointFill = createDecayMaterial(fill, undefined, JOINT_CELLS, uniforms);
  const jointOutline = createDecayMaterial(
    outline,
    BackSide,
    JOINT_CELLS,
    uniforms,
  );
  return {
    ...uniforms,
    boneFill,
    boneOutline,
    jointFill,
    jointOutline,
    dispose: () => {
      for (const m of [boneFill, boneOutline, jointFill, jointOutline]) {
        m.dispose();
      }
    },
  };
};
