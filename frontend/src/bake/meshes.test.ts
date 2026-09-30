import {BoxGeometry, Mesh} from "three";
import {describe, expect, it} from "vitest";

import {sortKey} from "./meshes";

describe("sortKey", () => {
  it("同じ中心・同じ頂点数でもサイズが違えば別のキーになる(十字に置いた箱)", () => {
    const a = new Mesh(new BoxGeometry(10, 1, 1));
    const b = new Mesh(new BoxGeometry(1, 1, 10));
    expect(sortKey(a)).not.toEqual(sortKey(b));
  });

  it("mm 未満の誤差では変わらない", () => {
    const a = new Mesh(new BoxGeometry(1, 1, 1));
    const b = new Mesh(new BoxGeometry(1, 1, 1));
    b.position.set(0.0001, 0, 0);
    expect(sortKey(a)).toEqual(sortKey(b));
  });
});
