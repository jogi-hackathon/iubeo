import { describe, expect, it } from "vitest";
import { applyLook, LOOK_SENSITIVITY } from "../look";

const look = () => ({ yaw: 0, pitch: 0 });

describe("applyLook", () => {
  it("感度は 1px あたり LOOK_SENSITIVITY rad", () => {
    const l = applyLook(look(), 100, 50);
    expect(l.yaw).toBeCloseTo(-100 * LOOK_SENSITIVITY);
    expect(l.pitch).toBeCloseTo(-50 * LOOK_SENSITIVITY);
  });

  it("右(dx>0)で yaw が減り、左で増える", () => {
    expect(applyLook(look(), 10, 0).yaw).toBeLessThan(0);
    expect(applyLook(look(), -10, 0).yaw).toBeGreaterThan(0);
  });

  it("上(dy<0)で pitch が増え、下で減る", () => {
    expect(applyLook(look(), 0, -10).pitch).toBeGreaterThan(0);
    expect(applyLook(look(), 0, 10).pitch).toBeLessThan(0);
  });

  it("pitch は ±π/2 の手前でクランプされる", () => {
    const up = applyLook(look(), 0, -1e6).pitch;
    const down = applyLook(look(), 0, 1e6).pitch;
    expect(up).toBeLessThan(Math.PI / 2);
    expect(up).toBeGreaterThan(Math.PI / 2 - 0.01);
    expect(down).toBe(-up);
  });

  it("yaw はクランプされず累積する", () => {
    const l = applyLook(look(), -1e4, 0);
    expect(l.yaw).toBeGreaterThan(Math.PI * 2);
  });
});
