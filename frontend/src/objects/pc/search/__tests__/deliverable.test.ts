import {describe, expect, it, vi} from "vitest";

import {createSearchDeliverable} from "../deliverable";
import type {JudgeState, JudgeVerdict} from "../judge";

const done = (
  verdict: JudgeVerdict,
  url = "https://threejs.org/docs/",
): JudgeState => ({
  status: "done",
  task: "three.js",
  url,
  result: {verdict, score: 1, confidence: 0.9, reasons: [], source: "clef"},
});

const setup = ({held = false} = {}) => {
  const interact = vi.fn(() => true);
  const deliverable = createSearchDeliverable({interact, held: () => held});
  return {interact, deliverable};
};

describe("createSearchDeliverable", () => {
  it("判定が一致なら、使っている PC へ interact を送る", () => {
    const {interact, deliverable} = setup();
    expect(deliverable.onJudge(done("match"), "pc-1")).toBe(true);
    expect(interact).toHaveBeenCalledWith("pc-1");
  });

  it("一致でなければ送らない", () => {
    const {interact, deliverable} = setup();
    for (const verdict of ["partial", "mismatch"] as const) {
      expect(deliverable.onJudge(done(verdict), "pc-1")).toBe(false);
    }
    expect(interact).not.toHaveBeenCalled();
  });

  it("判定中・待機中・失敗は送らない", () => {
    const {interact, deliverable} = setup();
    const states: JudgeState[] = [
      {status: "idle"},
      {status: "running", task: "three.js", url: "https://threejs.org/"},
      {
        status: "error",
        task: "three.js",
        url: "https://threejs.org/",
        message: "x",
      },
    ];
    for (const state of states) {
      expect(deliverable.onJudge(state, "pc-1")).toBe(false);
    }
    expect(interact).not.toHaveBeenCalled();
  });

  it("同じページでは二度送らない", () => {
    const {interact, deliverable} = setup();
    expect(deliverable.onJudge(done("match"), "pc-1")).toBe(true);
    expect(deliverable.onJudge(done("match"), "pc-1")).toBe(false);
    expect(interact).toHaveBeenCalledTimes(1);
  });

  it("別のページなら、また送る", () => {
    const {interact, deliverable} = setup();
    deliverable.onJudge(done("match", "https://threejs.org/"), "pc-1");
    deliverable.onJudge(done("match", "https://mdn.io/"), "pc-1");
    expect(interact).toHaveBeenCalledTimes(2);
  });

  it("手が塞がっていたら送らない（持っていた物を消さない）", () => {
    const {interact, deliverable} = setup({held: true});
    expect(deliverable.onJudge(done("match"), "pc-1")).toBe(false);
    expect(interact).not.toHaveBeenCalled();
  });

  it("reset したら、同じページでもまた送れる", () => {
    const {interact, deliverable} = setup();
    deliverable.onJudge(done("match"), "pc-1");
    deliverable.reset();
    deliverable.onJudge(done("match"), "pc-1");
    expect(interact).toHaveBeenCalledTimes(2);
  });
});
