import {describe, expect, it} from "vitest";

import {KEYBOARD} from "../dimensions";
import {KEY_COUNT, keyboardKeysWidth, keyPositions, keySize} from "../keyboard";

describe("keyPositions", () => {
  const positions = keyPositions(KEYBOARD.z, KEYBOARD.depth);

  it("本体のブロックとテンキーを合わせた数を返す", () => {
    expect(positions).toHaveLength(KEY_COUNT);
    expect(KEY_COUNT).toBe(95);
  });

  it("キーの粒が、実物に近い大きさと間隔で並ぶ", () => {
    // 1u = 19mm。同じ列のキー（15 個ごと）の間隔がピッチと一致する
    const column = [0, 15, 30, 45, 60].map(
      (index) => positions[index]?.[1] ?? 0,
    );
    for (let row = 1; row < column.length; row += 1) {
      expect((column[row] ?? 0) - (column[row - 1] ?? 0)).toBeCloseTo(0.019, 6);
    }
    expect(keySize()).toBeLessThan(0.019);
  });

  it("キーボードの台の中に収まる", () => {
    const half = KEYBOARD.width / 2;
    const front = KEYBOARD.z - KEYBOARD.depth / 2;
    const back = KEYBOARD.z + KEYBOARD.depth / 2;
    for (const [x, z] of positions) {
      expect(Math.abs(x) + keySize() / 2).toBeLessThanOrEqual(half);
      expect(z - keySize() / 2).toBeGreaterThanOrEqual(front);
      expect(z + keySize() / 2).toBeLessThanOrEqual(back);
    }
  });

  it("テンキーは本体のブロックの右に、少し空けて置く", () => {
    const main = positions.slice(0, 75).map(([x]) => x);
    const pad = positions.slice(75).map(([x]) => x);
    expect(Math.min(...pad)).toBeGreaterThan(Math.max(...main));
    expect(Math.min(...pad) - Math.max(...main)).toBeGreaterThan(0.022);
  });

  it("全体の幅は台の内側に収まる", () => {
    expect(keyboardKeysWidth()).toBeLessThan(KEYBOARD.width);
  });
});
