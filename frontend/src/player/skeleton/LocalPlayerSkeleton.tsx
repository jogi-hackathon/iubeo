import {useDebugFlags} from "../../core/debug/flags";
import {HeldItem, useItemState} from "../../items";
import {localPlayer} from "../local";
import {PlayerSkeleton} from "./PlayerSkeleton";

/** ローカルプレイヤー自身の身体。一人称では頭がカメラと重なるので隠し、freeCamera(F8)では頭ごと見せる。持っているアイテムは手元に出す */
export function LocalPlayerSkeleton() {
  const {freeCamera} = useDebugFlags();
  const {held} = useItemState();
  return (
    <PlayerSkeleton
      state={localPlayer}
      hideHead={!freeCamera}
      holding={held !== null}
      handItem={held && <HeldItem item={held} />}
    />
  );
}
