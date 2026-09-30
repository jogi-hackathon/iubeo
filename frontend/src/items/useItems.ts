import {useSyncExternalStore} from "react";

import {itemManager} from "./itemStore";
import type {ItemState} from "./types";

export const useItemState = (): ItemState =>
  useSyncExternalStore(itemManager.subscribe, itemManager.getState);
