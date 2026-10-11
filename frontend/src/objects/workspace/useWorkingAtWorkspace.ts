import type {PlayerId} from "../../player/types";
import {useObjectsState} from "../useObjects";
import {WORKSPACE_KIND} from "./data";

export const useWorkingAtWorkspace = (playerId: PlayerId | null): boolean => {
  const {objects} = useObjectsState();
  return (
    playerId !== null &&
    objects.some(
      (object) =>
        object.kind === WORKSPACE_KIND && object.users.includes(playerId),
    )
  );
};
