import {CHAIR_POSITION} from "../layout";
import type {TutorialZone} from "./steps";

const CHAIR_RADIUS = 0.85;

export const zonesAt = (x: number, z: number): TutorialZone[] =>
  Math.hypot(x - CHAIR_POSITION[0], z - CHAIR_POSITION[2]) <= CHAIR_RADIUS
    ? ["chair"]
    : [];
