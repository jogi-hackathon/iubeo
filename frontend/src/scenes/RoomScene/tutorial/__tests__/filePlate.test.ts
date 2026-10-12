import {describe, expect, it} from "vitest";

import {
  buildMountain,
  DIRECTORY_MOUNTAIN_SEED,
} from "../../../../objects/directory/mountain";
import {DIRECTORY_POSITION, ROOM_INNER_Z_SOUTH} from "../../layout";
import {
  frontMostCandidate,
  TUTORIAL_FILE_CANDIDATE,
  tutorialFileWorldPosition,
} from "../filePlate";

describe("tutorialFilePlate", () => {
  it("frontMostCandidate は z が最大(手前側)の候補を選び、空なら undefined", () => {
    const c = (z: number) => ({
      x: 0,
      z,
      topY: 0.5,
      yaw: 0,
      width: 1,
      depth: 1,
    });
    expect(frontMostCandidate([c(-1), c(0.8), c(0.2)])?.z).toBe(0.8);
    expect(frontMostCandidate([])).toBeUndefined();
  });

  it("room のディレクトリの山の候補から選ばれ、山の手前側で、部屋の中にある", () => {
    const mountain = buildMountain(DIRECTORY_MOUNTAIN_SEED, "small");
    expect(mountain.candidates).toContainEqual(TUTORIAL_FILE_CANDIDATE);
    const candidate = TUTORIAL_FILE_CANDIDATE;
    if (!candidate) {
      throw new Error("候補がありません");
    }
    expect(candidate.z).toBeGreaterThan(0);
    const [, y, z] = tutorialFileWorldPosition(candidate, 0.02);
    expect(z).toBeGreaterThan(DIRECTORY_POSITION[2]);
    expect(z).toBeLessThan(ROOM_INNER_Z_SOUTH);
    expect(y).toBeLessThan(mountain.height);
  });
});
