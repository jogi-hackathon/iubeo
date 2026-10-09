import {authorityRegistry} from "../authority/registry";
import {itemManager} from "../items";
import {createObjectManager} from "./objectManager";

/** オブジェクトの写し(ワールドの状態の正は窓口。ここは通知を反映し、操作を要求として送る) */
export const objectManager = createObjectManager({
  getHeldItem: () => {
    const held = itemManager.getHeld();
    return held && {id: held.id, kind: held.kind};
  },
  getAuthority: () => authorityRegistry.current(),
});
