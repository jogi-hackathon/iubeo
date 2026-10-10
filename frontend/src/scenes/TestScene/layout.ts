import {
  directoryItem,
  type LayoutItem,
  type SceneLayout,
} from "../../objects/layout";
import {LIGHTER_STAND_ON_DESK} from "../../objects/lighter_stand/stand";
import {DESK_HEIGHT} from "../../objects/workspace/desk";
import type {Vec3} from "../../props/types";

const spareOffset = (n: number): Vec3 => [((n % 5) - 2) * 0.8, 1.5, -7];

/** 予備のダミーの id。初期状態では置かず、デバッグパネルの「追加」で、空いている一番若い id から置く */
export const TEST_SPARE_IDS: readonly string[] = [4, 5, 6, 7, 8].map(
  (n) => `dummy-${n}`,
);

const spare = (n: number): [string, LayoutItem] => [
  `dummy-${n}`,
  {id: `dummy-${n}`, position: spareOffset(n)},
];

/**
 * テストシーンに置く物のレイアウト。dummy-1〜3 は初期設定(./initial)で置く。
 * dummy-4〜8 は予備(TEST_SPARE_IDS。初期設定に無いので置かれない)
 */
export const TEST_LAYOUT: SceneLayout = Object.fromEntries([
  ["dummy-1", {id: "dummy-1", position: [-1.5, 1, -4]}],
  ["dummy-2", {id: "dummy-2", position: [1.5, 1, -4]}],
  ["dummy-3", {id: "dummy-3", position: [0, 1, -4]}],
  ["directory", directoryItem({id: "directory-1", position: [14, 0, 1]})],
  ["workspace", {id: "workspace-1", position: [14, 0, -5]}],
  ["canvas", {id: "canvas-1", position: [11.5, 0, -5]}],
  ["pc", {id: "pc-1", position: [14, DESK_HEIGHT, -5.03]}],
  [
    "lighter_stand",
    {
      id: "lighter_stand-1",
      position: [
        14 + LIGHTER_STAND_ON_DESK[0],
        LIGHTER_STAND_ON_DESK[1],
        -5 + LIGHTER_STAND_ON_DESK[2],
      ],
    },
  ],
  ...[4, 5, 6, 7, 8].map(spare),
]);
