import {useFrame, useThree} from "@react-three/fiber";
import {useEffect, useMemo, useRef} from "react";
import {type Intersection, type Object3D, Raycaster, Vector2} from "three";

import {type Collider, listColliders, subscribeColliders} from "../../core/bvh";
import {useDebugFlags} from "../../core/debug/flags";
import {FRAME_PRIORITY} from "../../core/frameOrder";
import {usePointerLocked} from "../../core/input";
import {isPlayerControlLocked} from "../../core/playerControl";
import {objectManager} from "../objectStore";
import {useObjectsState} from "../useObjects";
import {type AimHit, INTERACT_DISTANCE, resolveAim} from "./aim";
import {getAimedObjectId, setAimedObjectId, useAimedObjectId} from "./aimStore";
import {dispatchInteraction} from "./handlers";
import {applyOutline} from "./outline";
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
  /** 候補のコライダー mesh → コライダー(enabled を見るため) */
  colliders: Map<Object3D, Collider>;
};

const createCandidates = (): Candidates => ({
  dirty: true,
  objects: [],
  colliders: new Map(),
});

/**
 * 候補は、オブジェクトの根と、それに属さないコライダー mesh(壁など)。
 * コライダーを持つオブジェクト(ディレクトリ)のコライダーは、根の子孫として根と一緒に判定されるので、重複して入れない。
 * 根のツリーを recursive に見るので、その中のコライダーも自分自身(オブジェクト)に当たり、遮蔽物にはならない
 */
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

  // 狙いの候補(オブジェクトの根と、それ以外のコライダー)は、登録が変わったときだけ組み直す
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
    // FirstPersonCamera がこのフレームに書いた位置・向きで狙う(matrixWorld は描画時に更新されるので、ここで更新する)
    camera.updateMatrixWorld();
    raycaster.setFromCamera(CENTER, camera);
    const c = candidates.current;
    refreshCandidates(c);
    hits.current.length = 0;
    raycaster.intersectObjects(c.objects, true, hits.current);
    // 最初の当たりだけを見る。無効なコライダーは、遮蔽物として数えない
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

/** 狙っているオブジェクトに、アウトラインを付ける */
function AimOutline() {
  const aimed = useAimedObjectId();
  // 見た目(インスタンスの数など)が変わったら付け直す
  const {objects} = useObjectsState();

  useEffect(() => {
    const root = aimed === null ? undefined : getTarget(aimed);
    if (!root) {
      return;
    }
    return applyOutline(root);
  }, [aimed, objects]);

  return null;
}
