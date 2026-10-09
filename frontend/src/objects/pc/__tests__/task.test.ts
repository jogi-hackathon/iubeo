import {describe, expect, it} from "vitest";

import {createTaskStore, initialTask, pickTask, TASK_PRESETS} from "../task";

describe("pickTask", () => {
  it("今のお題とは別の語を引く", () => {
    const current = TASK_PRESETS[0] ?? "";
    for (let i = 0; i < 50; i += 1) {
      expect(pickTask(current)).not.toBe(current);
    }
  });

  it("乱数の値に応じて、プリセットから決まった語を引く", () => {
    expect(pickTask(undefined, () => 0)).toBe(TASK_PRESETS[0]);
    expect(pickTask(undefined, () => 0.999)).toBe(
      TASK_PRESETS[TASK_PRESETS.length - 1],
    );
  });
});

describe("initialTask", () => {
  it("?task= があれば、その語をそのまま使う", () => {
    expect(initialTask("?task=WebAssembly")).toBe("WebAssembly");
    expect(initialTask("?foo=1&task=%20Vite%20")).toBe("Vite");
  });

  it("?task= が無ければ、プリセットから引く", () => {
    expect(TASK_PRESETS).toContain(initialTask("?debug"));
  });
});

describe("createTaskStore", () => {
  it("引き直すと、新しいお題に変わって購読者へ知らせる", () => {
    const store = createTaskStore("Vite");
    const seen: string[] = [];
    store.subscribe(() => seen.push(store.getTask()));

    const next = store.draw(() => 0);
    expect(next).not.toBe("Vite");
    expect(store.getTask()).toBe(next);
    expect(seen).toEqual([next]);
  });
});
