import {describe, expect, it} from "vitest";

import {DIRECTORY_ID, stockColorsOf} from "../stockColors";

const directory = (data: unknown) => ({id: DIRECTORY_ID, data: data as never});

describe("stockColorsOf", () => {
  it("ディレクトリの在庫の id → 色を引く", () => {
    const colors = stockColorsOf([
      {id: "workspace-1", data: {}},
      directory({
        stock: [
          {id: "file-01", color: "#e63946", status: "unedited"},
          {id: "file-02", color: "#ffd60a", status: "unedited"},
        ],
        outputs: 0,
      }),
    ]);
    expect(colors.get("file-01")).toBe("#e63946");
    expect(colors.get("file-02")).toBe("#ffd60a");
    expect(colors.size).toBe(2);
  });

  it("ディレクトリが無い・data が壊れていても、空で返す(描画を止めない)", () => {
    expect(stockColorsOf([]).size).toBe(0);
    expect(stockColorsOf([directory(null)]).size).toBe(0);
  });
});
