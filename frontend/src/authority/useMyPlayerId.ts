import {useSyncExternalStore} from "react";

import type {PlayerId} from "../player/types";
import {authorityRegistry} from "./registry";

/** 今の窓口での自分の ID。窓口が無ければ null(作業中の判定は、自分が無いので false になる) */
export const useMyPlayerId = (): PlayerId | null =>
  useSyncExternalStore(
    authorityRegistry.subscribe,
    () => authorityRegistry.current()?.playerId ?? null,
  );
