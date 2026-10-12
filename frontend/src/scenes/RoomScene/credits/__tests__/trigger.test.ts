import {Vector3} from "three";
import {describe, expect, it} from "vitest";

import {
  ROOM_INNER_X,
  WINDOW_CENTER_Z,
  WINDOW_SILL_HEIGHT,
  WINDOW_SIZE,
} from "../../layout";
import {GAZE_SECONDS, gazesAtWindow, inWindowZone, stepGaze} from "../trigger";

const centerY = WINDOW_SILL_HEIGHT + WINDOW_SIZE / 2;
const eye = new Vector3(-ROOM_INNER_X + 1, 1.6, WINDOW_CENTER_Z);
const toward = (x: number, y: number, z: number) =>
  new Vector3(x, y, z).sub(eye).normalize();

describe("inWindowZone", () => {
  it("窓のすぐ前は入る", () => {
    expect(inWindowZone(-ROOM_INNER_X + 0.5, WINDOW_CENTER_Z)).toBe(true);
  });

  it("部屋の真ん中や、窓の横にずれた壁ぎわは入らない", () => {
    expect(inWindowZone(0, WINDOW_CENTER_Z)).toBe(false);
    expect(inWindowZone(-ROOM_INNER_X + 0.5, WINDOW_CENTER_Z + 2)).toBe(false);
  });
});

describe("gazesAtWindow", () => {
  it("窓の中心を見ていれば true", () => {
    expect(
      gazesAtWindow(eye, toward(-ROOM_INNER_X, centerY, WINDOW_CENTER_Z)),
    ).toBe(true);
  });

  it("窓の上の壁・横の壁を見ていれば false", () => {
    expect(
      gazesAtWindow(
        eye,
        toward(-ROOM_INNER_X, centerY + WINDOW_SIZE, WINDOW_CENTER_Z),
      ),
    ).toBe(false);
    expect(
      gazesAtWindow(
        eye,
        toward(-ROOM_INNER_X, centerY, WINDOW_CENTER_Z + WINDOW_SIZE),
      ),
    ).toBe(false);
  });

  it("窓に背を向けていれば false(後ろへ伸ばした線は数えない)", () => {
    expect(gazesAtWindow(eye, new Vector3(1, 0, 0))).toBe(false);
    expect(gazesAtWindow(eye, new Vector3(0, 0, -1))).toBe(false);
  });
});

describe("stepGaze", () => {
  it("見ている間は足し、外れたら 0 に戻す", () => {
    expect(stepGaze(3, true, 0.5)).toBe(3.5);
    expect(stepGaze(19.9, false, 0.1)).toBe(0);
  });

  it("GAZE_SECONDS 見続けるとしきい値に届く", () => {
    let t = 0;
    for (let i = 0; i < GAZE_SECONDS * 20; i++) {
      t = stepGaze(t, true, 0.05);
    }
    expect(t).toBeGreaterThanOrEqual(GAZE_SECONDS - 1e-9);
  });
});
