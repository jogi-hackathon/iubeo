import {itemManager} from "../items";
import {objectManager, setRequestHandler} from "../objects";
import type {StockFile} from "../objects/directory/data";
import {kindOfId} from "../objects/layout";
import {judgeStore} from "../objects/pc/judge";
import type {ObjectScope} from "../objects/types";
import {LOCAL_PLAYER_ID} from "../player/local";
import type {SceneName} from "../scenes";
import {sceneLayouts} from "../scenes/layouts";
import {sceneManager, sceneTransitionManager} from "../scenes/sceneStore";
import {TEST_SPARE_IDS} from "../scenes/TestScene/layout";
import {createDummyAuthority, type DummyAuthority} from "./dummyAuthority";
import {installSearchDeliverable} from "./searchDeliverable";

/** 開発時のダミーのサーバー役。読み込むと、オブジェクトの要求の送り先として登録され、確認用のオブジェクトを置く */
export const dummyAuthority = createDummyAuthority({
  localPlayerId: LOCAL_PLAYER_ID,
  objects: objectManager,
  items: itemManager,
});

setRequestHandler(dummyAuthority.handle);

/**
 * 在庫(はっきり見分けられる 6 色)。ディレクトリの初期の中身
 */
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

type Spawn = (authority: DummyAuthority, id: string) => void;

/**
 * 初期に置き方を、種類ごとに決める(種類は id の接頭辞。kindOfId)。ここに無い種類(ライターの置き場など)は置かない。
 * ダミーの箱(dummy)はここに無く、下の DUMMY_OBJECTS にある id だけを置く(予備の dummy-4〜8 は初期状態では置かない)
 */
const SPAWN_BY_KIND: Readonly<Record<string, Spawn>> = {
  directory: (a, id) => a.spawnDirectory(id, DEV_DIRECTORY_STOCK),
  workspace: (a, id) => a.spawnWorkspace(id),
  canvas: (a, id) => a.spawnCanvas(id),
  pc: (a, id) => a.spawnPc(id),
};

/** 確認用のダミーの箱(id ごとに scope・使えるか)。test のレイアウトの dummy-1〜3 */
const DUMMY_OBJECTS: Readonly<Record<string, Spawn>> = {
  "dummy-1": (a, id) => a.spawnObject(id, "personal"),
  "dummy-2": (a, id) => a.spawnObject(id, "shared"),
  "dummy-3": (a, id) => a.spawnObject(id, "personal", "unavailable"),
};

const spawnOf = (id: string): Spawn | undefined =>
  DUMMY_OBJECTS[id] ?? SPAWN_BY_KIND[kindOfId(id)];

/**
 * 予備のダミーを、空いている一番若い id(TEST_SPARE_IDS)で置き、その id を返す。全部使われていれば undefined
 * (デバッグパネルの「追加」が使う)
 */
export const spawnSpareObject = (scope: ObjectScope): string | undefined => {
  const taken = new Set(objectManager.getState().objects.map((o) => o.id));
  const id = TEST_SPARE_IDS.find((s) => !taken.has(s));
  return id === undefined ? undefined : dummyAuthority.spawnObject(id, scope);
};

/**
 * 置いてあるオブジェクトを全部片付けて、シーンのレイアウトに合わせて確認用のオブジェクトを置き直す。
 * シーンの切り替えのたびに、新しいシーンが描かれる直前に呼ばれる(下の onPrepare)。ベイクページはシーンを切り替えず直接マウントするので、自分で呼ぶ
 */
export const applyDevLayout = (scene: SceneName): void => {
  dummyAuthority.clearObjects();
  for (const item of Object.values(sceneLayouts[scene])) {
    spawnOf(item.id)?.(dummyAuthority, item.id);
  }
};

applyDevLayout(sceneManager.getState().current);
// 新しいシーンの commit と同じ同期区間で置き直す(シーンの再描画が 1 回で済み、新しいシーンに前のシーンのオブジェクトが出ない)
sceneTransitionManager.onPrepare(({to}) => applyDevLayout(to));

/**
 * Web Search の成果物。Clef の判定が通ったら、その検索を `search_created` のファイルとして手に持たせる
 * (実サーバーが PC の規則を持つまでの写し。キャンバスの image_created と同じ立場)
 */
installSearchDeliverable({
  authority: dummyAuthority,
  judge: judgeStore,
  items: itemManager,
});
