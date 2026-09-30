import { describe, expect, it } from "vitest";
import { decideHidden, rotatedFrame } from "./frame";
import { EMBEDDED, HIDDEN_AO_EPS } from "./params";

describe("decideHidden", () => {
  it("全サンプル点が暗い/埋まりなら隠れ", () => {
    expect(decideHidden([0, EMBEDDED, 1])).toBe(true);
    expect(decideHidden([EMBEDDED, EMBEDDED])).toBe(true);
  });

  it("1点でも明るければ隠れではない(空が見える面を潰さない)", () => {
    expect(decideHidden([0, 0, 255])).toBe(false);
    // 閾値ちょうど(ao/255 = HIDDEN_AO_EPS 以上)は明るい扱い
    expect(decideHidden([Math.ceil(HIDDEN_AO_EPS * 255)])).toBe(false);
  });

  it("サンプル点が 0 個なら安全側で隠れではない", () => {
    expect(decideHidden([])).toBe(false);
  });
});

describe("rotatedFrame", () => {
  const dot = (a: number[], b: number[]) =>
    (a[0] ?? 0) * (b[0] ?? 0) +
    (a[1] ?? 0) * (b[1] ?? 0) +
    (a[2] ?? 0) * (b[2] ?? 0);

  it("法線と直交する互いに直交した単位ベクトル T, B を返す", () => {
    const normals: [number, number, number][] = [
      [0, 0, 1],
      [0, 1, 0],
      [1, 0, 0],
      [0, -1, 0],
      [1 / Math.sqrt(3), 1 / Math.sqrt(3), 1 / Math.sqrt(3)],
    ];
    for (const n of normals) {
      for (const rot of [0, 0.7, 2.5, 5.9]) {
        const out = new Float64Array(6);
        rotatedFrame(n[0], n[1], n[2], rot, out);
        const t = Array.from(out.subarray(0, 3));
        const b = Array.from(out.subarray(3, 6));
        expect(dot(t, t)).toBeCloseTo(1);
        expect(dot(b, b)).toBeCloseTo(1);
        expect(dot(t, n)).toBeCloseTo(0);
        expect(dot(b, n)).toBeCloseTo(0);
        expect(dot(t, b)).toBeCloseTo(0);
      }
    }
  });
});
