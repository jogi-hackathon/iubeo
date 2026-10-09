export {ManagedObjects} from "./ManagedObjects";
export {
  Interaction,
  type InteractionHandler,
  Reticle,
  useInteraction,
} from "./interaction";
export {createObjectManager, type ObjectManager} from "./objectManager";
export {objectManager, setRequestHandler} from "./objectStore";
export type {
  GameObject,
  HeldItemRef,
  InteractOptions,
  InteractRequest,
  ObjectAvailability,
  ObjectEvents,
  ObjectMessage,
  ObjectScope,
  RejectReason,
} from "./types";
export {useObjectsState} from "./useObjects";
