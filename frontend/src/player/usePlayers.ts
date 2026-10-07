import {useSyncExternalStore} from "react";

import {playerManager} from "./playerStore";
import type {PlayerManagerState} from "./types";

export const usePlayersState = (): PlayerManagerState =>
  useSyncExternalStore(playerManager.subscribe, playerManager.getState);
