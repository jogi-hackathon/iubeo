/** 段階の中では、次の境界の手前(段階の幅の CREEP_LIMIT まで)をじわじわ進め、止まって見えないようにする。境界には届かせない */
export const CREEP_LIMIT = 0.9;
/** 段階の中の進みの時間定数(ms)。約 2.5 秒で CREEP_LIMIT の 63% まで進む */
export const CREEP_TIME_CONSTANT_MS = 2500;

/** 進捗バーの割合(0〜1)。done は完了した段階の数、total は段階の総数 */
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

/** 起動の段階の総数。起動の各ステップ・シェーダーのウォームアップ・最初のシーンの準備 */
export const bootStageCount = (bootSteps: number): number => bootSteps + 2;

/**
 * 起動で完了した段階の数。total は段階の総数(bootStageCount)。
 * ステップが終わった後は、最後の 2 段階(ウォームアップと最初のシーンの準備)を数える
 */
export const bootStageDone = ({
  total,
  warmedUp,
  sceneReady,
}: {
  total: number;
  warmedUp: boolean;
  sceneReady: boolean;
}): number => total - 2 + Number(warmedUp) + Number(sceneReady);
