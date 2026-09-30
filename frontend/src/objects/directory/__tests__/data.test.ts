import {describe, expect, it} from "vitest";

import {parseFileData} from "../../../items/file";
import {parseDirectoryData} from "../data";

describe("parseDirectoryData", () => {
  it("在庫と成果物の数を読む", () => {
    expect(
      parseDirectoryData({
        stock: [
          {id: "f1", color: "#f00", edited: false},
          {id: "f2", color: "#0f0", edited: true},
        ],
        outputs: 3,
      }),
    ).toEqual({
      stock: [
        {id: "f1", color: "#f00", edited: false},
        {id: "f2", color: "#0f0", edited: true},
      ],
      outputs: 3,
    });
  });

  it("オブジェクト以外は、空のディレクトリとして読む", () => {
    for (const bad of [null, 1, "x", true, [1, 2]]) {
      expect(parseDirectoryData(bad)).toEqual({stock: [], outputs: 0});
    }
  });

  it("読めないファイルは飛ばし、edited が無ければ false にする", () => {
    expect(
      parseDirectoryData({
        stock: [
          {id: "ok", color: "#fff"},
          {id: 1, color: "#fff", edited: true},
          {id: "nocolor", edited: true},
          null,
          "x",
        ],
        outputs: 0,
      }).stock,
    ).toEqual([{id: "ok", color: "#fff", edited: false}]);
  });

  it("outputs は 0 以上の整数に丸め、数でなければ 0 にする", () => {
    expect(parseDirectoryData({stock: [], outputs: 2.7}).outputs).toBe(2);
    expect(parseDirectoryData({stock: [], outputs: -4}).outputs).toBe(0);
    expect(parseDirectoryData({stock: [], outputs: "3"}).outputs).toBe(0);
    expect(parseDirectoryData({stock: []}).outputs).toBe(0);
  });

  it("stock が配列でなければ空にする", () => {
    expect(parseDirectoryData({stock: {a: 1}, outputs: 1})).toEqual({
      stock: [],
      outputs: 1,
    });
  });
});

describe("parseFileData", () => {
  it("origin・color・edited を読む", () => {
    expect(
      parseFileData({origin: "stock", color: "#f00", edited: true}),
    ).toEqual({origin: "stock", color: "#f00", edited: true});
  });

  it("color が無ければ、キー自体を付けない。edited が無ければ false", () => {
    const data = parseFileData({origin: "write"});
    expect(data).toEqual({origin: "write", edited: false});
    expect(data).not.toHaveProperty("color");
  });

  it("origin が不正、またはオブジェクトでなければ null", () => {
    expect(parseFileData({origin: "nope", edited: false})).toBeNull();
    expect(parseFileData({edited: false})).toBeNull();
    expect(parseFileData(null)).toBeNull();
    expect(parseFileData("stock")).toBeNull();
    expect(parseFileData([])).toBeNull();
  });
});
