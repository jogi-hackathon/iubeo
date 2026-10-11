import {useEffect} from "react";

import {cycleDevTab, toggleDevPanel} from "./devPanel";
import {
  DEBUG_AVAILABLE,
  getDebugFlags,
  setDebugFlag,
  toggleDebugFlag,
} from "./flags";

export const useDebugHotkeys = (): void => {
  useEffect(() => {
    if (!DEBUG_AVAILABLE) {
      return;
    }
    const onKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case "F6": {
          const {stats, grid} = getDebugFlags();
          const next = !(stats || grid);
          setDebugFlag("stats", next);
          setDebugFlag("grid", next);
          break;
        }
        case "F8":
          toggleDebugFlag("freeCamera");
          break;
        case "F10":
          if (e.shiftKey) {
            cycleDevTab();
          } else {
            toggleDevPanel();
          }
          break;
        default:
          return;
      }
      e.preventDefault();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
};
