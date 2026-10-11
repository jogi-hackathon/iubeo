import {describe, expect, it} from "vitest";

import {TUTORIAL_STEPS} from "../../../tutorial";
import {
  calmLook,
  COMPLETED_LOOK,
  HIDDEN_LOOK,
  lookFor,
  reveals,
  toggleInitialFor,
  TUTORIAL_OBJECT_KEYS,
} from "../tutorialLook";

describe("lookFor", () => {
  it("すべてのステップに見え方がある(未定義の id は HIDDEN にならない)", () => {
    for (const [i, step] of TUTORIAL_STEPS.entries()) {
      const look = lookFor({status: "running", stepIndex: i, step});
      if (step.id !== "chair") {
        expect(look).not.toBe(HIDDEN_LOOK);
      }
    }
  });

  it("ハイライトと機能 ON は、表示中のオブジェクトだけ", () => {
    for (const [i, step] of TUTORIAL_STEPS.entries()) {
      const look = lookFor({status: "running", stepIndex: i, step});
      for (const key of [...look.highlighted, ...look.enabled]) {
        expect(look.visible).toContain(key);
      }
    }
  });

  it("手前のファイルを出すのは takeFile だけ", () => {
    const ids = TUTORIAL_STEPS.flatMap((step, i) =>
      lookFor({status: "running", stepIndex: i, step}).pickupFile
        ? [step.id]
        : [],
    );
    expect(ids).toEqual(["takeFile"]);
  });

  it("idle は隠し、完了は全部表示して全部機能 OFF", () => {
    expect(lookFor({status: "idle"})).toBe(HIDDEN_LOOK);
    expect(lookFor({status: "completed"})).toBe(COMPLETED_LOOK);
    expect(COMPLETED_LOOK.visible).toEqual(TUTORIAL_OBJECT_KEYS);
    expect(COMPLETED_LOOK.enabled).toEqual([]);
  });
});

describe("toggleInitialFor", () => {
  it("完了後は何も隠さず、全オブジェクトと俯瞰を機能 OFF にする", () => {
    const initial = toggleInitialFor(COMPLETED_LOOK);
    expect(initial.hidden).toEqual([]);
    expect(initial.disabled).toEqual([
      ...TUTORIAL_OBJECT_KEYS,
      "directory:overview",
    ]);
  });

  it("最初は全オブジェクトを隠す", () => {
    expect(toggleInitialFor(HIDDEN_LOOK).hidden).toEqual([
      ...TUTORIAL_OBJECT_KEYS,
    ]);
  });
});

describe("calmLook", () => {
  it("表示はそのままで、機能・ハイライト・手前のファイルだけ止める", () => {
    const step = TUTORIAL_STEPS.find((s) => s.id === "takeFile");
    if (!step) {
      throw new Error("takeFile がありません");
    }
    const look = lookFor({status: "running", stepIndex: 3, step});
    expect(look.pickupFile).toBe(true);
    expect(calmLook(look)).toEqual({
      visible: look.visible,
      enabled: [],
      highlighted: [],
      pickupFile: false,
    });
  });
});

describe("reveals", () => {
  const look = (
    visible: readonly (typeof TUTORIAL_OBJECT_KEYS)[number][],
    pickupFile = false,
  ) => ({visible, enabled: [], highlighted: [], pickupFile});

  it("新しく表示されるオブジェクトがあれば true", () => {
    expect(reveals(look([]), look(["workspace"]))).toBe(true);
    expect(reveals(look(["workspace"]), look(["workspace", "directory"]))).toBe(
      true,
    );
  });

  it("手前のファイルが新しく出るなら true", () => {
    expect(reveals(look(["directory"]), look(["directory"], true))).toBe(true);
  });

  it("表示が増えず、ハイライトや機能だけが変わるなら false", () => {
    expect(
      reveals(look(["workspace"]), {
        ...look(["workspace"]),
        highlighted: ["workspace"],
      }),
    ).toBe(false);
    expect(reveals(look(["workspace", "directory"]), look(["workspace"]))).toBe(
      false,
    );
    expect(reveals(look([], true), look([], true))).toBe(false);
  });
});
