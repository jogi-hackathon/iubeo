import {useEffect} from "react";

import type {SceneName} from "./index";
import {markSceneReady} from "./sceneReady";

/**
 * シーンが準備できたことを知らせる(mount のシーンだけ。App と bake が、表(readiness.ts の readinessOf)で mount のシーンにだけ置く)。
 * オーソリティが物を置くシーン(authority)は、置いた LocalAuthority / ServerAuthority が自分で知らせる。
 * 置かれる側の effect は、シーンの後ろに置くこの effect より先に走るので、マウントの時点で準備は整う
 */
export function ReportSceneReady({scene}: {scene: SceneName}) {
  useEffect(() => {
    markSceneReady(scene);
  }, [scene]);
  return null;
}
