import {createContext, type ReactNode, useContext} from "react";

import type {GraphicsSettings} from "../core/graphics";
import type {Assets} from "./assets";
import type {Capabilities} from "./capabilities";

/** 起動シーケンス(boot)の成果物。以降のアプリ全体から読み取り専用で参照する */
export interface AppContext {
  settings: GraphicsSettings;
  /** rendererBackend のみ afterRendererInit がレンダラー生成後に確定値へ更新する */
  capabilities: Capabilities;
  assets: Assets;
}

const Ctx = createContext<AppContext | null>(null);

/** R3F の Canvas は its-fine の Bridge で親の React context を引き継ぐため、Canvas 内でも届く */
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
