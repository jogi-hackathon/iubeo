import {useMyPlayerId} from "../../authority/useMyPlayerId";
import {useCameraDetached} from "../../core/cameraDetached";
import {useDebugFlags} from "../../core/debug/flags";
import {useSpectatePhase} from "../../core/spectate";
import {HandheldTerminal} from "../../game/slip/HandheldTerminal";
import {orderSlip, useOrderSlip} from "../../game/slip/store";
import {HeldItem, useItemState} from "../../items";
import {useWorkingAtWorkspace} from "../../objects/workspace/useWorkingAtWorkspace";
import {useTransitionActive} from "../../scenes/transitionActive";
import {localPlayer} from "../local";
import {PlayerSkeleton} from "./PlayerSkeleton";

export function LocalPlayerSkeleton() {
  const {freeCamera} = useDebugFlags();
  const detached = useCameraDetached();
  const transitioning = useTransitionActive();
  const dead = useSpectatePhase() !== "alive";
  const {held: item} = useItemState();
  const held = useWorkingAtWorkspace(useMyPlayerId()) ? null : item;
  const {playing: slip} = useOrderSlip();
  // 依頼の伝票を再生している間は、持ち物の代わりにハンディーターミナルを手に出す
  const handItem = slip ? (
    <HandheldTerminal
      key={slip.startedAt}
      content={slip.content}
      elapsedMs={() => performance.now() - slip.startedAt}
      onLaunch={orderSlip.launch}
    />
  ) : (
    held && <HeldItem item={held} />
  );
  return (
    <PlayerSkeleton
      state={localPlayer}
      visible={!transitioning}
      hideHead={!freeCamera && !detached}
      ragdoll={dead}
      holding={slip !== null || held !== null}
      handItem={handItem}
    />
  );
}
