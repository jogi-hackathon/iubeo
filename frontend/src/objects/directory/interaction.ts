import {getActiveToggles} from "../../core/toggles";
import {itemManager} from "../../items";
import type {GameObject} from "../types";
import {overview} from "./overview";

type Deps = {
  isHandEmpty: () => boolean;
  isOverviewEnabled: () => boolean;
  enterOverview: (directoryId: string) => void;
};

export const createDirectoryInteraction =
  ({isHandEmpty, isOverviewEnabled, enterOverview}: Deps) =>
  (object: GameObject): boolean => {
    if (!isHandEmpty()) {
      return false;
    }
    if (!isOverviewEnabled()) {
      return true;
    }
    enterOverview(object.id);
    return true;
  };

export const directoryInteractionFor = (overviewKey: string) =>
  createDirectoryInteraction({
    isHandEmpty: () => itemManager.getHeld() === null,
    isOverviewEnabled: () => getActiveToggles()?.isEnabled(overviewKey) ?? true,
    enterOverview: (id) => {
      overview.enter(id);
    },
  });
