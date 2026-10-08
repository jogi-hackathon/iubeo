import {type ComponentType, useCallback, useMemo} from "react";
import type {Object3D} from "three";

import {type AOMode, aoModeUserData} from "../bake/aoMode";
import {useIsEnabled, useIsVisible, useToggleState} from "../core/toggles";
import {CanvasObject} from "./canvas/CanvasObject";
import {CANVAS_KIND} from "./canvas/data";
import {useObjectControlLock} from "./controlLock";
import {DIRECTORY_KIND} from "./directory/data";
import {DirectoryObject, useOverviewGuard} from "./directory/DirectoryObject";
import {registerDirectoryInteraction} from "./directory/interaction";
import {OBJECT_ID_KEY, registerTarget} from "./interaction/targets";
import {PC_KIND} from "./pc/data";
import {PcObject} from "./pc/PcObject";
import type {GameObject} from "./types";
import {useObjectsState} from "./useObjects";
import {WORKSPACE_KIND} from "./workspace/data";
import {WorkspaceObject} from "./workspace/WorkspaceObject";

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
  [WORKSPACE_KIND]: WorkspaceObject,
  [CANVAS_KIND]: CanvasObject,
  [PC_KIND]: PcObject,
};

// kind ごとに固有のインタラクトの処理(クライアント側で完結する分)を、汎用のインタラクト基盤に登録する
registerDirectoryInteraction();

/** 見た目の根。狙いの判定(interaction)が、当たった物からオブジェクトを引けるように、id を持たせて登録する */
function ObjectRoot({object, ao}: {object: GameObject; ao?: AOMode}) {
  const {id} = object;
  const visible = useIsVisible(object.kind);
  const enabled = useIsEnabled(object.kind);
  // 非表示・機能 OFF の間は狙いの対象から外す(登録しない)。mesh は外さず、見た目だけを group の visible で消す
  const register = useCallback(
    (root: Object3D | null) =>
      root && enabled ? registerTarget(id, root) : undefined,
    [id, enabled],
  );
  const Renderer = renderers[object.kind] ?? DummyObject;
  return (
    <group
      ref={register}
      userData={{[OBJECT_ID_KEY]: id, ...aoModeUserData(ao)}}
      position={object.position}
      rotation={[0, object.yaw ?? 0, 0]}
      visible={visible}
    >
      <Renderer object={object} />
    </group>
  );
}

/**
 * objectManager のオブジェクトをシーンに描画する。kind ごとに描画コンポーネントを振り分ける。
 * 動的に増減するので、ダミーの箱はコライダーにせずベイクAOの対象外(realtime)にする
 * kind ごとに、core/toggles で表示・非表示と機能の ON・OFF を切り替えられる(非表示でも mesh は外さない。非表示は見た目・当たり判定・インタラクトを、機能 OFF はインタラクトだけを無効にする)。
 * (ディレクトリだけは動かないので、専用のコライダーを持ち、AO もベイクする。ワークスペースはモックなのでコライダーを持たない。キャンバスも動かないので、コライダーは持たずに AO だけベイクする)
 */
export function ManagedObjects({ao}: {ao?: AOMode}) {
  const {objects} = useObjectsState();
  const {hidden, disabled} = useToggleState();
  // 非表示・機能 OFF のオブジェクトは、俯瞰・作業中のロックの判定では無いものとして扱う(切った時点で俯瞰やロックが外れる)
  const active = useMemo(
    () => objects.filter((o) => !hidden.has(o.kind) && !disabled.has(o.kind)),
    [objects, hidden, disabled],
  );
  useOverviewGuard(active);
  useObjectControlLock(active);
  return (
    <>
      {objects.map((o) => (
        <ObjectRoot key={o.id} object={o} ao={ao} />
      ))}
    </>
  );
}
