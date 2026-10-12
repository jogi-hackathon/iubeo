import {CHAIR_POSITION, WORKSPACE_POSITION} from "../layout";
import type {TutorialZone} from "./steps";

const CHAIR_RADIUS = 0.85;
const PC_FRONT_HALF_WIDTH = 0.6;
const PC_FRONT_NEAR_Z = WORKSPACE_POSITION[2] + 0.5;
const PC_FRONT_FAR_Z = WORKSPACE_POSITION[2] + 1.2;

export const zonesAt = (x: number, z: number): TutorialZone[] => {
  const zones: TutorialZone[] = [];
  if (
    Math.hypot(x - CHAIR_POSITION[0], z - CHAIR_POSITION[2]) <= CHAIR_RADIUS
  ) {
    zones.push("chair");
  }
  if (
    Math.abs(x - WORKSPACE_POSITION[0]) <= PC_FRONT_HALF_WIDTH &&
    z >= PC_FRONT_NEAR_Z &&
    z <= PC_FRONT_FAR_Z
  ) {
    zones.push("pcFront");
  }
  return zones;
};
