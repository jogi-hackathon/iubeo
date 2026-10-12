import {Group, Mesh} from "three";
import {describe, expect, it} from "vitest";

import {exposeForWarmup, firstMeshOf} from "../warmupExposure";

describe("exposeForWarmup", () => {
  it("非表示の物を表示し、視錐台カリングを切り、戻すと変えた物だけ元に戻る", () => {
    const root = new Group();
    const hiddenGroup = new Group();
    hiddenGroup.visible = false;
    const child = new Mesh();
    hiddenGroup.add(child);
    const uncullled = new Mesh();
    uncullled.frustumCulled = false;
    root.add(hiddenGroup, uncullled);

    const restore = exposeForWarmup(root);
    expect(hiddenGroup.visible).toBe(true);
    expect(child.visible).toBe(true);
    expect(child.frustumCulled).toBe(false);
    expect(uncullled.frustumCulled).toBe(false);

    restore();
    expect(hiddenGroup.visible).toBe(false);
    expect(child.visible).toBe(true);
    expect(child.frustumCulled).toBe(true);
    expect(uncullled.frustumCulled).toBe(false);
  });

  it("元から表示の物は記録せず、戻すときに触らない", () => {
    const root = new Group();
    const mesh = new Mesh();
    mesh.visible = true;
    root.add(mesh);
    const restore = exposeForWarmup(root);
    mesh.visible = false;
    restore();
    expect(mesh.visible).toBe(false);
  });
});

describe("firstMeshOf", () => {
  it("group を飛ばして最初の mesh を返す。無ければ null", () => {
    const root = new Group();
    expect(firstMeshOf(root)).toBeNull();
    const mesh = new Mesh();
    root.add(new Group(), mesh, new Mesh());
    expect(firstMeshOf(root)).toBe(mesh);
  });
});
