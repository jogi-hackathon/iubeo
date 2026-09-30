import {itemManager} from "../items";
import {objectManager, setRequestHandler} from "../objects";
import {LOCAL_PLAYER_ID} from "../player/local";
import {createDummyAuthority} from "./dummyAuthority";

/** 開発時のダミーのサーバー役。読み込むと、オブジェクトの要求の送り先として登録され、確認用のオブジェクトを置く */
export const dummyAuthority = createDummyAuthority({
  localPlayerId: LOCAL_PLAYER_ID,
  objects: objectManager,
  items: itemManager,
});

setRequestHandler(dummyAuthority.handle);

// 確認用のオブジェクト(スポーン地点から見て -Z 方向)
dummyAuthority.spawnObject([-1.5, 1, -4], "personal");
dummyAuthority.spawnObject([1.5, 1, -4], "shared");
dummyAuthority.spawnObject([0, 1, -4], "personal", "unavailable");
