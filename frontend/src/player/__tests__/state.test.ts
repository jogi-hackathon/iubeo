import {Vector3} from "three";
import {describe, expect, it} from "vitest";

import {EYE_FORWARD, EYE_HEIGHT} from "../constants";
import {createPlayerState, getEyePosition} from "../state";

describe("createPlayerState", () => {
  it("向きは yaw=0, pitch=0(-Z 前・水平)で始まる", () => {
    const s = createPlayerState(1, 2, 3);
    expect(s.position.toArray()).toEqual([1, 2, 3]);
    expect(s.yaw).toBe(0);
    expect(s.pitch).toBe(0);
  });
});

describe("getEyePosition", () => {
  it("yaw=0 では足元から EYE_HEIGHT 上、EYE_FORWARD だけ前(-Z)。状態は変更しない", () => {
    const s = createPlayerState(1, 2, 3);
    const out = new Vector3();
    expect(getEyePosition(s, out)).toBe(out);
    expect(out.x).toBeCloseTo(1);
    expect(out.y).toBeCloseTo(2 + EYE_HEIGHT);
    expect(out.z).toBeCloseTo(3 - EYE_FORWARD);
    expect(s.position.toArray()).toEqual([1, 2, 3]);
  });

  it("前は身体の向きに従い、水平距離は常に EYE_FORWARD(pitch には依らない)", () => {
    const s = createPlayerState(0, 0, 0);
    const out = new Vector3();
    s.yaw = Math.PI / 2;
    s.pitch = 1;
    getEyePosition(s, out);
    expect(out.x).toBeCloseTo(-EYE_FORWARD);
    expect(out.z).toBeCloseTo(0);
    s.yaw = 0.7;
    getEyePosition(s, out);
    expect(Math.hypot(out.x, out.z)).toBeCloseTo(EYE_FORWARD);
  });
});
