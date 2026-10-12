import {BoxGeometry, Mesh, MeshBasicMaterial, Vector3} from "three";
import {describe, expect, it} from "vitest";

import "../../core/bvh";
import type {Collider} from "../../core/bvh";
import {cameraBlockers, FLY_CAMERA_RADIUS, moveFlyCamera} from "../flyBounds";

const box = (
  [x, y, z]: [number, number, number],
  [w, h, d]: [number, number, number],
  blocksCamera: boolean,
): Collider => {
  const geometry = new BoxGeometry(w, h, d);
  geometry.computeBoundsTree();
  const mesh = new Mesh(geometry, new MeshBasicMaterial());
  mesh.position.set(x, y, z);
  return {mesh, enabled: true, blocksCamera};
};

const T = 0.25;
const room: Collider[] = [
  box([0, -T / 2, 0], [10, T, 10], true),
  box([0, 6 + T / 2, 0], [10, T, 10], true),
  box([5 + T / 2, 3, 0], [T, 6, 10], true),
  box([-5 - T / 2, 3, 0], [T, 6, 10], true),
  box([0, 3, 5 + T / 2], [10, 6, T], true),
  box([0, 3, -5 - T / 2], [10, 6, T], true),
  box([2, 3, 0], [0.08, 6, 10], false),
];
const blockers = cameraBlockers(room);

describe("moveFlyCamera", () => {
  it("印の付いたコライダーだけに当たる", () => {
    expect(blockers).toHaveLength(6);
  });

  it("1 回で大きく動いても壁を抜けない", () => {
    const p = moveFlyCamera(
      new Vector3(0, 3, 0),
      new Vector3(20, 0, 0),
      blockers,
    );
    expect(p.x).toBeLessThanOrEqual(5 - FLY_CAMERA_RADIUS + 1e-3);
    expect(p.x).toBeGreaterThan(5 - FLY_CAMERA_RADIUS - 0.05);
  });

  it("床と天井も抜けない", () => {
    const down = moveFlyCamera(
      new Vector3(0, 3, 0),
      new Vector3(0, -20, 0),
      blockers,
    );
    expect(down.y).toBeGreaterThanOrEqual(FLY_CAMERA_RADIUS - 1e-3);
    const up = moveFlyCamera(
      new Vector3(0, 3, 0),
      new Vector3(0, 20, 0),
      blockers,
    );
    expect(up.y).toBeLessThanOrEqual(6 - FLY_CAMERA_RADIUS + 1e-3);
  });

  it("壁へ斜めに進むと壁沿いに滑る", () => {
    const p = moveFlyCamera(
      new Vector3(4, 3, 0),
      new Vector3(2, 0, 2),
      blockers,
    );
    expect(p.x).toBeLessThanOrEqual(5 - FLY_CAMERA_RADIUS + 1e-3);
    expect(p.z).toBeCloseTo(2, 1);
  });

  it("印のない仕切りは通り抜ける", () => {
    const p = moveFlyCamera(
      new Vector3(0, 3, 0),
      new Vector3(3, 0, 0),
      blockers,
    );
    expect(p.x).toBeCloseTo(3);
  });
});
