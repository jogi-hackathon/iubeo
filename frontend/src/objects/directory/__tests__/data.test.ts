import {describe, expect, it} from "vitest";

import {isCreatedStatus, parseFileData} from "../../../items/file";
import {parseDirectoryData} from "../data";

describe("parseDirectoryData", () => {
  it("在庫と成果物の数を読む", () => {
    expect(
      parseDirectoryData({
        stock: [
          {id: "f1", color: "#f00", status: "unedited"},
          {id: "f2", color: "#0f0", status: "edited"},
        ],
        outputs: 3,
      }),
    ).toEqual({
      stock: [
        {id: "f1", color: "#f00", status: "unedited"},
        {id: "f2", color: "#0f0", status: "edited"},
      ],
      outputs: 3,
    });
  });

  it("オブジェクト以外は、空のディレクトリとして読む", () => {
    for (const bad of [null, 1, "x", true, [1, 2]]) {
      expect(parseDirectoryData(bad)).toEqual({stock: [], outputs: 0});
    }
  });

  it("読めないファイル(id・color の欠落や型違い、status が不正・欠落)は飛ばす", () => {
    expect(
      parseDirectoryData({
        stock: [
          {id: "ok", color: "#fff", status: "unedited"},
          {id: "noStatus", color: "#fff"},
          {id: "created", color: "#fff", status: "file_created"},
          {id: "old", color: "#fff", edited: true},
          {id: 1, color: "#fff", status: "edited"},
          {id: "nocolor", status: "edited"},
          null,
          "x",
        ],
        outputs: 0,
      }).stock,
    ).toEqual([{id: "ok", color: "#fff", status: "unedited"}]);
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
  it.each([
    "unedited",
    "edited",
    "file_created",
    "search_created",
    "image_created",
  ] as const)("status %s を読む", (status) => {
    expect(parseFileData({status, color: "#f00"})).toEqual({
      status,
      color: "#f00",
    });
  });

  it("color が無ければ、キー自体を付けない", () => {
    const data = parseFileData({status: "file_created"});
    expect(data).toEqual({status: "file_created"});
    expect(data).not.toHaveProperty("color");
  });

  it("status が不正、またはオブジェクトでなければ null(旧形式も読まない)", () => {
    expect(parseFileData({status: "nope"})).toBeNull();
    expect(parseFileData({status: 1})).toBeNull();
    expect(parseFileData({color: "#f00"})).toBeNull();
    expect(parseFileData({origin: "stock", edited: false})).toBeNull();
    expect(parseFileData(null)).toBeNull();
    expect(parseFileData("edited")).toBeNull();
    expect(parseFileData([])).toBeNull();
  });
});

describe("isCreatedStatus", () => {
  it("作成系の 3 値だけ true", () => {
    expect(isCreatedStatus("file_created")).toBe(true);
    expect(isCreatedStatus("search_created")).toBe(true);
    expect(isCreatedStatus("image_created")).toBe(true);
    expect(isCreatedStatus("unedited")).toBe(false);
    expect(isCreatedStatus("edited")).toBe(false);
  });
});
