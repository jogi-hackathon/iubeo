import {Vector3} from "three";
import {describe, expect, it} from "vitest";

import {CAPSULE_RADIUS} from "../constants";
import {keepCpuClear, PAPER_RING_RADIUS} from "../cpuClearance";

const LIM = PAPER_RING_RADIUS + CAPSULE_RADIUS;

describe("keepCpuClear", () => {
  it("紙の山の円の中に食い込んでいたら、同じ向きで円の外へ出す", () => {
    const p = new Vector3(0, 0.05, 4.05);
    keepCpuClear(p, []);
    expect(p.x).toBeCloseTo(0, 9);
    expect(p.y).toBe(0.05);
    expect(p.z).toBeCloseTo(LIM, 9);
  });

  it("斜めからでも、押し出した後は円の外で向きが変わらない", () => {
    const p = new Vector3(-2, 0.05, 3);
    const before = Math.atan2(p.x, p.z);
    keepCpuClear(p, []);
    expect(Math.hypot(p.x, p.z)).toBeCloseTo(LIM, 9);
    expect(Math.atan2(p.x, p.z)).toBeCloseTo(before, 9);
  });

  it("円の外にいる位置は動かさない", () => {
    const p = new Vector3(1.4, 0.05, 4.6);
    keepCpuClear(p, []);
    expect(p.toArray()).toEqual([1.4, 0.05, 4.6]);
  });

  it("中心にいたら、+Z 側の円の縁へ出す", () => {
    const p = new Vector3(0, 0.05, 0);
    keepCpuClear(p, []);
    expect(p.x).toBe(0);
    expect(p.z).toBeCloseTo(LIM, 9);
  });

  it("紙の山の縁(3.98m)より外の立ち位置は、体の半径ぶん離れる", () => {
    const p = new Vector3(0, 0.05, 4.2);
    keepCpuClear(p, []);
    expect(p.z).toBeCloseTo(LIM, 9);
    expect(LIM).toBeGreaterThan(3.98 + CAPSULE_RADIUS);
  });
});
