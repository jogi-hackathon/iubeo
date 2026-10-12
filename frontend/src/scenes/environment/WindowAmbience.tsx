import {useEffect, useRef} from "react";
import type {Group} from "three";

import {useSfxEmitter} from "../../core/audio/sfx/useSfxEmitter";
import type {Vec3} from "../../props/types";

const WINDOW_SPATIAL = {ref: 1, rolloff: 2};

export function WindowAmbience({position}: {position: Vec3}) {
  const root = useRef<Group>(null);
  const sfx = useSfxEmitter(["window"], root, WINDOW_SPATIAL);
  useEffect(() => {
    sfx.play("window");
    return () => sfx.stop("window");
  }, [sfx]);
  return <group ref={root} position={position} />;
}
