import {DEBUG_REQUESTED} from "../../core/debug/flags";
import {objectManager} from "../../objects/objectStore";
import {PC_KIND} from "../../objects/pc/data";
import type {GameObject} from "../../objects/types";
import {WORKSPACE_KIND} from "../../objects/workspace/data";
import {LOCAL_PLAYER_ID} from "../../player/local";

/** room のレイアウトの id(ROOM_LAYOUT の workspace・pc と一致させる。置き場所はレイアウトが決める) */
const DEBUG_OBJECT_IDS = ["workspace-1", "pc-1"];

const personal = (id: string, kind: string): GameObject => ({
  id,
  kind,
  scope: "personal",
  owner: LOCAL_PLAYER_ID,
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
    object: personal("workspace-1", WORKSPACE_KIND),
  });
  objectManager.apply({
    type: "upsert",
    object: personal("pc-1", PC_KIND),
  });
  return () => {
    for (const id of DEBUG_OBJECT_IDS) {
      objectManager.apply({type: "remove", id});
    }
  };
};
