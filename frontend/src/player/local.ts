import {START_POSITION} from "./constants";
import {playerManager} from "./playerStore";
import {createPlayerState} from "./state";
import type {PlayerId} from "./types";

// 暫定: ネットワーク上のプレイヤー群のレジストリに置き換える
export const localPlayer = createPlayerState(...START_POSITION);

/** サーバーにつないでいないとき(ダミーのサーバー役で動かすとき)の、自分の固定値 */
export const LOCAL_PLAYER_ID: PlayerId = "local";

/** 今の自分。サーバーにつないでいれば、サーバーが発行した ID(playerManager)。つないでいなければ LOCAL_PLAYER_ID */
export const getLocalPlayerId = (): PlayerId =>
  playerManager.getState().localPlayerId ?? LOCAL_PLAYER_ID;
