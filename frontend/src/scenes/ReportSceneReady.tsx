import {useEffect} from "react";

import type {SceneName} from "./index";
import {markSceneReady} from "./sceneReady";

export function ReportSceneReady({scene}: {scene: SceneName}) {
  useEffect(() => {
    markSceneReady(scene);
  }, [scene]);
  return null;
}
