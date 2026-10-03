import {Group, Mesh, MeshStandardMaterial} from "three";
import {describe, expect, it} from "vitest";

import {
  createWarmupTracker,
  sceneSignature,
  WARMUP_MAX_MS,
  WARMUP_STABLE_MS,
} from "../warmupTracker";

describe("sceneSignature", () => {
  it("mesh の追加とマテリアルの needsUpdate で変わる", () => {
    const root = new Group();
    const material = new MeshStandardMaterial();
    root.add(new Mesh(undefined, material));
    const a = sceneSignature(root);
    expect(sceneSignature(root)).toBe(a);

    material.needsUpdate = true;
    const b = sceneSignature(root);
    expect(b).not.toBe(a);

    root.add(new Mesh(undefined, material));
    expect(sceneSignature(root)).not.toBe(b);
  });

  it("uniform 相当の値の変化では変わらない", () => {
    const root = new Group();
    const material = new MeshStandardMaterial();
    root.add(new Mesh(undefined, material));
    const a = sceneSignature(root);
    material.aoMapIntensity = 0.5;
    expect(sceneSignature(root)).toBe(a);
  });
});

describe("createWarmupTracker", () => {
  it("構成が WARMUP_STABLE_MS 変わらなければ終わる", () => {
    const t = createWarmupTracker(0);
    expect(t.update("a", 0)).toBe(false);
    expect(t.update("a", WARMUP_STABLE_MS - 1)).toBe(false);
    expect(t.update("a", WARMUP_STABLE_MS)).toBe(true);
  });

  it("構成が変わると待ち直す", () => {
    const t = createWarmupTracker(0);
    t.update("a", 0);
    expect(t.update("b", WARMUP_STABLE_MS)).toBe(false);
    expect(t.update("b", WARMUP_STABLE_MS * 2)).toBe(true);
  });

  it("held の間は終わらず、外れてから WARMUP_STABLE_MS 待つ", () => {
    const t = createWarmupTracker(0);
    t.update("a", 0, true);
    expect(t.update("a", WARMUP_STABLE_MS * 2, true)).toBe(false);
    expect(t.update("a", WARMUP_STABLE_MS * 3 - 1)).toBe(false);
    expect(t.update("a", WARMUP_STABLE_MS * 3)).toBe(true);
  });

  it("held のままでも WARMUP_MAX_MS で打ち切る", () => {
    const t = createWarmupTracker(0);
    expect(t.update("a", WARMUP_MAX_MS - 1, true)).toBe(false);
    expect(t.update("a", WARMUP_MAX_MS, true)).toBe(true);
  });

  it("変わり続けても WARMUP_MAX_MS で打ち切る", () => {
    const t = createWarmupTracker(0);
    let now = 0;
    for (; now < WARMUP_MAX_MS; now += 100) {
      expect(t.update(String(now), now)).toBe(false);
    }
    expect(t.update(String(now), now)).toBe(true);
  });
});
