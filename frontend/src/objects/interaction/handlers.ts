import type {GameObject} from "../types";

/**
 * kind ごとのインタラクトの処理。クライアント側だけで完結させる場合(ディレクトリの俯瞰ビューなど)に登録する。
 * true を返すと処理済みで、サーバーへの要求は送らない。false なら、既定の処理(要求を送る)に進む
 */
export type InteractionHandler = (object: GameObject) => boolean;

const handlers = new Map<string, InteractionHandler>();

/** kind に処理を登録する。同じ kind は上書き。戻り値は解除関数 */
export const registerInteractionHandler = (
  kind: string,
  handler: InteractionHandler,
): (() => void) => {
  handlers.set(kind, handler);
  return () => {
    if (handlers.get(kind) === handler) {
      handlers.delete(kind);
    }
  };
};

/** 登録された処理があれば先に任せ、処理されなければ sendRequest(既定の処理)を呼ぶ */
export const dispatchInteraction = (
  object: GameObject,
  sendRequest: () => void,
): void => {
  if (handlers.get(object.kind)?.(object)) {
    return;
  }
  sendRequest();
};
