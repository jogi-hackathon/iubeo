import {useDebugFlags} from "../../core/debug/flags";
import {localPlayer} from "../local";
import {PlayerSkeleton} from "./PlayerSkeleton";

/** ローカルプレイヤー自身の身体。一人称では頭がカメラと重なるので隠し、freeCamera(F8)では頭ごと見せる */
export function LocalPlayerSkeleton() {
  const {freeCamera} = useDebugFlags();
  return <PlayerSkeleton state={localPlayer} hideHead={!freeCamera} />;
}
