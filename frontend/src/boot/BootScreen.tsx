import {useEffect} from "react";

import {App} from "../App";
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
      <AppContextProvider value={state.ctx}>
        <App />
      </AppContextProvider>
    );
  }
  if (state.status === "error") {
    return (
      <div className="boot-screen boot-error">
        <p>起動に失敗しました</p>
        <pre>{state.error.message}</pre>
      </div>
    );
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
