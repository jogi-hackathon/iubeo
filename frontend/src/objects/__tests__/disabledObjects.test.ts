import {describe, expect, it} from "vitest";

import {disableObject, isObjectDisabled} from "../disabledObjects";

describe("disableObject", () => {
  it("止めている間だけ止まっていて、戻り値で戻る", () => {
    expect(isObjectDisabled("directory-1")).toBe(false);
    const release = disableObject("directory-1");
    expect(isObjectDisabled("directory-1")).toBe(true);
    release();
    expect(isObjectDisabled("directory-1")).toBe(false);
  });

  it("2 回戻しても、後から止め直した分は消さない", () => {
    const first = disableObject("directory-1");
    first();
    const second = disableObject("directory-1");
    first();
    expect(isObjectDisabled("directory-1")).toBe(true);
    second();
  });
});
