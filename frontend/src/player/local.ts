import {START_POSITION} from "./constants";
import {createPlayerState} from "./state";

export const localPlayer = createPlayerState(...START_POSITION);
