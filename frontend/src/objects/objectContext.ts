import {createContext, useContext} from "react";

/**
 * オブジェクトの表示・機能の状態。ObjectRoot が core/toggles の値を配る。
 * 種類のコンポーネントは、ここから自分が見えているか・機能が ON かを読む(種類ごとにトグルを引き直さない)
 */
export type ObjectState = {
  /** 表示中か(非表示なら false) */
  visible: boolean;
  /** 機能が ON か(非表示・機能 OFF なら false)。false の間は、狙い・インタラクト・作業中のロックから外れる */
  enabled: boolean;
};

/** ObjectRoot の外で使われたとき(トグルを持たない場所)は、全部表示・全部機能 ON として振る舞う */
export const ObjectStateContext = createContext<ObjectState>({
  visible: true,
  enabled: true,
});

export const useObjectState = (): ObjectState => useContext(ObjectStateContext);
