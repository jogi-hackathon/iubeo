import {MeshStandardMaterial} from "three";
import {describe, expect, it} from "vitest";

import {getSkipGTAO, isSkipGTAO, setSkipGTAO} from "../skipGTAO";

describe("skipGTAO", () => {
  it("未設定は false、true を入れると true", () => {
    const m = new MeshStandardMaterial();
    expect(isSkipGTAO(m)).toBe(false);
    expect(getSkipGTAO(m)).toBeUndefined();
    setSkipGTAO(m, true);
    expect(isSkipGTAO(m)).toBe(true);
    setSkipGTAO(m, false);
    expect(isSkipGTAO(m)).toBe(false);
    expect(getSkipGTAO(m)).toBe(false);
  });

  it("undefined で目印ごと外れる(own プロパティも残らない)", () => {
    const m = new MeshStandardMaterial();
    setSkipGTAO(m, true);
    setSkipGTAO(m, undefined);
    expect(Object.keys(m)).not.toContain("skipGTAO");
  });

  it("シェーダのキャッシュキーが見る own の列挙可能プロパティに入る", () => {
    const m = new MeshStandardMaterial();
    setSkipGTAO(m, false);
    expect(Object.keys(m)).toContain("skipGTAO");
  });
});
