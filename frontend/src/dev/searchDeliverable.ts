import type {ItemManager} from "../items";
import type {CreatedStatus} from "../items/file";
import type {JudgeStore} from "../objects/pc/judge";

/**
 * 開発時のみの「検索の成果物」。
 *
 * Web Search のタスク（IDEA.md）は「検索 → ワークスペースでファイル作成 → ディレクトリへ保存」。
 * そこで、判定が通った（お題に合ったページに着いた）時点で、その検索を成果物
 * （status `search_created` のファイル）として手に持たせる。ディレクトリに入れれば、既存の規則で
 * 成果物 +1 になる（ローカルのオーソリティの規則での、作成系ファイルの扱い）。
 *
 * キャンバスの `image_created` と同じ立場で、**実サーバーが PC（Web Search）の規則を持つまでの写し**。
 * 判定そのものはクライアントの judgeStore が持つので、サーバー側ができたら、この配線はサーバーの
 * interact の規則へ移す（docs/frontend/object-architecture.md §9）。
 */

/** 検索の成果物の status（items/file.ts の作成系の 1 つ） */
export const SEARCH_DELIVERABLE_STATUS: CreatedStatus = "search_created";

type Deps = {
  /**
   * 成果物を手に持たせる口。キャンバスと同じく spawnNewFile で渡す(開発用の操作。dev/localDevOps.ts)。
   * ローカルのオーソリティが無いシーン(サーバーにつないだ sandbox など)では何もしない
   */
  authority: {spawnNewFile: (status: CreatedStatus) => unknown};
  judge: JudgeStore;
  /** 手持ちを見るためだけに使う */
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
  /** 成果物を渡し終えた URL */
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
