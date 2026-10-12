import {describe, expect, it} from "vitest";

import {noticeLabels, taskLabels} from "../hudText";

describe("hudText", () => {
  it("タスクの種類と切断の理由は、どれも文言を持つ", () => {
    for (const label of [
      ...Object.values(taskLabels),
      ...Object.values(noticeLabels),
    ]) {
      expect(label.length).toBeGreaterThan(0);
    }
  });
});
