import {useThree} from "@react-three/fiber";
import {useEffect} from "react";

import {connectPointerLock, usePointerLocked} from "./pointerLock";

export function PointerLockInput() {
  const gl = useThree((s) => s.gl);
  const get = useThree((s) => s.get);
  const setEvents = useThree((s) => s.setEvents);
  const locked = usePointerLocked();

  useEffect(() => connectPointerLock(gl.domElement), [gl]);

  useEffect(() => {
    if (!locked) {
      return;
    }
    const oldCompute = get().events.compute;
    setEvents({
      compute(_event, state) {
        state.pointer.set(0, 0);
        state.raycaster.setFromCamera(state.pointer, state.camera);
      },
    });
    return () => setEvents({compute: oldCompute});
  }, [locked, get, setEvents]);

  return null;
}
