import {
  buildMountain,
  type Candidate,
  DIRECTORY_MOUNTAIN_SEED,
} from "../../objects/directory/mountain";
import type {Vec3} from "../../props/types";
import {DIRECTORY_POSITION} from "./layout";

export const frontMostCandidate = (
  candidates: readonly Candidate[],
): Candidate | undefined =>
  candidates.reduce<Candidate | undefined>(
    (best, c) => (best === undefined || c.z > best.z ? c : best),
    undefined,
  );

export const TUTORIAL_FILE_CANDIDATE = frontMostCandidate(
  buildMountain(DIRECTORY_MOUNTAIN_SEED, "small").candidates,
);

export const tutorialFileWorldPosition = (
  candidate: Candidate,
  lift: number,
): Vec3 => [
  DIRECTORY_POSITION[0] + candidate.x,
  DIRECTORY_POSITION[1] + candidate.topY + lift,
  DIRECTORY_POSITION[2] + candidate.z,
];
