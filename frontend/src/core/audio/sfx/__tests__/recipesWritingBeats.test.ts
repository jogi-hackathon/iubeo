import {describe, expect, it} from "vitest";

import {beatPitch, thinBeats} from "../recipes/writingBeats";
import type {WritingBeat, WritingLine} from "../types";

const beat = (at: number, line: number, x = 512): WritingBeat => ({
  at,
  line,
  x,
});
const body: WritingLine = {height: 16, shaded: false};
const code: WritingLine = {height: 14, shaded: true};
const sub: WritingLine = {height: 26, shaded: false};
const title: WritingLine = {height: 44, shaded: false};

describe("thinBeats", () => {
  it("同じ行で gap 未満のビートを飛ばす", () => {
    const kept = thinBeats(
      [beat(0, 1), beat(30, 1), beat(69, 1), beat(70, 1), beat(200, 1)],
      70,
    );
    expect(kept.map((b) => b.at)).toEqual([0, 70, 200]);
  });

  it("行が変わったビートは gap 未満でも残す", () => {
    const kept = thinBeats(
      [beat(0, 1), beat(10, 2), beat(20, 2), beat(30, 3)],
      70,
    );
    expect(kept.map((b) => b.at)).toEqual([0, 10, 30]);
  });

  it("最後のビートは gap 未満でも残す", () => {
    const kept = thinBeats([beat(0, 1), beat(500, 1), beat(510, 1)], 70);
    expect(kept.map((b) => b.at)).toEqual([0, 500, 510]);
  });

  it("飛ばしたビートは基準にならない", () => {
    const kept = thinBeats([beat(0, 1), beat(60, 1), beat(120, 1)], 70);
    expect(kept.map((b) => b.at)).toEqual([0, 120]);
  });

  it("空配列は空のまま", () => {
    expect(thinBeats([], 70)).toEqual([]);
  });
});

describe("beatPitch", () => {
  it("最後のビートと高さ 44 以上は 285", () => {
    expect(beatPitch(beat(0, 0), body, true, 0.6)).toBe(285);
    expect(beatPitch(beat(0, 0), title, false, 0.6)).toBe(285);
    expect(beatPitch(beat(0, 0), {height: 60, shaded: false}, false, 0.6)).toBe(
      285,
    );
  });

  it("高さ 26 以上 44 未満は 320", () => {
    expect(beatPitch(beat(0, 0), sub, false, 0.6)).toBe(320);
    expect(beatPitch(beat(0, 0), {height: 43, shaded: false}, false, 0.6)).toBe(
      320,
    );
  });

  it("本文は x が中央なら 380", () => {
    expect(beatPitch(beat(0, 0, 512), body, false, 0.6)).toBeCloseTo(380);
  });

  it("本文は右端で上がり左端で下がる", () => {
    const right = beatPitch(beat(0, 0, 1024), body, false, 1);
    const left = beatPitch(beat(0, 0, 0), body, false, 1);
    expect(right).toBeCloseTo(380 * 2 ** (2 / 12));
    expect(left).toBeCloseTo(380 * 2 ** (-2 / 12));
  });

  it("網掛けは 330 を中心に半分の幅で動く", () => {
    expect(beatPitch(beat(0, 0, 512), code, false, 0.6)).toBeCloseTo(330);
    expect(beatPitch(beat(0, 0, 1024), code, false, 1)).toBeCloseTo(
      330 * 2 ** (1 / 12),
    );
  });

  it("accent 0 なら x に依らず固定", () => {
    expect(beatPitch(beat(0, 0, 1024), body, false, 0)).toBeCloseTo(380);
    expect(beatPitch(beat(0, 0, 0), code, false, 0)).toBeCloseTo(330);
  });
});
