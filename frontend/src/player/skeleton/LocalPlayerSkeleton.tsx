import {useMyPlayerId} from "../../authority/useMyPlayerId";
import {useCameraDetached} from "../../core/cameraDetached";
import {useDebugFlags} from "../../core/debug/flags";
import {useSpectatePhase} from "../../core/spectate";
import {HandheldTerminal} from "../../game/slip/HandheldTerminal";
import {orderSlip, useOrderSlip} from "../../game/slip/store";
import {heldSlipWorld} from "../../game/slip/zoom";
import {HeldItem, useItemState} from "../../items";
import {LIGHTER_KIND} from "../../items/lighter";
import {useWorkingAtWorkspace} from "../../objects/workspace/useWorkingAtWorkspace";
import {useRising} from "../../present/riseStore";
import {useTransitionActive} from "../../scenes/transitionActive";
import {localPlayer} from "../local";
import {useLighterSound} from "../useLighterSound";
import {PlayerSkeleton} from "./PlayerSkeleton";

export function LocalPlayerSkeleton() {
  const {freeCamera} = useDebugFlags();
  const detached = useCameraDetached();
  const transitioning = useTransitionActive();
  const rising = useRising();
  const dead = useSpectatePhase() !== "alive";
  const {held: item} = useItemState();
  const held = useWorkingAtWorkspace(useMyPlayerId()) ? null : item;
  const {playing: slip} = useOrderSlip();
  useLighterSound(localPlayer, !dead, !slip && held?.kind === LIGHTER_KIND);
  const handItem = slip ? (
    <HandheldTerminal
      key={slip.startedAt}
      content={slip.content}
      elapsedMs={() => performance.now() - slip.startedAt}
      onLaunch={orderSlip.launch}
      slipWorld={heldSlipWorld}
    />
  ) : (
    held && <HeldItem item={held} />
  );
  return (
    <PlayerSkeleton
      state={localPlayer}
      visible={!transitioning && !rising}
      hideHead={!freeCamera && !detached}
      ragdoll={dead}
      holding={slip !== null || held !== null}
      handItem={handItem}
    />
  );
}
