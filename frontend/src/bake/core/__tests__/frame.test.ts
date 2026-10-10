import {describe, expect, it} from "vitest";

import {
  decideHidden,
  isHiddenPoint,
  type ProbePoint,
  rotatedFrame,
} from "../frame";
import {
  EMBEDDED,
  HIDDEN_AO_EPS,
  HIDDEN_GRID_MAX,
  HIDDEN_STEP,
  HIDDEN_UV,
  hiddenProbeUVs,
} from "../params";

const RAYS = 32;
const open: ProbePoint = {ao: 255, backHits: 0, misses: RAYS, ny: 1};

describe("isHiddenPoint", () => {
  it("暗い/埋まり(AO)なら見えない", () => {
    expect(isHiddenPoint({...open, ao: 0}, RAYS)).toBe(true);
    expect(isHiddenPoint({...open, ao: EMBEDDED}, RAYS)).toBe(true);
    expect(
      isHiddenPoint({...open, ao: Math.ceil(HIDDEN_AO_EPS * 255)}, RAYS),
    ).toBe(false);
  });

  it("距離無制限のレイの半分以上が裏面に当たれば埋まり(厚い床に密着した面)", () => {
    const buried = {ao: 255, backHits: RAYS / 2, misses: RAYS / 2, ny: -1};
    expect(isHiddenPoint(buried, RAYS)).toBe(true);
    expect(isHiddenPoint({...buried, backHits: RAYS / 2 - 1}, RAYS)).toBe(
      false,
    );
  });

  it("下向きで大半のレイが何にも当たらなければ虚空(床の底面)", () => {
    const bottom = {ao: 255, backHits: 0, misses: RAYS, ny: -1};
    expect(isHiddenPoint(bottom, RAYS)).toBe(true);
    expect(isHiddenPoint({...bottom, misses: RAYS / 2}, RAYS)).toBe(false);
  });

  it("上向き・横向きは何にも当たらなくても見える(空が見える面を潰さない)", () => {
    expect(isHiddenPoint(open, RAYS)).toBe(false);
    expect(isHiddenPoint({...open, ny: 0}, RAYS)).toBe(false);
  });
});

describe("decideHidden", () => {
  it("全サンプル点が見えないときだけ隠れ", () => {
    const hidden = {...open, ao: 0};
    expect(decideHidden([hidden, hidden], RAYS)).toBe(true);
    expect(decideHidden([hidden, open], RAYS)).toBe(false);
  });

  it("サンプル点が 0 個なら安全側で隠れではない", () => {
    expect(decideHidden([], RAYS)).toBe(false);
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

describe("hiddenProbeUVs", () => {
  it("小さいチャートは、従来の 3 点", () => {
    expect(hiddenProbeUVs(0)).toEqual(HIDDEN_UV);
    expect(hiddenProbeUVs(0.02)).toEqual(HIDDEN_UV);
    expect(hiddenProbeUVs(HIDDEN_STEP * 3)).toEqual(HIDDEN_UV);
  });

  it("大きいチャートは、間隔が HIDDEN_STEP 以下になるまで細かくし、端から端まで等間隔に置く", () => {
    const size = 2.2;
    const uvs = hiddenProbeUVs(size);
    expect(uvs.length).toBeGreaterThan(HIDDEN_UV.length);
    for (let i = 1; i < uvs.length; i++) {
      const gap = ((uvs[i] as number) - (uvs[i - 1] as number)) * size;
      expect(gap).toBeLessThanOrEqual(HIDDEN_STEP + 1e-9);
    }
    expect(uvs[0]).toBeGreaterThan(0);
    expect((uvs[0] as number) * size).toBeLessThan(HIDDEN_STEP);
    expect(uvs.at(-1)).toBeLessThan(1);
  });

  it("巨大なチャートでも、1 辺の点数は上限で頭打ち", () => {
    expect(hiddenProbeUVs(1000)).toHaveLength(HIDDEN_GRID_MAX);
  });
});
