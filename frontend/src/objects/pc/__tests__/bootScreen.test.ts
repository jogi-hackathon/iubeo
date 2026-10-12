import {describe, expect, it} from "vitest";

import {BOOT_MS, bootFrame} from "../bootScreen";

describe("起動画面", () => {
  it("初めは真っ黒で、少し置いてからロゴが浮かび、そのあと棒が出る", () => {
    expect(bootFrame(0)).toEqual({logo: 0, bar: 0, blocks: 0});
    expect(bootFrame(1500).logo).toBeCloseTo(0.5);
    expect(bootFrame(1500).bar).toBe(0);
    expect(bootFrame(2600)).toMatchObject({logo: 1, bar: 1, blocks: 0});
  });

  it("棒は止まりながら埋まり、埋まりきってから少し待って消える", () => {
    const blocks = [3000, 4000, 5000, 6000, 7000, 7400].map(
      (t) => bootFrame(t).blocks,
    );
    expect(blocks[0]).toBe(0);
    expect(blocks.at(-1)).toBe(20);
    expect(blocks).toEqual([...blocks].sort((a, b) => a - b));
    expect(bootFrame(8000)).toMatchObject({logo: 1, bar: 1, blocks: 20});
    expect(bootFrame(9000)).toMatchObject({logo: 0, bar: 0});
  });

  it("消えきってからデスクトップに切り替わる", () => {
    expect(bootFrame(BOOT_MS)).toMatchObject({logo: 0, bar: 0});
  });
});
