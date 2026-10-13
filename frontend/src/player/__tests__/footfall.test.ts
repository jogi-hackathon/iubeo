import {Vector3} from "three";
import {describe, expect, it} from "vitest";

import {createFootfall} from "../footfall";
import {STRIDE_LENGTH} from "../skeleton/animator";

const sensed = (vx: number, vy: number, onGround: boolean) => ({
  velocity: new Vector3(vx, vy, 0),
  onGround,
  yaw: -Math.PI / 2,
});

describe("footfall", () => {
  it("歩行アニメーションの足が着く位相(1 周に 2 回)ごとに step を出す", () => {
    const f = createFootfall();
    const walking = sensed(4, 0, true);
    const kinds: string[] = [];
    const frames = Math.ceil(((STRIDE_LENGTH / 2) * 3) / (4 / 60)) + 1;
    for (let i = 0; i < frames; i++) {
      kinds.push(...f.update(walking, 1 / 60).map((e) => e.kind));
    }
    expect(kinds).toEqual(["step", "step", "step"]);
  });

  it("止まっている間は step を出さない", () => {
    const f = createFootfall();
    expect(f.update(sensed(0, 0, true), 10)).toEqual([]);
  });

  it("上向きの速度で地面を離れたら jump、落ちて着いたら速さに応じた land を出す", () => {
    const f = createFootfall();
    expect(f.update(sensed(0, 5, false), 1 / 60)).toEqual([{kind: "jump"}]);
    f.update(sensed(0, -6, false), 1 / 60);
    expect(f.update(sensed(0, 0, true), 1 / 60)).toEqual([
      {kind: "land", amount: 0.5},
    ]);
  });

  it("縁から歩き落ちても jump は出さず、小さな着地は land にしない", () => {
    const f = createFootfall();
    expect(f.update(sensed(2, -0.5, false), 1 / 60)).toEqual([]);
    expect(f.update(sensed(0, 0, true), 1 / 60)).toEqual([]);
  });

  it("reset すると現在の接地状態から数え直す", () => {
    const f = createFootfall();
    f.update(sensed(0, 5, false), 1 / 60);
    f.reset(sensed(0, 0, true));
    expect(f.update(sensed(0, 0, true), 1 / 60)).toEqual([]);
  });
});
