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

const BOOT_COVER_STAGES = bootStageCount(BOOT_STEPS.length);

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
  return (
    <BootErrorBoundary>
      <AppContextProvider value={state.ctx}>
        <App />
        <CoverOverlay />
      </AppContextProvider>
    </BootErrorBoundary>
  );
}
