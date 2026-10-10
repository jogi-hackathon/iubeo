import {describe, expect, it} from "vitest";

import {
  directoryItem,
  featureKey,
  kindOfId,
  matchLayout,
  type SceneLayout,
} from "../layout";
import type {GameObject} from "../types";

const obj = (id: string): GameObject =>
  ({
    id,
    kind: kindOfId(id),
    scope: "shared",
    users: [],
    availability: "available",
    data: {},
  }) as unknown as GameObject;

describe("kindOfId", () => {
  it("接頭辞(最後の数字より前)を種類として返す", () => {
    expect(kindOfId("directory-1")).toBe("directory");
    expect(kindOfId("dummy-12")).toBe("dummy");
    expect(kindOfId("pc")).toBe("pc");
  });
});

describe("featureKey", () => {
  it("項目名と機能名を : でつなぐ", () => {
    expect(featureKey("directory", "overview")).toBe("directory:overview");
  });
});

describe("directoryItem", () => {
  it("yaw を持たない項目をそのまま返す", () => {
    expect(
      directoryItem({id: "directory-1", position: [0, 0, 0], look: "small"}),
    ).toEqual({
      id: "directory-1",
      position: [0, 0, 0],
      look: "small",
    });
  });
});

describe("matchLayout", () => {
  const layout: SceneLayout = {
    directory: {id: "directory-1", position: [0, 0, 0]},
    workspace: {id: "workspace-1", position: [1, 0, 0], yaw: Math.PI},
  };

  it("id が一致するオブジェクトを項目名つきで割り当て、残りを unmatched にする", () => {
    const d = obj("directory-1");
    const x = obj("dummy-9");
    const w = obj("workspace-1");
    const result = matchLayout(layout, [d, x, w]);
    expect(result.assigned.map((a) => [a.name, a.object])).toEqual([
      ["directory", d],
      ["workspace", w],
    ]);
    expect(result.assigned[1]?.item).toBe(layout.workspace);
    expect(result.unmatched).toEqual([x]);
  });

  it("オブジェクトの順を保つ", () => {
    const a = obj("workspace-1");
    const b = obj("directory-1");
    const result = matchLayout(layout, [a, b]);
    expect(result.assigned.map((x) => x.object)).toEqual([a, b]);
  });

  it("空のレイアウトでは全部 unmatched", () => {
    const x = obj("directory-1");
    expect(matchLayout({}, [x])).toEqual({assigned: [], unmatched: [x]});
  });

  it("同じ id の項目が複数あれば先の項目を使う", () => {
    const dup: SceneLayout = {
      first: {id: "pc-1", position: [0, 0, 0]},
      second: {id: "pc-1", position: [5, 0, 0]},
    };
    const result = matchLayout(dup, [obj("pc-1")]);
    expect(result.assigned[0]?.name).toBe("first");
  });

  it("オブジェクトが無ければ空", () => {
    expect(matchLayout(layout, [])).toEqual({assigned: [], unmatched: []});
  });
});
