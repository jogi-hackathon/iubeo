import {useFrame} from "@react-three/fiber";
import {useEffect} from "react";

import {FRAME_PRIORITY} from "../core/frameOrder";
import {consumeLookDelta} from "../core/input";
import {lockPlayerControl} from "../core/playerControl";
import {getLocalPlayerId} from "../player/local";
import type {PlayerId} from "../player/types";
import {useObjectState} from "./objectContext";
import type {GameObject} from "./types";

/** このプレイヤーが、このオブジェクトで作業中か(users に入っているか)。作業中の扱いは、そのオブジェクトの種類が決める */
export const isWorkingAt = (object: GameObject, playerId: PlayerId): boolean =>
  object.users.includes(playerId);

/** 作業中なら移動・視点とカメラを預かり、解除関数を返す(作業中でなければ何もしない)。useEffect にそのまま渡せる形 */
export const controlLockEffect = (
  working: boolean,
  lock: () => () => void = lockPlayerControl,
): (() => void) | undefined => (working ? lock() : undefined);

/**
 * 作業中の間、プレイヤーの移動・視点入力を止め、カメラの向きを固定する(core/playerControl で預かる。
 * PlayerController は身体を止め、FirstPersonCamera はカメラに触れない)。ワークスペース・キャンバスが使う。
 * 開始と解除はオブジェクトの状態から導くだけで、クライアント側にタイマーは持たない
 * (サーバー役が users から外せば、自動で解除される)。作業中のオブジェクトが remove されたときも、
 * 拒否されたとき(users に入らない)も、アンマウントされたときも、effect の後始末で解除される。
 * 非表示・機能 OFF のときは、作業中でも預からない(切った時点で外れる)。
 * 預かりは、オブジェクトごとに core/playerControl で数えるので、複数が作業中でも、全部解除されるまで預かり中になる。
 * 預かり中は PlayerController が視点入力を消費しないので、解除後に向きが飛ばないよう、ここで捨てる
 */
export function useControlLockWhileWorking(object: GameObject): void {
  const {enabled} = useObjectState();
  const working = enabled && isWorkingAt(object, getLocalPlayerId());
  useEffect(() => controlLockEffect(working), [working]);
  useFrame(() => {
    if (working) {
      consumeLookDelta();
    }
  }, FRAME_PRIORITY.player);
}
