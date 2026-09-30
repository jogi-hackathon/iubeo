import {describe, expect, it} from "vitest";

import {
  createFileAssigner,
  type FilePlate,
  pickFile,
  plateOf,
} from "../fileAssign";

/** 決まった乱数(テスト用)。seed が違えば列も違う */
const seeded = (seed: number) => {
  let a = seed >>> 0;
  return () => {
    a = (Math.imul(a, 1664525) + 1013904223) >>> 0;
    return a / 4294967296;
  };
};
const ids = (n: number) => Array.from({length: n}, (_, i) => `f${i}`);

describe("createFileAssigner", () => {
  it("ファイルごとに、別々の束(候補の番号)を割り当てる", () => {
    const a = createFileAssigner(40, seeded(1));
    a.sync(ids(6));
    const got = ids(6).map((id) => a.get(id));
    expect(got.every((g) => g !== undefined && g >= 0 && g < 40)).toBe(true);
    expect(new Set(got).size).toBe(6);
  });

  it("在庫が増減しても、既存の割り当ては動かない。新しいファイルは、空いている束に足す", () => {
    const a = createFileAssigner(40, seeded(5));
    a.sync(["a", "b", "c"]);
    const before = ["a", "b", "c"].map((id) => a.get(id));

    a.sync(["a", "c", "d", "e"]);

    expect(a.get("a")).toBe(before[0]);
    expect(a.get("c")).toBe(before[2]);
    const used = ["a", "b", "c", "d", "e"].map((id) => a.get(id));
    expect(new Set(used).size).toBe(5);
  });

  it("返却されたファイルは、元の束に戻る(借りられている間も束は確保されたまま)", () => {
    const a = createFileAssigner(40, seeded(9));
    a.sync(["a", "b"]);
    const b = a.get("b");
    a.sync(["a", "c"]);
    expect(a.get("c")).not.toBe(b);
    a.sync(["a", "b", "c"]);
    expect(a.get("b")).toBe(b);
  });

  it("入り直す(作り直す)と、乱数が違えば割り当てが変わる", () => {
    const x = createFileAssigner(40, seeded(1));
    const y = createFileAssigner(40, seeded(2));
    x.sync(ids(6));
    y.sync(ids(6));
    expect(ids(6).map((id) => x.get(id))).not.toEqual(
      ids(6).map((id) => y.get(id)),
    );
  });

  it("候補を使い切っても、いま在庫にあるファイルの束は奪わない", () => {
    const a = createFileAssigner(3, seeded(3));
    a.sync(["a", "b", "c"]);
    const held = [a.get("a"), a.get("b"), a.get("c")];
    // b, c が借りられて消え、d, e が現れる(候補は 3 つしか無い)
    a.sync(["a", "d"]);
    expect(a.get("a")).toBe(held[0]);
    expect(a.get("d")).not.toBe(held[0]);
    a.sync(["a", "d", "e"]);
    expect(a.get("e")).not.toBe(a.get("a"));
    expect(a.get("e")).not.toBe(a.get("d"));
  });

  it("乱数を注入しなくても動く(Math.random)", () => {
    const a = createFileAssigner(10);
    a.sync(["a"]);
    expect(a.get("a")).toBeDefined();
  });
});

const plate = (id: string, over: Partial<FilePlate> = {}): FilePlate => ({
  id,
  x: 0,
  y: 0.7,
  z: 0,
  yaw: 0,
  width: 0.7,
  depth: 0.4,
  ...over,
});
const DOWN = {x: 0, y: -1, z: 0};

describe("plateOf", () => {
  it("候補の束の上面を、ワールド座標(ディレクトリの位置を足す)の板にする", () => {
    const p = plateOf(
      "f",
      {x: 1, z: -2, topY: 1.4, yaw: 0.3, width: 0.6, depth: 0.4},
      [10, 0, 5],
      0.02,
    );
    expect(p).toEqual({
      id: "f",
      x: 11,
      y: 1.42,
      z: 3,
      yaw: 0.3,
      width: 0.6,
      depth: 0.4,
    });
  });
});

describe("pickFile", () => {
  it("真上からの視線が板の中に入っていれば、その板を選ぶ", () => {
    expect(pickFile({x: 0.1, y: 8, z: -0.1}, DOWN, [plate("a")])).toBe("a");
  });

  it("板の外なら選ばない(余白の外)", () => {
    expect(
      pickFile({x: 0.35 + 0.1, y: 8, z: 0}, DOWN, [plate("a")]),
    ).toBeNull();
    expect(pickFile({x: 0, y: 8, z: 0.2 + 0.1}, DOWN, [plate("a")])).toBeNull();
  });

  it("回転した板は、板のローカル座標で判定する", () => {
    const rotated = plate("a", {yaw: Math.PI / 2});
    // 幅 0.7 の板を 90 度回すと、x 方向の半分は奥行き(0.2)、z 方向の半分は幅(0.35)
    expect(pickFile({x: 0, y: 8, z: 0.3}, DOWN, [rotated])).toBe("a");
    expect(pickFile({x: 0.3, y: 8, z: 0}, DOWN, [rotated])).toBeNull();
    expect(pickFile({x: 0.3, y: 8, z: 0}, DOWN, [plate("a")])).toBe("a");
  });

  it("板の位置がずれていても、回転を板の中心まわりで見る", () => {
    const p = plate("a", {x: 5, z: -3, yaw: 0.7});
    expect(pickFile({x: 5, y: 8, z: -3}, DOWN, [p])).toBe("a");
    expect(pickFile({x: 0, y: 8, z: 0}, DOWN, [p])).toBeNull();
  });

  it("上向きの視線・板より下からの視線は当たらない。板が無ければ null", () => {
    expect(
      pickFile({x: 0, y: 8, z: 0}, {x: 0, y: 1, z: 0}, [plate("a")]),
    ).toBeNull();
    expect(pickFile({x: 0, y: 0, z: 0}, DOWN, [plate("a")])).toBeNull();
    expect(pickFile({x: 0, y: 8, z: 0}, DOWN, [])).toBeNull();
  });

  it("高さが違う板が重なって見えるときは、カメラに近い(高い)方を選ぶ", () => {
    expect(
      pickFile({x: 0, y: 8, z: 0}, DOWN, [
        plate("low", {y: 0.7}),
        plate("high", {y: 1.4}),
      ]),
    ).toBe("high");
    // 斜めの視線でも、当たった中で最も近いものを選ぶ
    const dir = {x: 0.2, y: -1, z: 0};
    const origin = {x: -0.2 * 6.6, y: 8, z: 0};
    expect(
      pickFile(origin, dir, [
        plate("far", {y: 1.4, x: 0}),
        plate("near", {y: 2.1, x: -0.2 * 5.9 + 0}),
      ]),
    ).toBeDefined();
  });

  it("高さが違えば、それぞれの高さの面で判定する(同じ画面位置でも別の板)", () => {
    // 斜めの視線: 高い板(y=2.1)では x=0.4 の手前を通り、低い板(y=0.7)では x=0.7 を通る
    const origin = {x: 0, y: 8, z: 0};
    const dir = {x: 0.1, y: -1, z: 0};
    const high = plate("high", {y: 2.1, x: 0.59});
    const low = plate("low", {y: 0.7, x: 0.73});
    expect(pickFile(origin, dir, [high, low])).toBe("high");
    expect(pickFile(origin, dir, [low])).toBe("low");
  });
});
