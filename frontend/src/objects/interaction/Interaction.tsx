import {useFrame, useThree} from "@react-three/fiber";
import {useEffect, useMemo, useRef} from "react";
import {type Intersection, type Object3D, Raycaster, Vector2} from "three";

import {setOutlineSelection} from "../../camera/postprocess/outlineSelection";
import {type Collider, listColliders, subscribeColliders} from "../../core/bvh";
import {useDebugFlags} from "../../core/debug/flags";
import {FRAME_PRIORITY} from "../../core/frameOrder";
import {usePointerLocked} from "../../core/input";
import {isPlayerControlLocked} from "../../core/playerControl";
import {objectManager} from "../objectStore";
import {type AimHit, INTERACT_DISTANCE, resolveAim} from "./aim";
import {getAimedObjectId, setAimedObjectId, useAimedObjectId} from "./aimStore";
import {dispatchInteraction} from "./handlers";
import {
  getTarget,
  listTargets,
  ownerObjectId,
  subscribeTargets,
} from "./targets";

const CENTER = new Vector2(0, 0);

const isTargetable = (id: string): boolean =>
  objectManager.getObject(id)?.availability === "available";

type Candidates = {
  dirty: boolean;
  objects: Object3D[];
  colliders: Map<Object3D, Collider>;
};

const createCandidates = (): Candidates => ({
  dirty: true,
  objects: [],
  colliders: new Map(),
});

const refreshCandidates = (c: Candidates): void => {
  if (!c.dirty) {
    return;
  }
  c.dirty = false;
  c.objects = listTargets();
  c.colliders.clear();
  for (const collider of listColliders()) {
    c.colliders.set(collider.mesh, collider);
    if (ownerObjectId(collider.mesh) === null) {
      c.objects.push(collider.mesh);
    }
  }
};

/**
 * Canvas に 1 つ置く。画面中央(カメラ前方)から毎フレームレイを飛ばして「狙っている物」を決め、
 * アウトラインでハイライトし、pointer lock 中の左クリックでインタラクトする。
 *
 * - 狙えるのは、目の位置から INTERACT_DISTANCE 内で最初に当たったオブジェクト。壁などのコライダーに遮られたら狙わない
 * - 操作は、pointer lock 中だけ。ロックされていないクリックはロック取得用なので無視する。
 *   freeCamera(F8)中と、別の演出がプレイヤーを預かっている間(俯瞰ビューなど)は、狙いも操作も止める
 */
export function Interaction() {
  const {freeCamera} = useDebugFlags();
  const locked = usePointerLocked();
  const gl = useThree((s) => s.gl);
  const raycaster = useMemo(() => {
    const r = new Raycaster();
    r.far = INTERACT_DISTANCE;
    return r;
  }, []);
  const active = locked && !freeCamera;

  const candidates = useRef(createCandidates());
  useEffect(() => {
    const c = candidates.current;
    const dirty = () => {
      c.dirty = true;
    };
    const offTargets = subscribeTargets(dirty);
    const offColliders = subscribeColliders(dirty);
    return () => {
      offTargets();
      offColliders();
    };
  }, []);
  const hits = useRef<Intersection[]>([]);

  useFrame(({camera}) => {
    if (!active || isPlayerControlLocked()) {
      setAimedObjectId(null);
      return;
    }
    camera.updateMatrixWorld();
    raycaster.setFromCamera(CENTER, camera);
    const c = candidates.current;
    refreshCandidates(c);
    hits.current.length = 0;
    raycaster.intersectObjects(c.objects, true, hits.current);
    const first = hits.current.find(
      (h) => c.colliders.get(h.object)?.enabled !== false,
    );
    const hit: AimHit | null = first
      ? {objectId: ownerObjectId(first.object), distance: first.distance}
      : null;
    setAimedObjectId(resolveAim(hit, {isTargetable}));
  }, FRAME_PRIORITY.interact);

  useEffect(() => {
    if (!active) {
      return;
    }
    const doc = gl.domElement.ownerDocument;
    const onMouseDown = (e: MouseEvent) => {
      if (e.button !== 0 || isPlayerControlLocked()) {
        return;
      }
      const id = getAimedObjectId();
      const object = id === null ? undefined : objectManager.getObject(id);
      if (!object) {
        return;
      }
      dispatchInteraction(object, () => objectManager.interact(object.id));
    };
    doc.addEventListener("mousedown", onMouseDown);
    return () => doc.removeEventListener("mousedown", onMouseDown);
  }, [active, gl]);

  return <AimOutline />;
}

function AimOutline() {
  const aimed = useAimedObjectId();

  useEffect(() => {
    const root = aimed === null ? undefined : getTarget(aimed);
    setOutlineSelection(root ? [root] : []);
    return () => setOutlineSelection([]);
  }, [aimed]);

  return null;
}
