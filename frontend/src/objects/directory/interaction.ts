import {itemManager} from "../../items";
import {registerInteractionHandler} from "../interaction/handlers";
import type {GameObject} from "../types";
import {DIRECTORY_KIND} from "./data";
import {overview} from "./overview";

type Deps = {
  /** 手ぶらか(メインハンドが空か) */
  isHandEmpty: () => boolean;
  enterOverview: (directoryId: string) => void;
};

/**
 * ディレクトリのインタラクト。手ぶらなら、サーバーには送らず、クライアントの俯瞰ビューに入る(取り出す前の選択)。
 * ファイルを持っているときは処理せず(false)、既定の処理(そのまま interact を送る = 入れる)に任せる
 */
export const createDirectoryInteraction =
  ({isHandEmpty, enterOverview}: Deps) =>
  (object: GameObject): boolean => {
    if (!isHandEmpty()) {
      return false;
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
      enterOverview: (id) => {
        overview.enter(id);
      },
    }),
  );
