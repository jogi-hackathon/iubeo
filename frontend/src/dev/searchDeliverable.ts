import type {ItemManager} from "../items";
import type {CreatedStatus} from "../items/file";
import type {JudgeStore} from "../objects/pc/judge";

/** 検索の成果物の status（items/file.ts の作成系の 1 つ） */
export const SEARCH_DELIVERABLE_STATUS: CreatedStatus = "search_created";

type Deps = {
  authority: {spawnNewFile: (status: CreatedStatus) => unknown};
  judge: JudgeStore;
  items: Pick<ItemManager, "getHeld">;
};

/**
 * 判定を見張り、通ったら成果物を渡す。戻り値は解除関数（開発ツールの後片付け用）。
 *
 * - 通った（verdict が match）ときだけ渡す
 * - 同じページで何度も渡さない（URL ごとに 1 回）
 * - 手が塞がっていたら渡さない（キャンバス・ワークスペースと同じ規則。持っていた物を消さない）
 */
export const installSearchDeliverable = ({
  authority,
  judge,
  items,
}: Deps): (() => void) => {
  let delivered: string | null = null;

  return judge.subscribe(() => {
    const state = judge.getState();
    if (state.status !== "done" || state.result.verdict !== "match") {
      return;
    }
    const {url} = state;
    if (!url || url.startsWith("data:") || url === delivered) {
      return;
    }
    delivered = url;
    if (items.getHeld()) {
      return;
    }
    authority.spawnNewFile(SEARCH_DELIVERABLE_STATUS);
  });
};
