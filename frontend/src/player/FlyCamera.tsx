import { useFrame } from "@react-three/fiber";
import { Vector3 } from "three";
import { useDebugFlags } from "../core/debug/flags";
import { FLY_SPEED, MAX_DELTA } from "./constants";
import { useKeys } from "./useKeys";

const dir = new Vector3();
const right = new Vector3();
const move = new Vector3();
const UP = new Vector3(0, 1, 0);

/** freeCamera 時のみ動く。視点操作は PlayerController の PointerLockControls を共用する */
export function FlyCamera() {
  const { freeCamera } = useDebugFlags();
  const keys = useKeys();

  useFrame(({ camera }, delta) => {
    if (!freeCamera) return;
    const k = keys.current;
    const f = Number(k.has("KeyW")) - Number(k.has("KeyS"));
    const r = Number(k.has("KeyD")) - Number(k.has("KeyA"));
    const u =
      Number(k.has("Space")) - Number(k.has("ShiftLeft") || k.has("KeyC"));
    camera.getWorldDirection(dir);
    right.crossVectors(dir, UP).normalize();
    move
      .set(0, 0, 0)
      .addScaledVector(dir, f)
      .addScaledVector(right, r)
      .addScaledVector(UP, u);
    if (move.lengthSq() === 0) return;
    camera.position.addScaledVector(
      move.normalize(),
      FLY_SPEED * Math.min(delta, MAX_DELTA),
    );
  });

  return null;
}
