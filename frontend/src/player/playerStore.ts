import {authorityRegistry} from "../authority/registry";
import {createPlayerManager} from "./playerManager";

export const playerManager = createPlayerManager({
  myPlayerId: () => authorityRegistry.current()?.playerId ?? null,
});
