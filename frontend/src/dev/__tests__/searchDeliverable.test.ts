import {describe, expect, it} from "vitest";

import type {CreatedStatus} from "../../items/file";
import {FILE_KIND} from "../../items/file";
import type {Item} from "../../items/types";
import {createJudgeStore, type JudgeResult} from "../../objects/pc/judge";
import {
  installSearchDeliverable,
  SEARCH_DELIVERABLE_STATUS,
} from "../searchDeliverable";

const page = {
  url: "https://threejs.org/docs/",
  title: "three.js",
  text: "docs",
};

const match: JudgeResult = {
  verdict: "match",
  score: 1,
  confidence: 0.9,
  reasons: ["検索がお題の語を指しています"],
  source: "clef",
};

const mismatch: JudgeResult = {
  ...match,
  verdict: "mismatch",
  score: 0,
};

const setup = (result: JudgeResult) => {
  const spawned: CreatedStatus[] = [];
  const authority = {
    spawnNewFile: (status: CreatedStatus = "file_created") => {
      spawned.push(status);
      return "file-1";
    },
  };
  const judge = createJudgeStore({judge: async () => result});
  let held: Item | null = null;
  const off = installSearchDeliverable({
    authority,
    judge,
    items: {getHeld: () => held},
  });
  return {
    spawned,
    judge,
    off,
    hold: (id: string | null) => {
      held = id === null ? null : {id, kind: FILE_KIND, data: null};
    },
  };
};

describe("installSearchDeliverable", () => {
  it("判定が通ったら、検索の成果物を手に持たせる", async () => {
    const {spawned, judge} = setup(match);
    await judge.run({task: "three.js", page});
    expect(spawned).toEqual([SEARCH_DELIVERABLE_STATUS]);
    expect(SEARCH_DELIVERABLE_STATUS).toBe("search_created");
  });

  it("外れていたら渡さない", async () => {
    const {spawned, judge} = setup(mismatch);
    await judge.run({task: "three.js", page});
    expect(spawned).toEqual([]);
  });

  it("同じページでは二度渡さない", async () => {
    const {spawned, judge} = setup(match);
    await judge.run({task: "three.js", page});
    await judge.run({task: "three.js", page});
    expect(spawned).toHaveLength(1);
  });

  it("手が塞がっていたら渡さない（持っていた物を消さない）", async () => {
    const {spawned, judge, hold} = setup(match);
    hold("file-9");
    await judge.run({task: "three.js", page});
    expect(spawned).toEqual([]);
  });

  it("解除したら見張りをやめる", async () => {
    const {spawned, judge, off} = setup(match);
    off();
    await judge.run({task: "three.js", page});
    expect(spawned).toEqual([]);
  });
});
