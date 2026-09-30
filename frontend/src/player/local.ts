import {START_POSITION} from "./constants";
import {createPlayerState} from "./state";

// 暫定: ネットワーク上のプレイヤー群のレジストリに置き換える
export const localPlayer = createPlayerState(...START_POSITION);
