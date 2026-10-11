import {useFrame, useThree} from "@react-three/fiber";
import {useEffect, useRef, useSyncExternalStore} from "react";

import {setOutlineSelection} from "../camera/postprocess/outlineSelection";
import {addPowerOutline} from "../camera/postprocess/powerOutlineSelection";
import {
  armPipelineWatch,
  disarmPipelineWatch,
  installPipelineWatch,
} from "./debug/pipelineWatch";
import {FRAME_PRIORITY} from "./frameOrder";
import {getShaderSwatchBook} from "./shaderSwatches";
import {exposeForWarmup, firstMeshOf} from "./warmupExposure";
import {createWarmupTracker, sceneSignature} from "./warmupTracker";

// 終了の状態はモジュールに置く。Fast Refresh でこのモジュールが再評価されたら、コンポーネント側も一緒にやり直す
let finishing = false;
let done = false;
let holds = 0;
let restartRequested = false;
let waiters: Array<() => void> = [];
const listeners = new Set<() => void>();

const finish = () => {
  done = true;
  if (import.meta.env.DEV) {
    armPipelineWatch();
  }
  for (const l of Array.from(listeners)) {
    l();
  }
  const resolved = waiters;
  waiters = [];
  for (const resolve of resolved) {
    resolve();
  }
};

/**
 * ウォームアップをもう一度走らせ、終わったら解決する(シーンの遷移で、新しいシーンの準備ができた後、覆いを外す前に呼ぶ)。
 * 起動のウォームアップがまだ終わっていなければ、その終わりを待つだけ
 */
export const warmupShaders = (): Promise<void> =>
  new Promise((resolve) => {
    waiters.push(resolve);
    if (finishing && done) {
      finishing = false;
      restartRequested = true;
      disarmPipelineWatch();
    }
  });

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
 * 起動直後、ローディングの裏でシーンの全オブジェクトを描き、ゲームで使う全マテリアルのパイプラインを作らせる。
 * 物が初めて現れたときのコンパイル待ち(シェーダーのスタッター)を避けるため。
 * renderer.compileAsync は視錐台カリングが効くうえ、ポストプロセスの各パス(pre-pass・MSAA の scene pass・アウトライン)と
 * 描画先が違ってキャッシュが当たらないので使わず、実際の描画経路(PostProcess)にそのまま描かせる。
 * パイプラインは物ごとではなく「シェーダーのコード × マテリアルの描画設定 × ジオメトリの属性 × 描画先」で共有されるので、
 * 同じ組み合わせを一度描けば、後から現れる別の物にも当たる。描く物は:
 * - シーンに置かれている物。非表示の物(チュートリアルで現れる机や PC、作業中に降りてくるファイルの紙など)も、
 *   フレームごとに表示を切り替えて描き、描画のあと同じフレームの内に戻す(exposeForWarmup)
 * - 見本帳(shaderSwatches)。操作して初めてマウントされる物(手に持ったアイテム・炎・俯瞰の板)の見本を、ウォームアップの間だけシーンに足す
 * アウトライン(OutlineNode)は選択の有無で非選択の深度パス・選択物のマスクパスを全 mesh に掛けるので、
 * 選択をフレームごとに「シーン全体」と「mesh 1 つ」に切り替えて両方のパスを通す。力の縁取り(2 つ目の OutlineNode)も同じ選択で通す。
 * 構成が WARMUP_STABLE_MS 変わらなくなるまで(holdShaderWarmup の間は待つ)続け、元に戻したあと GPU の処理完了を待ってから終える。
 * シーンの遷移でも、新しいシーンの準備ができた後、覆いを外す前に走らせ直す(warmupShaders。sceneStore が呼ぶ)。
 * 開発時は、終わった後に新しいパイプラインが作られたら警告する(debug/pipelineWatch)
 */
export function ShaderWarmup() {
  const scene = useThree((s) => s.scene);
  const gl = useThree((s) => s.gl);
  const state = useRef<{
    tracker: ReturnType<typeof createWarmupTracker> | null;
    frame: number;
    restoreExposure: (() => void) | null;
    offPower: (() => void) | null;
  }>({tracker: null, frame: 0, restoreExposure: null, offPower: null});

  const restore = () => {
    const s = state.current;
    s.restoreExposure?.();
    s.restoreExposure = null;
    s.offPower?.();
    s.offPower = null;
    if (s.frame > 0) {
      s.frame = 0;
      setOutlineSelection([]);
    }
    const book = getShaderSwatchBook();
    book.parent?.remove(book);
  };

  useEffect(() => {
    if (import.meta.env.DEV) {
      installPipelineWatch(gl as unknown as {backend: object});
    }
  }, [gl]);

  useEffect(() => restore, []);

  useFrame(() => {
    if (finishing) {
      return;
    }
    const s = state.current;
    const now = performance.now();
    if (restartRequested) {
      restartRequested = false;
      s.tracker = null;
    }
    s.tracker ??= createWarmupTracker(now);
    if (!s.tracker.update(sceneSignature(scene), now, holds > 0)) {
      const book = getShaderSwatchBook();
      if (book.parent !== scene) {
        scene.add(book);
      }
      s.restoreExposure = exposeForWarmup(scene);
      s.frame++;
      const target = s.frame % 2 === 0 ? scene : firstMeshOf(scene);
      setOutlineSelection(target ? [target] : []);
      s.offPower?.();
      s.offPower = target
        ? addPowerOutline(target, {ignoreDistance: true})
        : null;
      return;
    }
    finishing = true;
    restore();
    const {device} = (gl as unknown as {backend: {device: DeviceLike}}).backend;
    device.queue.onSubmittedWorkDone().then(finish, finish);
  }, FRAME_PRIORITY.warmup);

  // 描画(PostProcess)のあと、同じフレームの内に表示とカリングを戻す
  useFrame(() => {
    const s = state.current;
    s.restoreExposure?.();
    s.restoreExposure = null;
  }, FRAME_PRIORITY.warmupRestore);

  return null;
}
