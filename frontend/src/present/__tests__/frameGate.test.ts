import {describe, expect, it} from "vitest";

import {createFrameGate} from "../frameGate";

const ticksOver = (hz: number, ms: number): number => {
  const open = createFrameGate();
  let count = 0;
  for (let frame = 0; frame < (hz * ms) / 1000; frame++) {
    if (open((frame * 1000) / hz)) {
      count++;
    }
  }
  return count;
};

describe("createFrameGate", () => {
  it("60Hz の画面では毎フレーム通す", () => {
    expect(ticksOver(60, 1000)).toBe(60);
  });

  it("120Hz の画面では 1 フレームおきに通して 60 回にする", () => {
    expect(ticksOver(120, 1000)).toBe(60);
  });

  it("止まっていたあとは溜まった分をまとめて通さない", () => {
    const open = createFrameGate();
    expect(open(0)).toBe(true);
    expect(open(1000)).toBe(true);
    expect(open(1001)).toBe(false);
  });
});
