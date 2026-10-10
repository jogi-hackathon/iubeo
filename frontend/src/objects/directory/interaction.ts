import {getActiveToggles} from "../../core/toggles";
import {itemManager} from "../../items";
import type {GameObject} from "../types";
import {overview} from "./overview";

type Deps = {
  isHandEmpty: () => boolean;
  isOverviewEnabled: () => boolean;
  enterOverview: (directoryId: string) => void;
};

/**
 * ディレクトリのインタラクト。手ぶらなら、サーバーには送らず、クライアントの俯瞰ビューに入る(取り出す前の選択)。
 * 俯瞰の機能が OFF(チュートリアルなど)なら、俯瞰に入らず、何もしない(処理済みにして、サーバーにも送らない)。
 * ファイルを持っているときは処理せず(false)、既定の処理(そのまま interact を送る = 入れる)に任せる
 */
export const createDirectoryInteraction =
  ({isHandEmpty, isOverviewEnabled, enterOverview}: Deps) =>
  (object: GameObject): boolean => {
    if (!isHandEmpty()) {
      return false;
    }
    if (!isOverviewEnabled()) {
      return true;
    }
    enterOverview(object.id);
    return true;
  };

/**
 * ディレクトリのインタラクトの処理(useDirectory が登録する)。俯瞰の機能のトグルのキーは、置かれた項目名から決まる
 * (例: directory:overview)
 */
export const directoryInteractionFor = (overviewKey: string) =>
  createDirectoryInteraction({
    isHandEmpty: () => itemManager.getHeld() === null,
    isOverviewEnabled: () => getActiveToggles()?.isEnabled(overviewKey) ?? true,
    enterOverview: (id) => {
      overview.enter(id);
    },
  });
