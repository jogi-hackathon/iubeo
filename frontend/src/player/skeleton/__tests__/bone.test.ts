import {Matrix4, Vector3} from "three";
import {describe, expect, it} from "vitest";

import {composeBone} from "../bone";

const endpoints = (m: Matrix4) => [
  new Vector3(0, -0.5, 0).applyMatrix4(m),
  new Vector3(0, 0.5, 0).applyMatrix4(m),
];

describe("composeBone", () => {
  it("単位円柱の両端が from と to に来る", () => {
    const from = new Vector3(1, 2, 3);
    const to = new Vector3(-0.5, 1, 4);
    const [a, b] = endpoints(composeBone(new Matrix4(), from, to, 0.02));
    expect(a?.distanceTo(from)).toBeCloseTo(0, 5);
    expect(b?.distanceTo(to)).toBeCloseTo(0, 5);
  });

  it("向きが逆でも両端が合う(真下向き・真上向きを含む)", () => {
    for (const to of [new Vector3(0, -1, 0), new Vector3(0, 1, 0)]) {
      const from = new Vector3(0, 0, 0);
      const [a, b] = endpoints(composeBone(new Matrix4(), from, to, 0.02));
      expect(a?.distanceTo(from)).toBeCloseTo(0, 5);
      expect(b?.distanceTo(to)).toBeCloseTo(0, 5);
    }
  });

  it("太さは radius で、長さ方向には影響しない", () => {
    const m = composeBone(
      new Matrix4(),
      new Vector3(0, 0, 0),
      new Vector3(0, 2, 0),
      0.05,
    );
    expect(new Vector3(1, 0, 0).applyMatrix4(m).x).toBeCloseTo(0.05);
    expect(new Vector3(0, 0.5, 0).applyMatrix4(m).y).toBeCloseTo(2);
  });

  it("長さ 0 でも NaN にならず、潰れて見えなくなる", () => {
    const p = new Vector3(1, 1, 1);
    const m = composeBone(new Matrix4(), p, p.clone(), 0.02);
    expect(m.elements.every(Number.isFinite)).toBe(true);
    expect(new Vector3(1, 1, 1).applyMatrix4(m).distanceTo(p)).toBeCloseTo(0);
  });
});
