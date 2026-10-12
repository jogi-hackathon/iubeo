import {describe, expect, it} from "vitest";

import {
  CHAIR_POSITION,
  ROOM_SPAWN_POSITION,
  WORKSPACE_POSITION,
} from "../../layout";
import {zonesAt} from "../zones";

describe("zonesAt", () => {
  it("スポーン地点はどのゾーンにも入らない", () => {
    expect(zonesAt(ROOM_SPAWN_POSITION[0], ROOM_SPAWN_POSITION[2])).toEqual([]);
  });

  it("椅子のすぐ近くは chair に入る", () => {
    expect(zonesAt(CHAIR_POSITION[0], CHAIR_POSITION[2] + 0.4)).toContain(
      "chair",
    );
  });

  it("机の正面(+Z 側)の手前は pcFront に入る", () => {
    expect(
      zonesAt(WORKSPACE_POSITION[0], WORKSPACE_POSITION[2] + 0.9),
    ).toContain("pcFront");
  });

  it("机の裏側や、横に離れた正面は pcFront に入らない", () => {
    expect(
      zonesAt(WORKSPACE_POSITION[0], WORKSPACE_POSITION[2] - 1),
    ).not.toContain("pcFront");
    expect(
      zonesAt(WORKSPACE_POSITION[0] + 2, WORKSPACE_POSITION[2] + 0.9),
    ).not.toContain("pcFront");
  });
});
