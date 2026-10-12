import type {JudgeState} from "./judge";

export const createSearchDeliverable = ({
  interact,
  held,
}: {
  interact: (objectId: string) => boolean;
  held: () => boolean;
}) => {
  let delivered: string | null = null;

  return {
    onJudge: (state: JudgeState, objectId: string): boolean => {
      if (state.status !== "done" || state.result.verdict !== "match") {
        return false;
      }
      const {url} = state;
      if (!url || delivered === url) {
        return false;
      }
      delivered = url;
      if (held()) {
        return false;
      }
      return interact(objectId);
    },
    reset: (): void => {
      delivered = null;
    },
  };
};

export type SearchDeliverable = ReturnType<typeof createSearchDeliverable>;
