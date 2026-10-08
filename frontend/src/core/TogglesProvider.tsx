import {type ReactNode, useEffect} from "react";

import {
  registerActiveToggles,
  type ToggleStore,
  TogglesContext,
} from "./toggles";

/**
 * store を、配下のシーンのトグルとして配る(useIsVisible / useIsEnabled / useToggleState が読む)。
 * マウント中は、Canvas の外からも参照できるよう、今のシーンのトグルとして登録する(getActiveToggles)。アンマウントで解除する
 */
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
