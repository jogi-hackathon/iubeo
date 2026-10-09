import {DEBUG_REQUESTED} from "../../core/debug/flags";
import {objectManager} from "../../objects/objectStore";
import {PC_KIND} from "../../objects/pc/data";
import type {GameObject} from "../../objects/types";
import {WORKSPACE_KIND} from "../../objects/workspace/data";
import {LOCAL_PLAYER_ID} from "../../player/local";
import {PC_POSITION, WORKSPACE_POSITION} from "./layout";

const DEBUG_OBJECT_IDS = [`${WORKSPACE_KIND}-debug`, `${PC_KIND}-debug`];

const personal = (
  kind: string,
  position: GameObject["position"],
): GameObject => ({
  id: `${kind}-debug`,
  kind,
  scope: "personal",
  owner: LOCAL_PLAYER_ID,
  position,
  users: [],
  availability: "available",
  data: null,
});

/**
 * サーバーがオブジェクトを置くようになるまでの間、?debug(VITE_ENABLE_DEBUG=true のビルド)のときだけ、
 * room の机と PC をクライアントで置く。dev/ のダミーのサーバー役は本番のバンドルに入らないので、ここで直接置く。
 * 開発サーバーでは dev/authority が置くので、ここでは置かない。戻り値は、シーンを出るときに外す関数
 */
export const placeDebugObjects = (): (() => void) => {
  if (import.meta.env.DEV || !DEBUG_REQUESTED) {
    return () => {};
  }
  objectManager.apply({
    type: "upsert",
    object: personal(WORKSPACE_KIND, [...WORKSPACE_POSITION]),
  });
  objectManager.apply({
    type: "upsert",
    object: personal(PC_KIND, [...PC_POSITION]),
  });
  return () => {
    for (const id of DEBUG_OBJECT_IDS) {
      objectManager.apply({type: "remove", id});
    }
  };
};
