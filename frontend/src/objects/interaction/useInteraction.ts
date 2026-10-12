import {useLayoutEffect, useRef} from "react";

import type {GameObject} from "../types";
import {type InteractionHandler, registerInteractionHandler} from "./handlers";

export function useInteraction(
  object: GameObject,
  handler: InteractionHandler,
): void {
  const latest = useRef(handler);
  useLayoutEffect(() => {
    latest.current = handler;
  }, [handler]);

  const {id} = object;
  useLayoutEffect(
    () => registerInteractionHandler(id, (o) => latest.current(o)),
    [id],
  );
}
