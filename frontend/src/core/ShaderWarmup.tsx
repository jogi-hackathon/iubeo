import {useFrame, useThree} from "@react-three/fiber";
import {useEffect, useRef, useSyncExternalStore} from "react";
import type {Object3D} from "three";

import {setOutlineSelection} from "../camera/postprocess/outlineSelection";
import {addPowerOutline} from "../camera/postprocess/powerOutlineSelection";
import {FRAME_PRIORITY} from "./frameOrder";
import {createWarmupTracker, sceneSignature} from "./warmupTracker";

// 終了の状態はモジュールに置く。Fast Refresh でこのモジュールが再評価されたら、コンポーネント側も一緒にやり直す
let finishing = false;
let done = false;
/** 終わるのを待たせている数(holdShaderWarmup) */
let holds = 0;
const listeners = new Set<() => void>();

const finish = () => {
  done = true;
  for (const l of Array.from(listeners)) {
    l();
  }
};

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};

/** ウォームアップが終わったか。終わるまで Canvas の上にローディングを被せる */
export const useShaderWarmupDone = (): boolean =>
  useSyncExternalStore(subscribe, () => done);

/**
 * マテリアルを後から変える非同期の読み込み(ベイク AO の aoMap など)が、終わるまでウォームアップを待たせる。
 * 戻り値の解除関数は、二重に呼んでも 1 回分しか解除しない。待たせても WARMUP_MAX_MS で打ち切られる
 */
export const holdShaderWarmup = (): (() => void) => {
  holds++;
  let released = false;
  return () => {
    if (released) {
      return;
    }
    released = true;
    holds--;
  };
};

type DeviceLike = {queue: {onSubmittedWorkDone(): Promise<void>}};

/**
 * 起動直後、ローディングの裏でシーンの全 mesh の視錐台カリングを切って描き、表示中のマテリアルのパイプラインを作らせる。
 * 画面外の物が初めて視界に入ったときのコンパイル待ち(シェーダーのスタッター)を避けるため。
 * renderer.compileAsync は視錐台カリングが効くうえ、ポストプロセスの各パス(pre-pass・MSAA の scene pass)と
 * 描画先が違ってキャッシュが当たらないので使わず、実際の描画経路(PostProcess)にそのまま描かせる。
 * アウトライン(OutlineNode)は選択の有無で非選択の深度パス・選択物のマスクパスを全 mesh に掛けるので、
 * 選択をフレームごとに「シーン全体」と「mesh 1 つ」に切り替えて両方のパスを通す。力の縁取り(2 つ目の OutlineNode)も同じ選択で通す。
 * 構成が WARMUP_STABLE_MS 変わらなくなるまで(holdShaderWarmup の間は待つ)続け、元に戻したあと GPU の処理完了を待ってから終える。
 * 操作して初めて現れるマテリアル(手に持ったアイテム、俯瞰ビューなど)やシーン遷移後のマテリアルは対象外
 */
export function ShaderWarmup() {
  const scene = useThree((s) => s.scene);
  const gl = useThree((s) => s.gl);
  const state = useRef<{
    tracker: ReturnType<typeof createWarmupTracker> | null;
    /** カリングを切った mesh(元は frustumCulled=true だったもの) */
    culled: Set<Object3D>;
    frame: number;
    /** ウォームアップで力の縁取りに足した物を外す(足していなければ null) */
    offPower: (() => void) | null;
  }>({tracker: null, culled: new Set(), frame: 0, offPower: null});

  const restore = () => {
    const s = state.current;
    for (const o of s.culled) {
      o.frustumCulled = true;
    }
    s.culled.clear();
    // 力の縁取りは、ウォームアップで足した物だけを外す(他の物が足した物は残す)
    s.offPower?.();
    s.offPower = null;
    // 狙いの選択(Interaction)を消さないよう、ウォームアップで選択を触ったときだけ戻す
    if (s.frame > 0) {
      s.frame = 0;
      setOutlineSelection([]);
    }
  };

  // 途中でアンマウントされても、カリングを切ったまま残さない
  useEffect(() => restore, []);

  // 描画(PostProcess)の直前に切り替える
  useFrame(() => {
    if (finishing) {
      return;
    }
    const s = state.current;
    const now = performance.now();
    s.tracker ??= createWarmupTracker(now);
    if (!s.tracker.update(sceneSignature(scene), now, holds > 0)) {
      let firstMesh: Object3D | null = null;
      scene.traverse((o) => {
        if (firstMesh === null && (o as {isMesh?: boolean}).isMesh) {
          firstMesh = o;
        }
        if (o.frustumCulled) {
          o.frustumCulled = false;
          s.culled.add(o);
        }
      });
      s.frame++;
      const target = s.frame % 2 === 0 ? scene : firstMesh;
      setOutlineSelection(target ? [target] : []);
      s.offPower?.();
      // 距離では薄くしない(シーン全体の原点がカメラから遠くても、パスを通す)
      s.offPower = target
        ? addPowerOutline(target, {ignoreDistance: true})
        : null;
      return;
    }
    finishing = true;
    restore();
    // 直前のフレームまでに積んだパイプラインの生成・描画を待つ
    const {device} = (gl as unknown as {backend: {device: DeviceLike}}).backend;
    device.queue.onSubmittedWorkDone().then(finish, finish);
  }, FRAME_PRIORITY.warmup);

  return null;
}
