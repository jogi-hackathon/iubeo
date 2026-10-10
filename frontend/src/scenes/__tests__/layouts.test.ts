import {describe, expect, it} from "vitest";

import {kindOfId} from "../../objects/layout";
import {sceneLayouts} from "../layouts";
import {ROOM_LAYOUT} from "../RoomScene/layout";
import {ROOM_FEATURE_KEYS, ROOM_PROP_KEYS} from "../RoomScene/props";
import {
  SANDBOX_LAYOUT,
  SEATS,
  seatYaw,
  sandboxSpawnOf,
} from "../SandboxScene/layout";
import {TEST_LAYOUT, TEST_SPARE_IDS} from "../TestScene/layout";

const idsOf = (layout: Record<string, {id: string}>) =>
  Object.values(layout).map((item) => item.id);

describe("シーンのレイアウト", () => {
  it("どのレイアウトも、ディレクトリの項目は向きを持たず、見た目は small か large", () => {
    for (const layout of Object.values(sceneLayouts)) {
      for (const item of Object.values(layout)) {
        if (kindOfId(item.id) !== "directory") {
          continue;
        }
        expect(item.yaw).toBeUndefined();
        expect(["small", "large", undefined]).toContain(item.look);
      }
    }
  });

  it("どのレイアウトも、項目の id が重複しない", () => {
    for (const layout of Object.values(sceneLayouts)) {
      const ids = idsOf(layout);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it("room の機能のキーは、項目名:機能名(directory:overview)。プロップのキーに項目名を含む", () => {
    expect(ROOM_FEATURE_KEYS).toEqual(["directory:overview"]);
    expect(ROOM_PROP_KEYS).toEqual(
      expect.arrayContaining(["chair", "window", ...Object.keys(ROOM_LAYOUT)]),
    );
    expect(ROOM_LAYOUT.directory?.look).toBe("small");
  });

  it("テストシーンは dummy-1〜3 と予備 dummy-4〜8 を持つ(予備は初期の対象ではない)", () => {
    expect(TEST_SPARE_IDS).toEqual([
      "dummy-4",
      "dummy-5",
      "dummy-6",
      "dummy-7",
      "dummy-8",
    ]);
    expect(TEST_LAYOUT["dummy-1"]?.position).toEqual([-1.5, 1, -4]);
    for (const id of TEST_SPARE_IDS) {
      expect(kindOfId(id)).toBe("dummy");
    }
  });

  it("サンドボックスは座席 1〜3 ごとに机・PC・キャンバス・ライターの置き場を持ち、ディレクトリは中心の large", () => {
    expect(SEATS).toEqual([1, 2, 3]);
    expect(SANDBOX_LAYOUT.directory).toEqual({
      id: "directory-1",
      position: [0, 0, 0],
      look: "large",
    });
    for (const seat of SEATS) {
      expect(SANDBOX_LAYOUT[`workspace-${seat}`]?.id).toBe(`workspace-${seat}`);
      expect(SANDBOX_LAYOUT[`pc-${seat}`]?.id).toBe(`pc-${seat}`);
      expect(SANDBOX_LAYOUT[`canvas-${seat}`]?.id).toBe(`canvas-${seat}`);
      expect(SANDBOX_LAYOUT[`lighter_stand-${seat}`]?.id).toBe(
        `lighter_stand-${seat}`,
      );
    }
    expect(seatYaw(1)).toBe(0);
    expect(seatYaw(2)).toBeCloseTo((2 * Math.PI) / 3);
    expect(sandboxSpawnOf(1)).toBeDefined();
  });
});
