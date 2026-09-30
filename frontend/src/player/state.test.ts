import {Vector3} from "three";
import {describe, expect, it} from "vitest";

import {EYE_HEIGHT} from "./constants";
import {createPlayerState, getEyePosition} from "./state";

describe("createPlayerState", () => {
  it("向きは yaw=0, pitch=0(-Z 前・水平)で始まる", () => {
    const s = createPlayerState(1, 2, 3);
    expect(s.position.toArray()).toEqual([1, 2, 3]);
    expect(s.yaw).toBe(0);
    expect(s.pitch).toBe(0);
  });
});

describe("getEyePosition", () => {
  it("足元から EYE_HEIGHT だけ上、状態は変更しない", () => {
    const s = createPlayerState(1, 2, 3);
    const out = new Vector3();
    expect(getEyePosition(s, out)).toBe(out);
    expect(out.toArray()).toEqual([1, 2 + EYE_HEIGHT, 3]);
    expect(s.position.toArray()).toEqual([1, 2, 3]);
  });
});
