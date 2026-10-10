import {useEffect} from "react";

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
        case "F7":
          toggleDebugFlag("bvh");
          break;
        case "F8":
          toggleDebugFlag("freeCamera");
          break;
        case "F9":
          toggleDebugFlag("postfx");
          break;
        case "F10":
          toggleDebugFlag(e.shiftKey ? "game" : "scene");
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
