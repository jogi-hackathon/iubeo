import {describe, expect, it} from "vitest";

import {isSkipGTAO} from "../../../camera/postprocess/skipGTAO";
import {FROSTED_GLASS, createFrostedGlassMaterial} from "../frostedGlass";
import {PARTITION_AXIS} from "../layout";

describe("すりガラスのマテリアル", () => {
  it("透明で、深度を書かず、GTAO を掛けない(背後を自分で見せる)", () => {
    const material = createFrostedGlassMaterial(PARTITION_AXIS);
    expect(material.transparent).toBe(true);
    expect(material.depthWrite).toBe(false);
    expect(isSkipGTAO(material)).toBe(true);
    expect(material.colorNode).not.toBeNull();
    material.dispose();
  });

  it("調整値を変えても組み立てられる(サンプル数 1、格子あり)", () => {
    const material = createFrostedGlassMaterial(PARTITION_AXIS, {
      ...FROSTED_GLASS,
      blurSamples: 1,
      gridOpacity: 0.7,
    });
    expect(material.colorNode).not.toBeNull();
    material.dispose();
  });

  it("既定値は、シェーダーが組み立てられる有効な範囲(見た目の強さは好みで調整する)", () => {
    expect(Number.isInteger(FROSTED_GLASS.blurSamples)).toBe(true);
    expect(FROSTED_GLASS.blurSamples).toBeGreaterThanOrEqual(1);
    expect(FROSTED_GLASS.blurMipLevel).toBeGreaterThanOrEqual(0);
    expect(FROSTED_GLASS.distortion).toBeGreaterThanOrEqual(0);
    for (const ratio of [
      FROSTED_GLASS.noiseDetail,
      FROSTED_GLASS.gridTone,
      FROSTED_GLASS.gridOpacity,
    ]) {
      expect(ratio).toBeGreaterThanOrEqual(0);
      expect(ratio).toBeLessThanOrEqual(1);
    }
    expect(FROSTED_GLASS.gridSpacing).toBeGreaterThan(0);
  });
});
