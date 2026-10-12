import {useCallback, useEffect, useMemo, useRef} from "react";
import type {Group} from "three";

import {type AOMode, aoModeUserData} from "../bake/aoMode";
import {
  addPowerOutline,
  GUIDE_OUTLINE,
} from "../camera/postprocess/powerOutlineSelection";
import {useIsEnabled, useIsHighlighted, useIsVisible} from "../core/toggles";
import {useIsObjectDisabled} from "./disabledObjects";
import {DummyObject} from "./DummyObject";
import {useIsAimed} from "./interaction/aimStore";
import {OBJECT_ID_KEY, registerTarget} from "./interaction/targets";
import {kindRenderers} from "./kinds";
import {type SceneLayout, matchLayout} from "./layout";
import {type LayoutSlot, LayoutItemContext} from "./layoutContext";
import {ObjectStateContext} from "./objectContext";
import type {GameObject} from "./types";
import {useObjectsState} from "./useObjects";

function ObjectRoot({
  object,
  slot,
  ao,
}: {
  object: GameObject;
  slot: LayoutSlot;
  ao?: AOMode;
}) {
  const {id} = object;
  const {name, item} = slot;
  const visible = useIsVisible(name);
  const highlighted = useIsHighlighted(name);
  const group = useRef<Group>(null);
  const toggledOn = useIsEnabled(name);
  const disabledByKind = useIsObjectDisabled(id);
  const enabled = toggledOn && !disabledByKind;
  const register = useCallback(
    (root: Group | null) => {
      group.current = root;
      return root && enabled ? registerTarget(id, root) : undefined;
    },
    [id, enabled],
  );
  const aimed = useIsAimed(id);
  useEffect(() => {
    const root = group.current;
    if (!highlighted || !visible || !root) {
      return;
    }
    return addPowerOutline(root, {
      ignoreDistance: true,
      ...GUIDE_OUTLINE,
      dashed: !aimed,
    });
  }, [highlighted, visible, aimed]);
  const state = useMemo(() => ({visible, enabled}), [visible, enabled]);
  const Renderer = kindRenderers[object.kind] ?? DummyObject;
  return (
    <group
      ref={register}
      userData={{[OBJECT_ID_KEY]: id, ...aoModeUserData(ao)}}
      position={item.position}
      rotation={[0, item.yaw ?? 0, 0]}
      visible={visible}
    >
      <LayoutItemContext.Provider value={slot}>
        <ObjectStateContext.Provider value={state}>
          <Renderer object={object} />
        </ObjectStateContext.Provider>
      </LayoutItemContext.Provider>
    </group>
  );
}

const warnedIds = new Set<string>();
const UNMATCHED_WARN_DELAY_MS = 300;

export function ManagedObjects({
  layout,
  ao,
}: {
  layout: SceneLayout;
  ao?: AOMode;
}) {
  const {objects} = useObjectsState();
  const {assigned, unmatched} = useMemo(
    () => matchLayout(layout, objects),
    [layout, objects],
  );
  useEffect(() => {
    if (!import.meta.env.DEV || unmatched.length === 0) {
      return;
    }
    const timer = setTimeout(() => {
      for (const o of unmatched) {
        if (!warnedIds.has(o.id)) {
          warnedIds.add(o.id);
          console.warn(`レイアウトに無いオブジェクトは描かない: ${o.id}`);
        }
      }
    }, UNMATCHED_WARN_DELAY_MS);
    return () => clearTimeout(timer);
  }, [unmatched]);
  return (
    <>
      {assigned.map(({object, name, item}) => (
        <ObjectRoot
          key={object.id}
          object={object}
          slot={{name, item}}
          ao={ao}
        />
      ))}
    </>
  );
}
