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
    // 段階の総数は、起動のステップを進めた BootScreen がバーに入れた値を使う(残りの 2 段階をここで進める)
    const total = coverStore.getState().bar?.total;
    if (total !== undefined) {
      coverStore.setBar(total, bootStageDone({total, warmedUp, sceneReady}));
    }
    if (warmedUp && sceneReady) {
      void finishBootCover();
    }
  }, [warmedUp, sceneReady]);
}
