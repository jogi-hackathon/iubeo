import {useEffect, useState} from "react";

import type {SceneName} from "../../scenes";
import {whenSceneReady} from "../../scenes/sceneReady";
import {finishBootCover} from "./cover";
import {bootStageDone} from "./coverProgress";
import {coverStore} from "./coverStore";

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
