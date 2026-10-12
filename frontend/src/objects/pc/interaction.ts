import type {GameObject} from "../types";
import {type PcPointerMode, pcSession} from "./session";

export const createPcInteraction =
  (enter: (objectId: string, pointer: PcPointerMode) => boolean) =>
  (pointer: PcPointerMode) =>
  (object: GameObject): boolean => {
    enter(object.id, pointer);
    return true;
  };

export const pcInteraction = createPcInteraction((id, pointer) =>
  pcSession.enter(id, pointer),
);
