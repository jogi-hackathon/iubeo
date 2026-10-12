import {useEffect, useRef} from "react";
import type {Group} from "three";

import {useSfxEmitter} from "../../core/audio/sfx/useSfxEmitter";
import {WINDOW_PLUG} from "./layout";

export function WindowAmbience() {
  const root = useRef<Group>(null);
  const sfx = useSfxEmitter(["window"], root);
  useEffect(() => {
    sfx.play("window");
    return () => sfx.stop("window");
  }, [sfx]);
  return <group ref={root} position={WINDOW_PLUG.position} />;
}
