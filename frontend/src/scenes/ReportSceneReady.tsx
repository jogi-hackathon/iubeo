import {useEffect} from "react";

import type {SceneName} from "./index";
import {markSceneReady} from "./sceneReady";

/**
 * シーンが準備できたことを知らせる。App がシーンの隣(後ろ)に 1 つだけ置く(シーンごとに置き忘れない)。
 * effect で報告するので、マウントの時点で置かれたオブジェクトは同じ commit に入っている。
 * サーバー役(オーソリティ)の準備を待つようになったら、ここの報告の仕方を変える
 */
export function ReportSceneReady({scene}: {scene: SceneName}) {
  useEffect(() => {
    markSceneReady(scene);
  }, [scene]);
  return null;
}
