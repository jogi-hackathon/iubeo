import {describe, expect, it} from "vitest";

import {LIGHTER_FOOTPRINT, LIGHTER_HEIGHT} from "../../../items";
import {HIT_SIZE, LIGHTER_REST} from "../stand";

describe("寝かせたライター", () => {
  it("斜めに置いても、四隅が見えない当たり判定の内側に収まり、厚さも当たり判定の高さより低い", () => {
    const [topX, topY, topZ] = HIT_SIZE;
    expect(LIGHTER_FOOTPRINT[1]).toBeLessThan(topY);
    // 寝かせたライターの足跡は、幅(x)× 長さ(高さだった向き。z)。蝶番の張り出しの分、幅には余裕を見る
    const halfW = LIGHTER_FOOTPRINT[0] / 2 + 0.003;
    const halfL = LIGHTER_HEIGHT / 2;
    const cos = Math.cos(LIGHTER_REST.yaw);
    const sin = Math.sin(LIGHTER_REST.yaw);
    for (const [x, z] of [
      [-halfW, -halfL],
      [halfW, -halfL],
      [halfW, halfL],
      [-halfW, halfL],
    ] as const) {
      // three の rotation.y と同じ向きに回す
      const wx = LIGHTER_REST.x + x * cos + z * sin;
      const wz = LIGHTER_REST.z - x * sin + z * cos;
      expect(Math.abs(wx)).toBeLessThanOrEqual(topX / 2);
      expect(Math.abs(wz)).toBeLessThanOrEqual(topZ / 2);
    }
  });
});
