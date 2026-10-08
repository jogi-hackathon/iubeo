import {getActiveToggles} from "../../core/toggles";
import {itemManager} from "../../items";
import {registerInteractionHandler} from "../interaction/handlers";
import type {GameObject} from "../types";
import {DIRECTORY_KIND, DIRECTORY_OVERVIEW_KEY} from "./data";
import {overview} from "./overview";

type Deps = {
  /** 手ぶらか(メインハンドが空か) */
  isHandEmpty: () => boolean;
  /** 俯瞰ビューの機能が ON か(トグルを持たないシーンでは常に true) */
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

/** 汎用のインタラクト基盤に、ディレクトリ固有の処理を差し込む。ManagedObjects が描画する前に一度呼ぶ */
export const registerDirectoryInteraction = (): (() => void) =>
  registerInteractionHandler(
    DIRECTORY_KIND,
    createDirectoryInteraction({
      isHandEmpty: () => itemManager.getHeld() === null,
      isOverviewEnabled: () =>
        getActiveToggles()?.isEnabled(DIRECTORY_OVERVIEW_KEY) ?? true,
      enterOverview: (id) => {
        overview.enter(id);
      },
    }),
  );
