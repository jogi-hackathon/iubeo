import type {GameObject} from "../types";

/**
 * オブジェクトごとのインタラクトの処理。クライアント側だけで完結させる場合(ディレクトリの俯瞰ビューなど)に登録する。
 * true を返すと処理済みで、サーバーへの要求は送らない。false なら、既定の処理(要求を送る)に進む
 */
export type InteractionHandler = (object: GameObject) => boolean;

// 種類ではなく objectId で引く。同じ種類でも、オブジェクトごとに描画しているコンポーネントが自分の処理を登録する(useInteraction)
const handlers = new Map<string, InteractionHandler>();

/** オブジェクトに処理を登録する。同じ id は上書き。戻り値は解除関数 */
export const registerInteractionHandler = (
  objectId: string,
  handler: InteractionHandler,
): (() => void) => {
  handlers.set(objectId, handler);
  return () => {
    if (handlers.get(objectId) === handler) {
      handlers.delete(objectId);
    }
  };
};

/** 登録された処理があれば先に任せ、処理されなければ sendRequest(既定の処理)を呼ぶ */
export const dispatchInteraction = (
  object: GameObject,
  sendRequest: () => void,
): void => {
  if (handlers.get(object.id)?.(object)) {
    return;
  }
  sendRequest();
};
