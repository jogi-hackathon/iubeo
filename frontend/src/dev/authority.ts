import {itemManager} from "../items";
import {objectManager, setRequestHandler} from "../objects";
import type {StockFile} from "../objects/directory/data";
import {LOCAL_PLAYER_ID} from "../player/local";
import {createDummyAuthority} from "./dummyAuthority";

/** 開発時のダミーのサーバー役。読み込むと、オブジェクトの要求の送り先として登録され、確認用のオブジェクトを置く */
export const dummyAuthority = createDummyAuthority({
  localPlayerId: LOCAL_PLAYER_ID,
  objects: objectManager,
  items: itemManager,
});

setRequestHandler(dummyAuthority.handle);

/**
 * ディレクトリの置き場所と、在庫(はっきり見分けられる 6 色)。山とファイルのアニュラスの外径(約 6.3m)が、
 * TestScene の壁(x=8 の壁の端 (8.25,-4) まで 7.6m)・球・ダミーの箱・ダミープレイヤーの歩く円(中心 (4,-3)、半径 1.5)・
 * スポーン地点のどれとも重ならない、+X 側の壁の外
 */
const DEV_DIRECTORY_POSITION = [14, 0, 1] as const;
const DEV_DIRECTORY_STOCK: readonly StockFile[] = [
  {id: "file-red", color: "#e63946", edited: false},
  {id: "file-orange", color: "#f4a261", edited: false},
  {id: "file-yellow", color: "#ffd60a", edited: false},
  {id: "file-green", color: "#2a9d5c", edited: false},
  {id: "file-blue", color: "#1d6fe0", edited: false},
  {id: "file-purple", color: "#9b5de5", edited: false},
];

// 確認用のオブジェクト(スポーン地点から見て -Z 方向)
dummyAuthority.spawnObject([-1.5, 1, -4], "personal");
dummyAuthority.spawnObject([1.5, 1, -4], "shared");
dummyAuthority.spawnObject([0, 1, -4], "personal", "unavailable");
dummyAuthority.spawnDirectory([...DEV_DIRECTORY_POSITION], DEV_DIRECTORY_STOCK);
