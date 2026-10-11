import {useSyncExternalStore} from "react";

import type {StorageStore} from "./storageManager";

export const useStore = <T>(
  store: Pick<StorageStore<T>, "subscribe" | "getState">,
): T => useSyncExternalStore(store.subscribe, store.getState);
