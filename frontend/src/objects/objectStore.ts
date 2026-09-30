import {itemManager} from "../items";
import {LOCAL_PLAYER_ID} from "../player/local";
import {createObjectManager} from "./objectManager";
import type {InteractRequest} from "./types";

// 要求の送り先。実サーバーができるまでは、開発時にダミーのサーバー役(dev/authority.ts)が登録する。
// 本番では登録されず、要求は捨てられる
let requestHandler: (request: InteractRequest) => void = () => {};

export const setRequestHandler = (
  handler: (request: InteractRequest) => void,
): void => {
  requestHandler = handler;
};

export const objectManager = createObjectManager({
  localPlayerId: LOCAL_PLAYER_ID,
  getHeldItem: () => {
    const held = itemManager.getHeld();
    return held && {id: held.id, kind: held.kind};
  },
  send: (request) => requestHandler(request),
});
