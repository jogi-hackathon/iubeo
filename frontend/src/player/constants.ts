export const CAPSULE_RADIUS = 0.3;
export const PLAYER_HEIGHT = 1.7;
export const EYE_HEIGHT = 1.6;
/** 目を体の中心より前へずらす距離(m)。小さいと少し下を向いただけで自分の身体が映り込む。カプセル半径より小さくして壁に埋まらないようにする */
export const EYE_FORWARD = 0.2;
export const WALK_SPEED = 4;
export const JUMP_SPEED = 5;
export const AIR_ACCEL = 8;
export const GRAVITY = 9.8;
export const MAX_FALL_SPEED = 40;
export const PHYSICS_STEP = 1 / 120;
export const START_POSITION: readonly [number, number, number] = [0, 2, 0];
