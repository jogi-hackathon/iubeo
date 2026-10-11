import {type ReactNode, useEffect} from "react";

import {
  registerActiveToggles,
  type ToggleStore,
  TogglesContext,
} from "./toggles";

export function TogglesProvider({
  store,
  children,
}: {
  store: ToggleStore;
  children: ReactNode;
}) {
  useEffect(() => registerActiveToggles(store), [store]);
  return <TogglesContext value={store}>{children}</TogglesContext>;
}
