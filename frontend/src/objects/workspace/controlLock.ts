import {useFrame} from "@react-three/fiber";
import {useEffect} from "react";

import {FRAME_PRIORITY} from "../../core/frameOrder";
import {consumeLookDelta} from "../../core/input";
import {lockPlayerControl} from "../../core/playerControl";
import {LOCAL_PLAYER_ID} from "../../player/local";
import type {PlayerId} from "../../player/types";
import type {GameObject} from "../types";
import {WORKSPACE_KIND} from "./data";

/** このプレイヤーが、ワークスペースで作業中か(いずれかのワークスペースの users に入っているか) */
export const isWorkingInWorkspace = (
  objects: readonly GameObject[],
  playerId: PlayerId,
): boolean =>
  objects.some((o) => o.kind === WORKSPACE_KIND && o.users.includes(playerId));

/** 作業中なら移動・視点とカメラを預かり、解除関数を返す(作業中でなければ何もしない)。useEffect にそのまま渡せる形 */
export const controlLockEffect = (
  working: boolean,
  lock: () => () => void = lockPlayerControl,
): (() => void) | undefined => (working ? lock() : undefined);

/**
 * 作業中の間、プレイヤーの移動・視点入力を止め、カメラの向きを固定する(core/playerControl で預かる。
 * PlayerController は身体を止め、FirstPersonCamera はカメラに触れない)。
 * 開始と解除は objectManager の状態から導くだけで、クライアント側にタイマーは持たない
 * (サーバー役が users から外せば、自動で解除される)。ワークスペースが remove されたときも、
 * 拒否されたとき(users に入らない)も、アンマウントされたときも、effect の後始末で解除される。
 * 預かり中は PlayerController が視点入力を消費しないので、解除後に向きが飛ばないよう、ここで捨てる
 */
export function useWorkspaceControlLock(objects: readonly GameObject[]): void {
  const working = isWorkingInWorkspace(objects, LOCAL_PLAYER_ID);
  useEffect(() => controlLockEffect(working), [working]);
  useFrame(() => {
    if (working) {
      consumeLookDelta();
    }
  }, FRAME_PRIORITY.player);
}
