import type {Vector3} from "three";

import type {Item} from "../items/types";
import type {Vec3} from "../props/types";

/** プレイヤーの識別子。サーバーが発行する匿名 ID(HttpOnly Cookie で識別する。ADR-0003) */
export type PlayerId = string;

export type PlayerKind = "human" | "cpu";
export type PlayerConnection = "connecting" | "connected" | "disconnected";
/** eliminated は脱落(= 死亡) */
export type PlayerLife = "alive" | "eliminated";

/** 位置と向き以外のプレイヤー情報。状態の正はサーバーで、ここはその写し */
export type PlayerStatus = {
  playerId: PlayerId;
  kind: PlayerKind;
  /** サンドボックスの区画の番号(1〜3) */
  seat: number;
  connection: PlayerConnection;
  life: PlayerLife;
  /** 手に持っているアイテム。手ぶらなら null */
  heldItem: Item | null;
};

/** サーバーから届く位置と向き。seq はそのプレイヤーの更新ごとに増える */
export type PlayerTransform = {
  /** 足元の位置 */
  position: Vec3;
  yaw: number;
  pitch: number;
  seq: number;
};

/** サーバー → クライアント。状態の正はサーバーで、ここは通知を反映するだけ */
export type PlayerMessage =
  /** 全員分を丸ごと入れ替える(接続・再接続時の snapshot) */
  | {
      type: "reset";
      players: ReadonlyArray<PlayerStatus & {transform: PlayerTransform}>;
    }
  /** 1 人分の、位置と向き以外の変化(player.updated) */
  | {type: "upsert"; player: PlayerStatus}
  /** 動いたプレイヤーの位置と向き(transforms。最大 20Hz) */
  | {
      type: "transforms";
      players: ReadonlyArray<{playerId: PlayerId; transform: PlayerTransform}>;
    };

export type PlayerManagerState = {
  /** 全員(自分を含む)。seat の昇順 */
  players: readonly PlayerStatus[];
};

export type PlayerEvents = {
  /** 生死が変わった(脱落したらラグドールに移すなど、切り替わりの瞬間の演出用)。reset では通知しない */
  lifeChanged: {playerId: PlayerId; life: PlayerLife};
};

/** 視線の向き。yaw=0 で -Z 前、pitch は上向きが正 */
export interface Look {
  yaw: number;
  pitch: number;
}

export interface PlayerState {
  /** 足元の位置 */
  position: Vector3;
  velocity: Vector3;
  onGround: boolean;
  /** 身体の向き。カメラはこれを写すだけ */
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
