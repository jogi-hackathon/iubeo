import {useSyncExternalStore} from "react";

import type {PlayerId} from "../player/types";
import {authorityRegistry} from "./registry";

export const useMyPlayerId = (): PlayerId | null =>
  useSyncExternalStore(
    authorityRegistry.subscribe,
    () => authorityRegistry.current()?.playerId ?? null,
  );
