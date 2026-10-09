import {useFrame} from "@react-three/fiber";
import {useEffect, useMemo, useRef} from "react";
import {Euler, Matrix4, type Mesh, Quaternion, Vector3} from "three/webgpu";

import {setSkipGTAO} from "../../camera/postprocess/skipGTAO";
import {FRAME_PRIORITY} from "../../core/frameOrder";
import {getEyePosition, localPlayer} from "../../player";
import {prewarmEngine} from "../../screen/engine";
import {engineKeyboard, engineScreen} from "../../screen/engineScreen";
import type {GameObject} from "../types";
import {createCrtMaterial} from "./crtMaterial";
import {PcModel} from "./PcModel";
import {type PcPhase, pcSession, usePcSession} from "./session";
import {type PcCursor, usePcPointer} from "./usePcPointer";

/** 画面の前へ寄る（離れる）補間の長さ(s) */
const VIEW_SECONDS = 0.5;
/** 画面の中心からカメラまでの距離(m)。16:10 で、お題のメモが画面の端に収まる限界（16:9 でも収まる） */
const VIEW_DISTANCE = 0.36;
/** 電源の立ち上がり・ラスタ展開の速さ（指数減衰の係数。大きいほど速い） */
const POWER_RATE = 5;
const BOOT_RATE = 2.4;
const CURSOR_RATE = 9;
/** これより近づいたら、エンジンの JS を先に取っておく(m)。部屋に入っただけの人には取らせない */
const PREWARM_DISTANCE = 4;

const UP = new Vector3(0, 1, 0);
const eye = new Vector3();
const pcPosition = new Vector3();
const euler = new Euler(0, 0, 0, "YXZ");

/**
 * PC: 机の上の、Gecko（Firefox のエンジンを wasm にしたもの）の動く画面。
 *
 * 見た目は PcModel（手続き的に組む）。ガラスには、エンジンの canvas をテクスチャとして貼る（CRT の TSL マテリアル）。
 *
 * 操作:
 * - インタラクト（狙って左クリック）で、PC を使い始める（電源が入る。プレイヤーを預かってカメラが画面の前へ寄り、
 *   マウスが画面へ向く）。エンジンは初めて使うときに起動する（数十秒かかる）
 * - 画面の上ではマウスと鍵盤がエンジンへ届く。お題のメモをクリックすると、別のお題を引く
 * - Esc で離れる（カメラが一人称へ戻ってから、プレイヤーを返す）
 *
 * 使っていない間は電源が切れている（画面は黒）。HUD は使わず、状態は画面と机の上のメモで伝える。
 */
export function PcObject({object}: {object: GameObject}) {
  const screen = useMemo(() => engineScreen(), []);
  const keyboard = useMemo(() => engineKeyboard(), []);
  const crt = useMemo(
    () => createCrtMaterial(screen.texture, screen.width, screen.height),
    [screen],
  );
  // 画面の絵はテクスチャの色そのもの。GTAO を掛けるとガラスが暗く濁るので外す
  useEffect(() => {
    setSkipGTAO(crt.material, true);
    return () => crt.material.dispose();
  }, [crt]);

  // 使っている途中で PC が消えたら（オブジェクトが外れたなど）、預かったプレイヤーを返す
  useEffect(
    () => () => {
      if (pcSession.getState().objectId === object.id) {
        pcSession.reset();
      }
    },
    [object.id],
  );

  const session = usePcSession();
  const using = session.objectId === object.id && session.phase === "active";
  const showing = session.objectId === object.id && session.phase !== "idle";

  const screenRef = useRef<Mesh>(null);
  const memoRef = useRef<Mesh>(null);
  const cursor = useMemo<PcCursor>(() => ({x: 0, y: 0, active: false}), []);
  usePcPointer({enabled: using, screen, screenRef, memoRef, cursor});

  // 使っている間は、電源を入れて起動し、キーボードをエンジンへ渡す。離れるとキーボードを返す
  useEffect(() => {
    if (!using) {
      return;
    }
    void screen.boot();
    keyboard.onActiveChange = (active) => {
      // Esc で鍵盤が離れたら、画面から離れる
      if (!active) {
        pcSession.leave();
      }
    };
    keyboard.engage(screen);
    return () => {
      keyboard.onActiveChange = undefined;
      keyboard.disengage();
    };
  }, [using, screen, keyboard]);

  // 使い始め・離れ始めの補間の状態（画面の前へ寄る／一人称へ戻る）
  const drive = useMemo(
    () => ({
      phase: "idle" as PcPhase,
      t: 0,
      from: new Vector3(),
      fromQuat: new Quaternion(),
    }),
    [],
  );

  useFrame(({camera}, dt) => {
    const state = pcSession.getState();
    const phase: PcPhase = state.objectId === object.id ? state.phase : "idle";
    const mesh = screenRef.current;

    if (phase !== drive.phase) {
      drive.phase = phase;
      drive.t = 0;
      drive.from.copy(camera.position);
      drive.fromQuat.copy(camera.quaternion);
    }
    if (phase !== "idle" && mesh) {
      drive.t = Math.min(1, drive.t + dt / VIEW_SECONDS);
      const e = easeInOut(drive.t);
      const target = phase === "active" ? viewPose(mesh) : eyePose();
      camera.position.lerpVectors(drive.from, target.position, e);
      camera.quaternion.slerpQuaternions(drive.fromQuat, target.quaternion, e);
      if (phase === "leaving" && drive.t >= 1) {
        pcSession.finish();
      }
    }

    // 画面：電源、ラスタ、ポインタの目印を、毎フレーム CRT の値へ写す
    crt.time.value += dt;
    crt.on.value = approach(crt.on.value, showing ? 1 : 0, POWER_RATE, dt);
    crt.boot.value = approach(
      crt.boot.value,
      screen.status === "ready" ? 1 : 0,
      BOOT_RATE,
      dt,
    );
    crt.cursor.value.set(cursor.active ? cursor.x : -1, cursor.y);
    crt.cursorOn.value = approach(
      crt.cursorOn.value,
      cursor.active ? 1 : 0,
      CURSOR_RATE,
      dt,
    );

    // 近づいたら、エンジンの JS を先に取っておく（初めて使うときの待ちを減らす。ページで 1 回だけ）
    if (
      getEyePosition(localPlayer, eye).distanceTo(
        pcPosition.set(...object.position),
      ) < PREWARM_DISTANCE
    ) {
      prewarmEngine(location.search);
    }

    // エンジンの画素をテクスチャへ。GPU モードは毎フレーム、それ以外は変わったときだけ読み直す。
    // 画面は全 PC で 1 枚を共有するので、使っている PC だけが進める（電源が切れていれば見えない）
    if (phase === "idle") {
      return;
    }
    screen.tick();
    if (screen.liveSurface || screen.isDirty()) {
      screen.texture.needsUpdate = true;
      screen.clearDirty();
    }
  }, FRAME_PRIORITY.camera);

  return (
    <PcModel
      screen={crt.material}
      screenRef={screenRef}
      memoRef={memoRef}
      on={showing}
    />
  );
}

/** 指数減衰で target へ寄せる（フレーム時間に依らない） */
const approach = (
  current: number,
  target: number,
  rate: number,
  dt: number,
): number => current + (target - current) * (1 - Math.exp(-rate * dt));

const easeInOut = (t: number): number =>
  t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;

/** 画面の正面（ガラスの法線方向）、少し離れた所からガラスの中心を見る姿勢 */
const viewPose = (mesh: Mesh): {position: Vector3; quaternion: Quaternion} => {
  const center = mesh.getWorldPosition(new Vector3());
  const normal = new Vector3(0, 0, 1).applyQuaternion(
    mesh.getWorldQuaternion(new Quaternion()),
  );
  const position = center.addScaledVector(normal, VIEW_DISTANCE);
  const quaternion = new Quaternion().setFromRotationMatrix(
    new Matrix4().lookAt(position, center, UP),
  );
  return {position, quaternion};
};

/** 一人称の目の位置と向き（FirstPersonCamera と同じ向き） */
const eyePose = (): {position: Vector3; quaternion: Quaternion} => {
  const position = getEyePosition(localPlayer, new Vector3());
  const quaternion = new Quaternion().setFromEuler(
    euler.set(localPlayer.pitch, localPlayer.yaw, 0),
  );
  return {position, quaternion};
};
