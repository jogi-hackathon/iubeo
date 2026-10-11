import {createContext, type ReactNode, useContext} from "react";

import type {GraphicsSettings} from "../core/graphics";
import type {Assets} from "./assets";

export interface AppContext {
  settings: GraphicsSettings;
  assets: Assets;
}

const Ctx = createContext<AppContext | null>(null);

export function AppContextProvider({
  value,
  children,
}: {
  value: AppContext;
  children?: ReactNode;
}) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useAppContext = (): AppContext => {
  const ctx = useContext(Ctx);
  if (!ctx) {
    throw new Error("useAppContext must be used within AppContextProvider");
  }
  return ctx;
};
