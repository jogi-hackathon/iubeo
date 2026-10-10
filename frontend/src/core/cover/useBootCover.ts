import {useEffect, useState} from "react";

import type {SceneName} from "../../scenes";
import {whenSceneReady} from "../../scenes/sceneReady";
import {finishBootCover} from "./cover";
import {bootStageDone} from "./coverProgress";
import {coverStore} from "./coverStore";

/**
 * 起動の覆いを外す。シェーダーのウォームアップと最初のシーンの準備の両方が終わったら外す(フェードアウトは CSS)。
 * 起動の各ステップの段階は BootScreen が進め、ここではマウント後の 2 段階と、外すタイミングだけを扱う
 */
export function useBootCover(initialScene: SceneName, warmedUp: boolean): void {
  const [sceneReady, setSceneReady] = useState(false);

  useEffect(() => {
    let alive = true;
    void whenSceneReady(initialScene).then(() => {
      if (alive) {
        setSceneReady(true);
      }
    });
    return () => {
      alive = false;
    };
  }, [initialScene]);

  useEffect(() => {
    const total = coverStore.getState().bar?.total;
    if (total !== undefined) {
      coverStore.setBar(total, bootStageDone({total, warmedUp, sceneReady}));
    }
    if (warmedUp && sceneReady) {
      void finishBootCover();
    }
  }, [warmedUp, sceneReady]);
}
