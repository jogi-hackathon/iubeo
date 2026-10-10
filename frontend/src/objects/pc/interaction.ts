import type {GameObject} from "../types";
import {pcSession} from "./session";

/**
 * PC のインタラクト。サーバーには送らず、クライアントの操作モード（PC を使う）に入る。
 * 使っている最中に別の PC を触っても、入り直さない（enter が false を返すだけ）。
 * どちらにせよ要求は送らないので、処理済みとして返す。
 */
export const createPcInteraction =
  (enter: (objectId: string) => boolean) =>
  (object: GameObject): boolean => {
    enter(object.id);
    return true;
  };

/** PC のインタラクトの処理(PcObject が useInteraction で登録する) */
export const pcInteraction = createPcInteraction((id) => pcSession.enter(id));
