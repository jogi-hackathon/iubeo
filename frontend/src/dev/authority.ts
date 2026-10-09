import {itemManager} from "../items";
import {objectManager, setRequestHandler} from "../objects";
import type {StockFile} from "../objects/directory/data";
import {DESK_HEIGHT} from "../objects/workspace/desk";
import {LOCAL_PLAYER_ID} from "../player/local";
import type {SceneName} from "../scenes";
import {
  CANVAS_POSITION,
  CANVAS_YAW,
  DIRECTORY_POSITION,
  PC_POSITION,
  WORKSPACE_POSITION,
} from "../scenes/RoomScene/layout";
import {sceneManager, sceneTransitionManager} from "../scenes/sceneStore";
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

/**
 * ワークスペースの置き場所。机(1.6m x 0.8m)は x 13.2〜14.8・z -5.4〜-4.6 を占める。ディレクトリ(中心 (14,1))の山は
 * 束の端まで MOUNTAIN_REACH(4.4m)なので -Z 側は z=-3.4 付近までで、机とは約 1.2m 空く。TestScene の壁(x=8 の壁は x<=8.25)・
 * 球(x<=5)・ダミープレイヤーの歩く円(x<=5.5)とは 5m 以上離れている
 */
const DEV_WORKSPACE_POSITION = [14, 0, -5] as const;

/**
 * キャンバス(イーゼル)の置き場所。足元は x ±0.49・z -0.62〜0.32 を占める。机(x>=13.2)とは 1.2m 以上、
 * ディレクトリ(中心 (14,1))の山(束の端まで 4.4m)とは約 6.5m 離れている
 */
const DEV_CANVAS_POSITION = [11.5, 0, -5] as const;

/**
 * PC の置き場所。ワークスペースの机の天板の上、奥寄り(room の PC_POSITION と同じ関係)。机の上に置くので高さは天板
 */
const DEV_PC_POSITION = [
  DEV_WORKSPACE_POSITION[0],
  DESK_HEIGHT,
  DEV_WORKSPACE_POSITION[2] - 0.3,
] as const;

/** room 以外(test など)のシーンの確認用のオブジェクト(スポーン地点から見て -Z 方向)。PC は机の上に置く */
const spawnTestObjects = () => {
  dummyAuthority.spawnObject([-1.5, 1, -4], "personal");
  dummyAuthority.spawnObject([1.5, 1, -4], "shared");
  dummyAuthority.spawnObject([0, 1, -4], "personal", "unavailable");
  dummyAuthority.spawnDirectory(
    [...DEV_DIRECTORY_POSITION],
    DEV_DIRECTORY_STOCK,
  );
  dummyAuthority.spawnWorkspace([...DEV_WORKSPACE_POSITION]);
  dummyAuthority.spawnCanvas([...DEV_CANVAS_POSITION]);
  dummyAuthority.spawnPc([...DEV_PC_POSITION]);
};

/** room の確認用のオブジェクト。置き場所は scenes/RoomScene/layout(本番ではサーバーが置く) */
const spawnRoomObjects = () => {
  dummyAuthority.spawnDirectory(
    [...DIRECTORY_POSITION],
    DEV_DIRECTORY_STOCK,
    "small",
  );
  dummyAuthority.spawnWorkspace([...WORKSPACE_POSITION]);
  dummyAuthority.spawnCanvas([...CANVAS_POSITION], CANVAS_YAW);
  dummyAuthority.spawnPc([...PC_POSITION]);
};

/**
 * 置いてあるオブジェクトを全部片付けて(id の採番も戻る)、シーンに合わせた確認用のオブジェクトを置き直す。
 * シーンの切り替えのたびに、新しいシーンが描かれる直前に呼ばれる(下の onPrepare)。ベイクページはシーンを切り替えず直接マウントするので、自分で呼ぶ
 */
export const applyDevLayout = (scene: SceneName): void => {
  dummyAuthority.clearObjects();
  if (scene === "room") {
    spawnRoomObjects();
  } else {
    spawnTestObjects();
  }
};

applyDevLayout(sceneManager.getState().current);
// 新しいシーンの commit と同じ同期区間で置き直す(シーンの再描画が 1 回で済み、新しいシーンに前のシーンのオブジェクトが出ない)
sceneTransitionManager.onPrepare(({to}) => applyDevLayout(to));
