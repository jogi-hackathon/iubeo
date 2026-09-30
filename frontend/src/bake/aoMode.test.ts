import {Group, Mesh} from "three";
import {describe, expect, it} from "vitest";

import {aoModeOf, aoModeUserData, DEFAULT_AO_MODE, skipsGTAO} from "./aoMode";

describe("aoModeOf", () => {
  it("指定が無ければ既定値", () => {
    expect(aoModeOf(new Mesh())).toBe(DEFAULT_AO_MODE);
  });

  it("祖先の指定を引き継ぎ、近い方の指定を優先する", () => {
    const outer = new Group();
    outer.userData = aoModeUserData("realtime");
    const inner = new Group();
    const mesh = new Mesh();
    outer.add(inner);
    inner.add(mesh);
    expect(aoModeOf(mesh)).toBe("realtime");
    mesh.userData = aoModeUserData("both");
    expect(aoModeOf(mesh)).toBe("both");
  });

  it("aoModeUserData(undefined) は何も指定しない", () => {
    expect(aoModeUserData(undefined)).toEqual({});
  });
});

describe("skipsGTAO", () => {
  it("すべて baked のときだけ GTAO を省く", () => {
    expect(skipsGTAO(["baked", "baked"])).toBe(true);
    expect(skipsGTAO(["baked", "both"])).toBe(false);
    expect(skipsGTAO([])).toBe(false);
  });
});
