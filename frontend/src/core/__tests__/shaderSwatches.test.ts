import {Group, Mesh} from "three";
import {describe, expect, it} from "vitest";

import {
  getShaderSwatchBook,
  registerShaderSwatch,
  shaderSwatchNames,
  SWATCH_BOOK_Y,
} from "../shaderSwatches";

describe("shaderSwatches", () => {
  it("登録した見本は、カリングを切り当たり判定を無効にして 1 つの group に入り、group は使い回される", () => {
    let created = 0;
    registerShaderSwatch("test:a", () => {
      created++;
      const g = new Group();
      g.add(new Mesh());
      return g;
    });
    const book = getShaderSwatchBook();
    expect(book.position.y).toBe(SWATCH_BOOK_Y);
    expect(getShaderSwatchBook()).toBe(book);
    expect(created).toBe(1);
    expect(shaderSwatchNames()).toContain("test:a");

    const swatch = book.getObjectByName("shader-swatch:test:a");
    expect(swatch).toBeDefined();
    swatch?.traverse((o) => {
      expect(o.frustumCulled).toBe(false);
    });
  });

  it("group ができた後の登録と、同じ名前の登録し直しは、その見本だけ置き換える", () => {
    const book = getShaderSwatchBook();
    const before = book.children.length;
    registerShaderSwatch("test:b", () => new Mesh());
    expect(book.children.length).toBe(before + 1);
    const first = book.getObjectByName("shader-swatch:test:b");
    registerShaderSwatch("test:b", () => new Mesh());
    expect(book.children.length).toBe(before + 1);
    expect(book.getObjectByName("shader-swatch:test:b")).not.toBe(first);
  });
});
