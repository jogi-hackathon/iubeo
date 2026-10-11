import {useEffect, useMemo} from "react";
import {MeshStandardMaterial} from "three";

import {aoModeUserData} from "../../bake/aoMode";
import {setSkipGTAO} from "../../camera/postprocess/skipGTAO";
import {BVHCollider} from "../../core/bvh";
import {PROP_COLOR} from "../../props/types";
import {WINDOW_PLUG} from "./layout";

export function WindowPlug({visible}: {visible: boolean}) {
  const material = useMemo(() => {
    const m = new MeshStandardMaterial({color: PROP_COLOR});
    setSkipGTAO(m, true);
    return m;
  }, []);
  useEffect(() => () => material.dispose(), [material]);

  return (
    <BVHCollider enabled={visible}>
      <mesh
        userData={aoModeUserData("realtime")}
        position={WINDOW_PLUG.position}
        material={material}
        visible={visible}
      >
        <boxGeometry args={WINDOW_PLUG.size} />
      </mesh>
    </BVHCollider>
  );
}
