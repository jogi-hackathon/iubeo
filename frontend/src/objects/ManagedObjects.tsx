import {type ComponentType, useCallback, useMemo} from "react";
import type {Object3D} from "three";

import {type AOMode, aoModeUserData} from "../bake/aoMode";
import {useIsEnabled, useIsVisible} from "../core/toggles";
import {CanvasObject} from "./canvas/CanvasObject";
import {CANVAS_KIND} from "./canvas/data";
import {DIRECTORY_KIND} from "./directory/data";
import {DirectoryObject} from "./directory/DirectoryObject";
import {DummyObject} from "./DummyObject";
import {OBJECT_ID_KEY, registerTarget} from "./interaction/targets";
import {ObjectStateContext} from "./objectContext";
import {PC_KIND} from "./pc/data";
import {PcObject} from "./pc/PcObject";
import type {GameObject} from "./types";
import {useObjectsState} from "./useObjects";
import {WORKSPACE_KIND} from "./workspace/data";
import {WorkspaceObject} from "./workspace/WorkspaceObject";

/** kind ごとの見た目。ここに無い kind は、ダミーの箱で描く。座標は object.position を原点とした相対 */
const renderers: Record<string, ComponentType<{object: GameObject}>> = {
  [DIRECTORY_KIND]: DirectoryObject,
  [WORKSPACE_KIND]: WorkspaceObject,
  [CANVAS_KIND]: CanvasObject,
  [PC_KIND]: PcObject,
};

/**
 * 見た目の根。狙いの判定(interaction)が、当たった物からオブジェクトを引けるように、id を持たせて登録する。
 * 表示・機能の状態は、種類のコンポーネントが ObjectStateContext から読む
 */
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
  const state = useMemo(() => ({visible, enabled}), [visible, enabled]);
  const Renderer = renderers[object.kind] ?? DummyObject;
  return (
    <group
      ref={register}
      userData={{[OBJECT_ID_KEY]: id, ...aoModeUserData(ao)}}
      position={object.position}
      rotation={[0, object.yaw ?? 0, 0]}
      visible={visible}
    >
      <ObjectStateContext.Provider value={state}>
        <Renderer object={object} />
      </ObjectStateContext.Provider>
    </group>
  );
}

/**
 * objectManager のオブジェクトをシーンに描画する。kind ごとに描画コンポーネントを振り分ける(表の renderers)。
 * 動的に増減するので、ダミーの箱はコライダーにせずベイクAOの対象外(realtime)にする
 * kind ごとに、core/toggles で表示・非表示と機能の ON・OFF を切り替えられる(非表示でも mesh は外さない。非表示は見た目・当たり判定・インタラクトを、機能 OFF はインタラクトだけを無効にする)。
 * (ディレクトリだけは動かないので、専用のコライダーを持ち、AO もベイクする。ワークスペースはモックなのでコライダーを持たない。キャンバスも動かないので、コライダーは持たずに AO だけベイクする)
 */
export function ManagedObjects({ao}: {ao?: AOMode}) {
  const {objects} = useObjectsState();
  return (
    <>
      {objects.map((o) => (
        <ObjectRoot key={o.id} object={o} ao={ao} />
      ))}
    </>
  );
}
