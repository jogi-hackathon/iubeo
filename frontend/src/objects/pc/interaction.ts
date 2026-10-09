import {registerInteractionHandler} from "../interaction/handlers";
import type {GameObject} from "../types";
import {PC_KIND} from "./data";
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

/** 汎用のインタラクト基盤に、PC 固有の処理を差し込む。ManagedObjects が描画する前に一度呼ぶ */
export const registerPcInteraction = (): (() => void) =>
  registerInteractionHandler(
    PC_KIND,
    createPcInteraction((id) => pcSession.enter(id)),
  );
