import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import { Euler, Vector3 } from "three";
import { useDebugFlags } from "../core/debug/flags";
import { FRAME_PRIORITY } from "../core/frameOrder";
import { consumeLookDelta, useKeys } from "../core/input";
import { MAX_DELTA } from "../core/time";
import { applyLook, type Look } from "../player";
import { FLY_SPEED } from "./constants";

const euler = new Euler(0, 0, 0, "YXZ");
const dir = new Vector3();
const right = new Vector3();
const move = new Vector3();
const UP = new Vector3(0, 1, 0);

/** freeCamera 時のみ動く。自前の yaw/pitch を持ち、身体(PlayerState)には触れない */
export function FlyCamera() {
  const { freeCamera } = useDebugFlags();
  const keys = useKeys();
  const look = useRef<Look>({ yaw: 0, pitch: 0 });
  const active = useRef(false);

  useFrame(({ camera }, delta) => {
    if (!freeCamera) {
      active.current = false;
      return;
    }
    if (!active.current) {
      // freeCamera になった瞬間の姿勢から始める
      active.current = true;
      euler.setFromQuaternion(camera.quaternion, "YXZ");
      look.current.yaw = euler.y;
      look.current.pitch = euler.x;
    }
    const { dx, dy } = consumeLookDelta();
    applyLook(look.current, dx, dy);
    camera.quaternion.setFromEuler(
      euler.set(look.current.pitch, look.current.yaw, 0),
    );

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
  }, FRAME_PRIORITY.camera);

  return null;
}
