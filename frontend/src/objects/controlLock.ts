import {useFrame} from "@react-three/fiber";
import {useEffect} from "react";

import {useMyPlayerId} from "../authority/useMyPlayerId";
import {FRAME_PRIORITY} from "../core/frameOrder";
import {consumeLookDelta} from "../core/input";
import {lockPlayerControl} from "../core/playerControl";
import type {PlayerId} from "../player/types";
import {useObjectState} from "./objectContext";
import type {GameObject} from "./types";

export const isWorkingAt = (
  object: GameObject,
  playerId: PlayerId | null,
): boolean => playerId !== null && object.users.includes(playerId);

export const controlLockEffect = (
  working: boolean,
  lock: () => () => void = lockPlayerControl,
): (() => void) | undefined => (working ? lock() : undefined);

export function useControlLockWhileWorking(object: GameObject): void {
  const {enabled} = useObjectState();
  const playerId = useMyPlayerId();
  const working = enabled && isWorkingAt(object, playerId);
  useEffect(() => controlLockEffect(working), [working]);
  useFrame(() => {
    if (working) {
      consumeLookDelta();
    }
  }, FRAME_PRIORITY.player);
}
