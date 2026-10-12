import {useMyPlayerId} from "../../authority/useMyPlayerId";
import {useCameraDetached} from "../../core/cameraDetached";
import {useDebugFlags} from "../../core/debug/flags";
import {useSpectatePhase} from "../../core/spectate";
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
  return (
    <PlayerSkeleton
      state={localPlayer}
      visible={!transitioning}
      hideHead={!freeCamera && !detached}
      ragdoll={dead}
      holding={held !== null}
      handItem={held && <HeldItem item={held} />}
    />
  );
}
