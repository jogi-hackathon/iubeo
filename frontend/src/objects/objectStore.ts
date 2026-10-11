import {authorityRegistry} from "../authority/registry";
import {itemManager} from "../items";
import {createObjectManager} from "./objectManager";

export const objectManager = createObjectManager({
  getHeldItem: () => {
    const held = itemManager.getHeld();
    return held && {id: held.id, kind: held.kind};
  },
  getAuthority: () => authorityRegistry.current(),
});
