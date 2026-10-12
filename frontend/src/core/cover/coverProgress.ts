export const CREEP_LIMIT = 0.9;
export const CREEP_TIME_CONSTANT_MS = 2500;

export const barFraction = ({
  done,
  total,
  elapsedMs,
}: {
  done: number;
  total: number;
  elapsedMs: number;
}): number => {
  if (done >= total) {
    return 1;
  }
  const elapsed = Math.max(0, elapsedMs);
  const inStage =
    CREEP_LIMIT * (1 - Math.exp(-elapsed / CREEP_TIME_CONSTANT_MS));
  return (done + inStage) / total;
};

export const bootStageCount = (bootSteps: number): number => bootSteps + 2;

export const bootStageDone = ({
  total,
  warmedUp,
  sceneReady,
}: {
  total: number;
  warmedUp: boolean;
  sceneReady: boolean;
}): number => total - 2 + Number(warmedUp) + Number(sceneReady);
