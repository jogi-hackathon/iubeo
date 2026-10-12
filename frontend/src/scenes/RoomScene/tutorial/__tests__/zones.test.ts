import {describe, expect, it} from "vitest";

import {CHAIR_POSITION, ROOM_SPAWN_POSITION} from "../../layout";
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
});
