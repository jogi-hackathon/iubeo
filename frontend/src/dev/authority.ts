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
  {
    id: "3f0c6a52-8d1e-4b7a-9c35-1a2e4f6b8d01",
    color: "#e63946",
    status: "unedited",
  },
  {
    id: "7b19d4e3-2c58-4a06-8f71-5d3a9c0e2b02",
    color: "#f4a261",
    status: "unedited",
  },
  {
    id: "c2e85f10-6a47-4d93-b1e8-0f7d3a5c9e03",
    color: "#ffd60a",
    status: "unedited",
  },
  {
    id: "91a4b7d6-0e3f-4c28-a5b9-6e1d8f2c4a04",
    color: "#2a9d5c",
    status: "unedited",
  },
  {
    id: "5d8e2c93-b7a1-4f60-83d4-9a0c6e1f7b05",
    color: "#1d6fe0",
    status: "unedited",
  },
  {
    id: "e07a1b48-3d95-4c2e-9f86-2b5d7a0c8e06",
    color: "#9b5de5",
    status: "unedited",
  },
];

// 確認用のオブジェクト(スポーン地点から見て -Z 方向)
dummyAuthority.spawnObject([-1.5, 1, -4], "personal");
dummyAuthority.spawnObject([1.5, 1, -4], "shared");
dummyAuthority.spawnObject([0, 1, -4], "personal", "unavailable");
dummyAuthority.spawnDirectory([...DEV_DIRECTORY_POSITION], DEV_DIRECTORY_STOCK);
