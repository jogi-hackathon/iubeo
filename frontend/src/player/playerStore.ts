import {authorityRegistry} from "../authority/registry";
import {createPlayerManager} from "./playerManager";

/** 自分の ID は、今のオーソリティが持つ 1 つだけ(authority/registry.ts)。ここでは持たずに引く */
export const playerManager = createPlayerManager({
  myPlayerId: () => authorityRegistry.current()?.playerId ?? null,
});
