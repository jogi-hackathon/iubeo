import {useEffect} from "react";

import {App} from "../App";
import {BootError} from "./BootError";
import {BootErrorBoundary} from "./BootErrorBoundary";
import {startBoot, useBootState} from "./bootStore";
import {AppContextProvider} from "./context";

/** 起動シーケンス完了までローディングを表示し、完了後に AppContext を提供して <App /> を描画する */
export function BootScreen() {
  const state = useBootState();

  useEffect(() => {
    startBoot();
  }, []);

  if (state.status === "ready") {
    return (
      <BootErrorBoundary>
        <AppContextProvider value={state.ctx}>
          <App />
        </AppContextProvider>
      </BootErrorBoundary>
    );
  }
  if (state.status === "error") {
    return <BootError error={state.error} />;
  }
  const {progress} = state;
  return (
    <div className="boot-screen">
      <p>Loading...</p>
      {progress && (
        <p>
          {progress.step} ({progress.index + 1}/{progress.total})
        </p>
      )}
    </div>
  );
}
