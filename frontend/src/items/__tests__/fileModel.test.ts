import {
  Box3,
  BoxGeometry,
  CylinderGeometry,
  Euler,
  type BufferGeometry,
  Matrix4,
  Quaternion,
  Vector3,
} from "three";
import {describe, expect, it} from "vitest";

import {FILE_MODELS, type FilePartShape} from "../fileModel";

const UNIT_BOUNDS: Record<FilePartShape, Box3> = Object.fromEntries(
  (
    [
      ["box", new BoxGeometry(1, 1, 1)],
      ["cylinder", new CylinderGeometry(1, 1, 1, 10)],
      ["prism", new CylinderGeometry(1, 1, 1, 3)],
    ] as [FilePartShape, BufferGeometry][]
  ).map(([shape, geometry]) => {
    geometry.computeBoundingBox();
    return [shape, geometry.boundingBox!];
  }),
) as Record<FilePartShape, Box3>;

const boundsOf = (status: keyof typeof FILE_MODELS): Box3 => {
  const {parts, outline} = FILE_MODELS[status];
  const box = new Box3();
  for (const part of parts) {
    const unit = UNIT_BOUNDS[part.shape].clone();
    const matrix = new Matrix4().compose(
      new Vector3(...part.position),
      new Quaternion().setFromEuler(new Euler(...(part.rotation ?? [0, 0, 0]))),
      new Vector3(...part.scale.map((v) => v + 2 * outline)),
    );
    box.union(unit.applyMatrix4(matrix));
  }
  return box;
};

describe("FILE_MODELS", () => {
  it.each(Object.keys(FILE_MODELS) as (keyof typeof FILE_MODELS)[])(
    "%s は今の箱(縁込み 0.112m 角)と同じくらいの大きさに収まり、手の位置(原点)を中心にする",
    (status) => {
      const box = boundsOf(status);
      const size = box.getSize(new Vector3());
      const center = box.getCenter(new Vector3());
      expect(Math.max(size.x, size.y, size.z)).toBeLessThanOrEqual(0.115);
      expect(center.length()).toBeLessThan(0.01);
    },
  );
});
