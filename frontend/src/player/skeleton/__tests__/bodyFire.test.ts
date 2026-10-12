import {Vector3} from "three";
import {describe, expect, it} from "vitest";

import {BODY_FIRE_SECONDS, bodyFireIgnition} from "../BodyFire";
import {CLIPS} from "../clips";
import {bodyDecay, createSkeletonMaterials, MAX_DECAY} from "../decay";
import {writeSplashSource} from "../HeadSplash";
import {J} from "../joints";
import {frameOf} from "../pose";
import {createRagdoll, startRagdoll} from "../ragdoll";

describe("bodyFireIgnition", () => {
  it("すぐに燃え上がり、しばらく燃え続ける", () => {
    expect(bodyFireIgnition(0)).toBe(0);
    expect(bodyFireIgnition(0.15)).toBeGreaterThan(0);
    expect(bodyFireIgnition(1)).toBe(1);
    expect(bodyFireIgnition(3)).toBe(1);
  });

  it("最後はだんだん弱まり、BODY_FIRE_SECONDS で消える", () => {
    const late = bodyFireIgnition(BODY_FIRE_SECONDS - 0.5);
    expect(late).toBeGreaterThan(0);
    expect(late).toBeLessThan(1);
    expect(bodyFireIgnition(BODY_FIRE_SECONDS)).toBe(0);
    expect(bodyFireIgnition(BODY_FIRE_SECONDS + 10)).toBe(0);
  });
});

describe("writeSplashSource", () => {
  it("脱落した瞬間の頭の位置から、頭が弾かれた向き(yaw=0 なら +Z 寄り)へ飛ばす", () => {
    const r = createRagdoll();
    startRagdoll(
      r,
      frameOf(CLIPS.idle, 0),
      new Vector3(1, 0, 2),
      0,
      new Vector3(),
      () => 0.5,
    );
    const origin = new Vector3();
    const direction = new Vector3();
    writeSplashSource(r, origin, direction);
    expect(origin.toArray()).toEqual(
      Array.from(r.pos.slice(J.head * 3, J.head * 3 + 3)),
    );
    expect(direction.length()).toBeCloseTo(1);
    expect(direction.z).toBeGreaterThan(0.9);
  });
});

describe("bodyDecay", () => {
  it("生きている間は欠けず、炎の間に MAX_DECAY まで欠けて、そのまま残る", () => {
    expect(bodyDecay(-1)).toBe(0);
    expect(bodyDecay(0)).toBe(0);
    expect(bodyDecay(BODY_FIRE_SECONDS / 2)).toBeCloseTo(MAX_DECAY / 2);
    expect(bodyDecay(BODY_FIRE_SECONDS)).toBe(MAX_DECAY);
    expect(bodyDecay(BODY_FIRE_SECONDS * 10)).toBe(MAX_DECAY);
  });

  it("マテリアルは欠けない状態で作られる", () => {
    const m = createSkeletonMaterials("#ffffff", "#000000");
    expect(m.decay.value).toBe(0);
    expect(m.blink.value).toBe(0);
    m.dispose();
  });
});
