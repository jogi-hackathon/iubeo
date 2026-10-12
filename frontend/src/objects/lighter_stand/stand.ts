import type {Vector3Tuple} from "three";

import {DESK_HEIGHT} from "../workspace/desk";

export const LIGHTER_STAND_ON_DESK: Vector3Tuple = [0.6, DESK_HEIGHT, 0.2];

export const LIGHTER_REST = {x: 0.003, z: 0.001, yaw: 0.45} as const;

export const HIT_SIZE: Vector3Tuple = [0.09, 0.03, 0.09];

export const STAND_FOOTPRINT = [HIT_SIZE[0], HIT_SIZE[2]] as const;

export const MARK_HEIGHT = 0.001;
export const MARK_COLOR = "#dcd8cd";
