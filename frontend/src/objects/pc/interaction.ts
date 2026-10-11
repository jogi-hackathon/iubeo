import type {GameObject} from "../types";
import {pcSession} from "./session";

export const createPcInteraction =
  (enter: (objectId: string) => boolean) =>
  (object: GameObject): boolean => {
    enter(object.id);
    return true;
  };

export const pcInteraction = createPcInteraction((id) => pcSession.enter(id));
