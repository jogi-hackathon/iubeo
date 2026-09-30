import {type ComponentType, useCallback} from "react";
import type {Object3D} from "three";

import {aoModeUserData} from "../bake/aoMode";
import {DIRECTORY_KIND} from "./directory/data";
import {DirectoryObject, useOverviewGuard} from "./directory/DirectoryObject";
import {registerDirectoryInteraction} from "./directory/interaction";
import {OBJECT_ID_KEY, registerTarget} from "./interaction/targets";
import type {GameObject} from "./types";
import {useObjectsState} from "./useObjects";

// テスト用のダミー描画。白い世界で見分けがつくよう、状態ごとに色を変える
const COLOR_IDLE = "#5b9bff";
const COLOR_IN_USE = "#ff9f43";
const COLOR_UNAVAILABLE = "#c8c8c8";
const DUMMY_SIZE = 0.6;

const colorOf = (o: GameObject): string => {
  if (o.availability === "unavailable") {
    return COLOR_UNAVAILABLE;
  }
  return o.users.length > 0 ? COLOR_IN_USE : COLOR_IDLE;
};

function DummyObject({object}: {object: GameObject}) {
  return (
    <mesh userData={aoModeUserData("realtime")}>
      <boxGeometry args={[DUMMY_SIZE, DUMMY_SIZE, DUMMY_SIZE]} />
      <meshStandardMaterial color={colorOf(object)} />
    </mesh>
  );
}

/** kind ごとの見た目。ここに無い kind は、ダミーの箱で描く。座標は object.position を原点とした相対 */
const renderers: Record<string, ComponentType<{object: GameObject}>> = {
  [DIRECTORY_KIND]: DirectoryObject,
};

// kind ごとに固有のインタラクトの処理(クライアント側で完結する分)を、汎用のインタラクト基盤に登録する
registerDirectoryInteraction();

/** 見た目の根。狙いの判定(interaction)が、当たった物からオブジェクトを引けるように、id を持たせて登録する */
function ObjectRoot({object}: {object: GameObject}) {
  const {id} = object;
  const register = useCallback(
    (root: Object3D | null) => (root ? registerTarget(id, root) : undefined),
    [id],
  );
  const Renderer = renderers[object.kind] ?? DummyObject;
  return (
    <group
      ref={register}
      userData={{[OBJECT_ID_KEY]: id}}
      position={object.position}
    >
      <Renderer object={object} />
    </group>
  );
}

/**
 * objectManager のオブジェクトをシーンに描画する。kind ごとに描画コンポーネントを振り分ける。
 * 動的に増減するので、ダミーの箱はコライダーにせずベイクAOの対象外(realtime)にする
 * (ディレクトリだけは動かないので、専用のコライダーを持つ)
 */
export function ManagedObjects() {
  const {objects} = useObjectsState();
  useOverviewGuard(objects);
  return (
    <>
      {objects.map((o) => (
        <ObjectRoot key={o.id} object={o} />
      ))}
    </>
  );
}
