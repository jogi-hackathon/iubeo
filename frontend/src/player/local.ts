import {START_POSITION} from "./constants";
import {createPlayerState} from "./state";
import type {PlayerId} from "./types";

// 暫定: ネットワーク上のプレイヤー群のレジストリに置き換える
export const localPlayer = createPlayerState(...START_POSITION);

// 暫定: 識別の方式が決まるまでの固定値
export const LOCAL_PLAYER_ID: PlayerId = "local";
