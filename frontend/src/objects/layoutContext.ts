import {createContext, useContext} from "react";

import type {LayoutItem} from "./layout";

/** オブジェクトが割り当てられたレイアウトの項目(項目名つき)。種類のコンポーネントは、ここから位置・見た目・機能のキーを読む */
export type LayoutSlot = {name: string; item: LayoutItem};

/** ManagedObjects の外で使われたとき(レイアウトを持たない場所)は、空の項目として振る舞う */
export const LayoutItemContext = createContext<LayoutSlot>({
  name: "",
  item: {id: "", position: [0, 0, 0]},
});

export const useLayoutSlot = (): LayoutSlot => useContext(LayoutItemContext);
