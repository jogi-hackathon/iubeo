import type {JudgeState} from "./judge";

/**
 * 判定が「一致」になったときに、使っている PC へ interact を送る。
 *
 * - 通った（verdict が match）ときだけ送る
 * - 同じページでは何度も送らない（URL ごとに 1 回）
 * - 手が塞がっていたら送らない（オーソリティが missing_item で拒むので、要求を出さない。持っていた物を消さない）
 * - ここが決めるのは「送るかどうか」まで。通るかどうかはオーソリティ（サーバー、またはローカルの規則）が決める
 */
export const createSearchDeliverable = ({
  interact,
  held,
}: {
  interact: (objectId: string) => boolean;
  held: () => boolean;
}) => {
  let delivered: string | null = null;

  return {
    /**
     * 判定の状態を見て、一致なら PC の objectId へ interact を送る。送ったら true。
     * 一致でない・同じ URL・手が塞がっている、のいずれかなら false
     */
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
    /** PC を離れたときに、見張りをやり直す（同じ URL でも、また送れるようにする） */
    reset: (): void => {
      delivered = null;
    },
  };
};

export type SearchDeliverable = ReturnType<typeof createSearchDeliverable>;
