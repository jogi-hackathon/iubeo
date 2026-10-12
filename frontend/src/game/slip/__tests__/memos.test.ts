import {describe, expect, it} from "vitest";

import {SAMPLE_SLIP} from "../content";
import {createMemosStore} from "../memos";

describe("memos", () => {
  it("ワークスペースごとに最新の 1 枚を残し、clear で全部消える", () => {
    const store = createMemosStore();
    store.place("workspace-1", SAMPLE_SLIP);
    store.place("workspace-1", {...SAMPLE_SLIP, phase: 4});
    store.place("workspace-2", SAMPLE_SLIP);
    expect(store.getState().byWorkspace["workspace-1"]?.phase).toBe(4);
    expect(store.getState().byWorkspace["workspace-2"]).toBe(SAMPLE_SLIP);
    store.clear();
    expect(store.getState().byWorkspace).toEqual({});
  });
});
