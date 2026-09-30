import {useCameraDetached} from "../../core/cameraDetached";
import {useDebugFlags} from "../../core/debug/flags";
import {HeldItem, useItemState} from "../../items";
import {localPlayer} from "../local";
import {PlayerSkeleton} from "./PlayerSkeleton";

/** ローカルプレイヤー自身の身体。一人称では頭がカメラと重なるので隠し、freeCamera(F8)やカメラが目から離れている間(俯瞰への移動中)は頭ごと見せる。持っているアイテムは手元に出す */
export function LocalPlayerSkeleton() {
  const {freeCamera} = useDebugFlags();
  // 俯瞰への移動中など、カメラが目の位置から離れている間は、頭も見せる
  const detached = useCameraDetached();
  const {held} = useItemState();
  return (
    <PlayerSkeleton
      state={localPlayer}
      hideHead={!freeCamera && !detached}
      holding={held !== null}
      handItem={held && <HeldItem item={held} />}
    />
  );
}
