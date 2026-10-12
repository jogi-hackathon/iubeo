import {createContext, useContext} from "react";

import type {LayoutItem} from "./layout";

export type LayoutSlot = {name: string; item: LayoutItem};

export const LayoutItemContext = createContext<LayoutSlot>({
  name: "",
  item: {id: "", position: [0, 0, 0]},
});

export const useLayoutSlot = (): LayoutSlot => useContext(LayoutItemContext);
