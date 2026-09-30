import {Group, Mesh} from "three";
import {describe, expect, it} from "vitest";

import {
  getTarget,
  listTargets,
  OBJECT_ID_KEY,
  ownerObjectId,
  registerTarget,
} from "../targets";

describe("targets", () => {
  it("登録した根を引け、解除で外れる", () => {
    const root = new Group();
    const off = registerTarget("a", root);
    expect(getTarget("a")).toBe(root);
    expect(listTargets()).toContain(root);

    off();
    expect(getTarget("a")).toBeUndefined();
  });

  it("入れ替わった後の古い解除関数は、新しい根を外さない", () => {
    const oldRoot = new Group();
    const newRoot = new Group();
    const offOld = registerTarget("a", oldRoot);
    const offNew = registerTarget("a", newRoot);

    offOld();
    expect(getTarget("a")).toBe(newRoot);
    offNew();
  });

  it("当たった物から祖先をたどって、属するオブジェクトの id を返す", () => {
    const root = new Group();
    root.userData[OBJECT_ID_KEY] = "dir-1";
    const child = new Group();
    const mesh = new Mesh();
    root.add(child);
    child.add(mesh);

    expect(ownerObjectId(mesh)).toBe("dir-1");
  });

  it("どの祖先にも id が無ければ null(壁など)", () => {
    const wall = new Mesh();
    new Group().add(wall);
    expect(ownerObjectId(wall)).toBeNull();
  });
});
