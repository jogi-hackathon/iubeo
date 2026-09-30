import {describe, expect, it} from "vitest";

import {INTERACT_DISTANCE, resolveAim} from "../aim";

const always = () => true;

describe("resolveAim", () => {
  it("距離内で最初に当たったオブジェクトを狙う", () => {
    expect(
      resolveAim({objectId: "a", distance: 1.2}, {isTargetable: always}),
    ).toBe("a");
  });

  it("何にも当たらなければ狙わない", () => {
    expect(resolveAim(null, {isTargetable: always})).toBeNull();
  });

  it("最初の当たりがコライダーだけの物(壁など)なら、奥のオブジェクトは狙わない", () => {
    // 壁に当たった時点で、それが「最初の当たり」になる。奥の物は判定に渡らない
    expect(
      resolveAim({objectId: null, distance: 0.8}, {isTargetable: always}),
    ).toBeNull();
  });

  it("距離の上限ちょうどは狙え、超えたら狙わない", () => {
    expect(
      resolveAim(
        {objectId: "a", distance: INTERACT_DISTANCE},
        {isTargetable: always},
      ),
    ).toBe("a");
    expect(
      resolveAim(
        {objectId: "a", distance: INTERACT_DISTANCE + 0.01},
        {isTargetable: always},
      ),
    ).toBeNull();
  });

  it("距離の上限は指定で変えられる", () => {
    expect(
      resolveAim(
        {objectId: "a", distance: 4},
        {maxDistance: 5, isTargetable: always},
      ),
    ).toBe("a");
  });

  it("触れない物(使用不可・手元に無い)は、当たっていても狙わない", () => {
    expect(
      resolveAim({objectId: "a", distance: 1}, {isTargetable: () => false}),
    ).toBeNull();
    expect(
      resolveAim(
        {objectId: "a", distance: 1},
        {isTargetable: (id) => id !== "a"},
      ),
    ).toBeNull();
  });
});
