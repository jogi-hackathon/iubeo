import {describe, expect, it} from "vitest";

import {isEditableTarget} from "../useKeys";

describe("isEditableTarget", () => {
  it("input / select / textarea は true", () => {
    for (const tagName of ["INPUT", "SELECT", "TEXTAREA"]) {
      expect(isEditableTarget({tagName} as unknown as EventTarget)).toBe(true);
    }
  });

  it("contentEditable な要素は true", () => {
    expect(
      isEditableTarget({
        tagName: "DIV",
        isContentEditable: true,
      } as unknown as EventTarget),
    ).toBe(true);
  });

  it("canvas・body・window(tagName なし)・null は false", () => {
    expect(
      isEditableTarget({tagName: "CANVAS"} as unknown as EventTarget),
    ).toBe(false);
    expect(isEditableTarget({tagName: "BODY"} as unknown as EventTarget)).toBe(
      false,
    );
    expect(isEditableTarget({} as unknown as EventTarget)).toBe(false);
    expect(isEditableTarget(null)).toBe(false);
  });
});
