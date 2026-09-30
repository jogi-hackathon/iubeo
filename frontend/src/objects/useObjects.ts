import {useSyncExternalStore} from "react";

import {objectManager} from "./objectStore";
import type {ObjectManagerState} from "./types";

export const useObjectsState = (): ObjectManagerState =>
  useSyncExternalStore(objectManager.subscribe, objectManager.getState);
