import type {Vector3} from "three";

import type {Item} from "../items/types";
import type {Vec3} from "../props/types";

export type PlayerId = string;

export type PlayerKind = "human" | "cpu";
export type PlayerConnection = "connecting" | "connected" | "disconnected";
export type PlayerLife = "alive" | "eliminated";

export type PlayerStatus = {
  playerId: PlayerId;
  kind: PlayerKind;
  seat: number;
  connection: PlayerConnection;
  life: PlayerLife;
  heldItem: Item | null;
};

export type PlayerTransform = {
  position: Vec3;
  yaw: number;
  pitch: number;
  seq: number;
};

export type PlayerMessage =
  | {
      type: "reset";
      players: ReadonlyArray<PlayerStatus & {transform: PlayerTransform}>;
    }
  | {type: "upsert"; player: PlayerStatus}
  | {
      type: "transforms";
      players: ReadonlyArray<{playerId: PlayerId; transform: PlayerTransform}>;
    };

export type PlayerManagerState = {
  players: readonly PlayerStatus[];
};

export type PlayerEvents = {
  lifeChanged: {playerId: PlayerId; life: PlayerLife};
};

export interface Look {
  yaw: number;
  pitch: number;
}

export interface PlayerState {
  position: Vector3;
  velocity: Vector3;
  onGround: boolean;
  yaw: number;
  pitch: number;
}

export interface MoveInput {
  forward: boolean;
  back: boolean;
  left: boolean;
  right: boolean;
  jump: boolean;
}
