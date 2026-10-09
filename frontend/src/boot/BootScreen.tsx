import {useEffect} from "react";

import {App} from "../App";
import {CoverOverlay} from "../core/cover/CoverOverlay";
import {bootStageCount} from "../core/cover/coverProgress";
import {coverStore} from "../core/cover/coverStore";
import {BOOT_STEPS} from "./boot";
import {BootError} from "./BootError";
import {BootErrorBoundary} from "./BootErrorBoundary";
import {startBoot, useBootState} from "./bootStore";
import {AppContextProvider} from "./context";

/** 起動の段階の総数(起動のステップ + ウォームアップ + 最初のシーンの準備)。App の側で残りを進める */
const BOOT_COVER_STAGES = bootStageCount(BOOT_STEPS.length);

/**
 * 起動シーケンス。白い覆いと進捗バーを出し、完了後に AppContext を提供して <App /> を描画する。
 * 覆いは App と一緒に残し、ウォームアップと最初のシーンの準備が終わったら外す(useBootCover)。エラー時は暗い画面のまま
 */
export function BootScreen() {
  const state = useBootState();
  const bootIndex =
    state.status === "running" ? (state.progress?.index ?? 0) : null;

  useEffect(() => {
    startBoot();
  }, []);

  useEffect(() => {
    if (bootIndex !== null) {
      coverStore.setBar(BOOT_COVER_STAGES, bootIndex);
    }
  }, [bootIndex]);

  if (state.status === "error") {
    return <BootError error={state.error} />;
  }
  if (state.status === "running") {
    return <CoverOverlay />;
  }
  // 覆いは境界の中に置く(エラーになったら覆いごと外れ、BootError が見えるようにする)
  return (
    <BootErrorBoundary>
      <AppContextProvider value={state.ctx}>
        <App />
        <CoverOverlay />
      </AppContextProvider>
    </BootErrorBoundary>
  );
}
