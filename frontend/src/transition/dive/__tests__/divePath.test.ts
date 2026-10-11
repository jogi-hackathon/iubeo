import {Euler, Matrix4, Quaternion, Vector3} from "three";
import {describe, expect, it} from "vitest";

import {anchorFrame, coverDistance, poseAt, portalTransform} from "../divePath";

const rigid = (seed: number): Matrix4 => {
  const q = new Quaternion().setFromEuler(
    new Euler(seed * 0.7, seed * 1.3 + 0.4, seed * -0.9),
  );
  return new Matrix4().compose(
    new Vector3(seed, -seed * 2 + 1, seed * 0.5 - 3),
    q,
    new Vector3(1, 1, 1),
  );
};

describe("portalTransform", () => {
  it.each([0.3, 1, 2.7, -4])("S=%f でも視点が一致する", (seed) => {
    const A = anchorFrame(new Vector3(1, 0, 2), 0.8, 0.5);
    const S = rigid(seed);
    const T = portalTransform(A, S);
    const view = new Matrix4().makeTranslation(0, 0, 0.36);
    const lhs = new Matrix4()
      .copy(T)
      .multiply(new Matrix4().copy(S).multiply(view));
    const rhs = new Matrix4().copy(A).multiply(view);
    lhs.elements.forEach((v, i) =>
      expect(v).toBeCloseTo(rhs.elements[i] as number, 6),
    );
  });
});

describe("coverDistance", () => {
  it("fov75 16:9 で約 0.106", () => {
    expect(Math.abs(coverDistance(75, 16 / 9) - 0.106)).toBeLessThan(0.002);
  });
});

describe("anchorFrame / poseAt", () => {
  it("d=-L で目の位置、-z が前方", () => {
    const yaw = 0.6;
    const L = 0.5;
    const A = anchorFrame(new Vector3(1, 0, 2), yaw, L);
    const out = {position: new Vector3(), quaternion: new Quaternion()};
    poseAt(A, -L, out);
    const fwd = new Vector3(0, 0, -1).applyQuaternion(out.quaternion);
    expect(fwd.x).toBeCloseTo(-Math.sin(yaw));
    expect(fwd.z).toBeCloseTo(-Math.cos(yaw));
    poseAt(A, 0, out);
    const eyeAtZero = out.position.clone();
    poseAt(A, -L, out);
    expect(out.position.clone().sub(eyeAtZero).length()).toBeCloseTo(L);
  });
});
