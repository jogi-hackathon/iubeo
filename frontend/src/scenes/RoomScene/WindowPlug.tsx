import {useEffect, useMemo} from "react";
import {MeshStandardMaterial} from "three";

import {aoModeUserData} from "../../bake/aoMode";
import {setSkipGTAO} from "../../camera/postprocess/skipGTAO";
import {BVHCollider} from "../../core/bvh";
import {PROP_COLOR} from "../../props/types";
import {WINDOW_PLUG} from "./layout";

/**
 * 窓を非表示にしたときに、窓の空洞をふさぐ壁板(当たり判定あり)。mesh は外さず、見た目と当たり判定だけを消す。
 * 出し入れするので、ベイクには入れない(realtime)。ただ GTAO を掛けると、周りの壁(ベイク AO だけで GTAO なし)より
 * 浅い角度で見たときにうっすら暗くなって継ぎ目が見えるので、GTAO も掛けない(周りの平らな壁と同じく AO なしで揃える)
 */
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
