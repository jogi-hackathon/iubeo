import type {GameObject} from "../types";

export type InteractionHandler = (object: GameObject) => boolean;

const handlers = new Map<string, InteractionHandler>();

export const registerInteractionHandler = (
  objectId: string,
  handler: InteractionHandler,
): (() => void) => {
  handlers.set(objectId, handler);
  return () => {
    if (handlers.get(objectId) === handler) {
      handlers.delete(objectId);
    }
  };
};

export const dispatchInteraction = (
  object: GameObject,
  sendRequest: () => void,
): void => {
  if (handlers.get(object.id)?.(object)) {
    return;
  }
  sendRequest();
};
