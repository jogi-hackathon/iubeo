import {describe, expect, it} from "vitest";

import {
  SLIP_LENGTH,
  SLIP_WIDTH,
  STRIP_SEGMENTS,
  STRIP_VERTEX_COUNT,
  stripIndices,
  writeStrip,
} from "../strip";

const shape = (length: number, curl: number) => {
  const positions = new Float32Array(STRIP_VERTEX_COUNT * 3);
  const normals = new Float32Array(STRIP_VERTEX_COUNT * 3);
  const uvs = new Float32Array(STRIP_VERTEX_COUNT * 2);
  writeStrip(positions, normals, uvs, {length, curl});
  const row = (i: number) => ({
    left: [positions[i * 6], positions[i * 6 + 1], positions[i * 6 + 2]],
    right: [positions[i * 6 + 3], positions[i * 6 + 4], positions[i * 6 + 5]],
    normal: [normals[i * 6], normals[i * 6 + 1], normals[i * 6 + 2]],
    v: uvs[i * 4 + 1],
  });
  return {positions, normals, uvs, row};
};

describe("writeStrip", () => {
  it("根元は原点にあり、左右の列は紙の幅だけ離れている", () => {
    const {row} = shape(SLIP_LENGTH, 1);
    const base = row(0);
    expect(base.left[0]).toBeCloseTo(-SLIP_WIDTH / 2);
    expect(base.right[0]).toBeCloseTo(SLIP_WIDTH / 2);
    expect(base.left.slice(1)).toEqual([0, 0]);
    expect(base.right.slice(1)).toEqual([0, 0]);
  });

  it("巻きが無ければ +Y にまっすぐ伸び、法線は +Z を向く", () => {
    const {row} = shape(0.1, 0);
    const tip = row(STRIP_SEGMENTS);
    expect(tip.left[1]).toBeCloseTo(0.1);
    expect(tip.left[2]).toBeCloseTo(0);
    expect(tip.normal).toEqual([0, -0, 1]);
  });

  it("巻くと先端が手前(+Z)へ倒れ、帯に沿った長さは変わらない", () => {
    const {row} = shape(SLIP_LENGTH, 1.1);
    let arc = 0;
    for (let i = 1; i <= STRIP_SEGMENTS; i++) {
      const a = row(i - 1).left;
      const b = row(i).left;
      arc += Math.hypot(b[1]! - a[1]!, b[2]! - a[2]!);
    }
    expect(arc).toBeCloseTo(SLIP_LENGTH, 5);
    const tip = row(STRIP_SEGMENTS);
    expect(tip.left[2]).toBeGreaterThan(0.02);
    expect(tip.left[1]).toBeLessThan(SLIP_LENGTH);
    expect(tip.normal[1]).toBeLessThan(0);
  });

  it("先端が紙の上端(v = 1)で、出ている分だけ下へ続く", () => {
    const {row} = shape(SLIP_LENGTH / 2, 0);
    expect(row(STRIP_SEGMENTS).v).toBeCloseTo(1);
    expect(row(0).v).toBeCloseTo(0.5);
    const full = shape(SLIP_LENGTH, 0);
    expect(full.row(0).v).toBeCloseTo(0);
  });

  it("面は +Z から見て反時計回り(表が手前を向く)", () => {
    const indices = stripIndices();
    expect(indices.length).toBe(STRIP_SEGMENTS * 6);
    const {positions} = shape(0.1, 0);
    for (let t = 0; t < indices.length; t += 3) {
      const p = (k: number) => [
        positions[indices[t + k]! * 3]!,
        positions[indices[t + k]! * 3 + 1]!,
      ];
      const [a, b, c] = [p(0), p(1), p(2)];
      const cross =
        (b[0]! - a[0]!) * (c[1]! - a[1]!) - (b[1]! - a[1]!) * (c[0]! - a[0]!);
      expect(cross).toBeGreaterThan(0);
    }
  });
});
