import {STRIDE_LENGTH, WALK_MIN_SPEED} from "./skeleton/animator";
import type {PlayerState} from "./types";

const FOOT_CONTACTS_PER_CYCLE = 2;
const MIN_JUMP_SPEED = 1;
const FULL_LANDING_SPEED = 12;
const MIN_LANDING = 0.12;

export type Footfall =
  | {kind: "step"}
  | {kind: "jump"}
  | {kind: "land"; amount: number};

type Sensed = Pick<PlayerState, "velocity" | "onGround" | "yaw">;

const contactIndex = (phase: number) =>
  Math.floor(phase * FOOT_CONTACTS_PER_CYCLE);

export const createFootfall = () => {
  let wasGround = true;
  let phase = 0;
  let fallSpeed = 0;

  return {
    reset(state: Sensed) {
      wasGround = state.onGround;
      fallSpeed = 0;
    },
    update(state: Sensed, dt: number): Footfall[] {
      const events: Footfall[] = [];
      const {velocity, onGround, yaw} = state;
      if (wasGround && !onGround && velocity.y > MIN_JUMP_SPEED) {
        events.push({kind: "jump"});
      }
      if (!wasGround && onGround) {
        const amount = Math.min(1, fallSpeed / FULL_LANDING_SPEED);
        if (amount >= MIN_LANDING) {
          events.push({kind: "land", amount});
        }
      }
      if (onGround) {
        const speed = Math.hypot(velocity.x, velocity.z);
        if (speed >= WALK_MIN_SPEED) {
          const forward =
            -Math.sin(yaw) * velocity.x - Math.cos(yaw) * velocity.z;
          const dir = forward < 0 ? -1 : 1;
          const before = contactIndex(phase);
          phase += (dir * speed * dt) / STRIDE_LENGTH;
          if (contactIndex(phase) !== before) {
            events.push({kind: "step"});
          }
        }
        fallSpeed = 0;
      } else {
        fallSpeed = Math.max(fallSpeed, -velocity.y);
      }
      wasGround = onGround;
      return events;
    },
  };
};
