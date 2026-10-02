import {Object3D} from "three";
import {afterEach, describe, expect, it} from "vitest";

import {outlineSelection, setOutlineSelection} from "../outlineSelection";

describe("outlineSelection", () => {
  afterEach(() => {
    setOutlineSelection([]);
  });

  it("入れ替えても、配列の参照は変わらない", () => {
    const ref = outlineSelection;
    setOutlineSelection([new Object3D()]);
    setOutlineSelection([new Object3D(), new Object3D()]);
    expect(outlineSelection).toBe(ref);
    expect(ref).toHaveLength(2);
  });

  it("前の中身は捨てて、渡した物に入れ替わる", () => {
    const a = new Object3D();
    const b = new Object3D();
    setOutlineSelection([a]);
    expect(outlineSelection).toEqual([a]);
    setOutlineSelection([b]);
    expect(outlineSelection).toEqual([b]);
  });

  it("空にできる", () => {
    setOutlineSelection([new Object3D()]);
    setOutlineSelection([]);
    expect(outlineSelection).toHaveLength(0);
  });
});
