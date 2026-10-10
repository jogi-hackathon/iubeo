import {useFrame} from "@react-three/fiber";
import {useCallback, useEffect, useMemo, useRef} from "react";
import {Euler, Matrix4, type Mesh, Quaternion, Vector3} from "three/webgpu";

import {setSkipGTAO} from "../../camera/postprocess/skipGTAO";
import {FRAME_PRIORITY} from "../../core/frameOrder";
import {getEyePosition, localPlayer} from "../../player";
import {isSearchResultsUrl} from "../../screen/browserChrome";
import {prewarmEngine} from "../../screen/engine";
import {engineKeyboard, engineScreen} from "../../screen/engineScreen";
import {useInteraction} from "../interaction/useInteraction";
import {useLayoutSlot} from "../layoutContext";
import type {GameObject} from "../types";
import {createCrtMaterial} from "./crtMaterial";
import {pcInteraction} from "./interaction";
import {CONFIRM_MS, judgeAnnouncement, judgeStore, useJudge} from "./judge";
import {PcModel} from "./PcModel";
import {type PcPhase, pcSession, usePcSession} from "./session";
import {taskStore, useTask} from "./task";
import {type PcCursor, usePcPointer} from "./usePcPointer";

const VIEW_SECONDS = 0.5;
const VIEW_DISTANCE = 0.36;
const POWER_RATE = 5;
const BOOT_RATE = 2.4;
const PREWARM_DISTANCE = 4;
const JUDGE_SETTLE_MS = 1200;

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
 * - Web Search の判定（お題にふさわしい検索ができているか）は、**プレイヤーの操作ではなく、
 *   結果を辿ってページが変わるたびに走る**（検索結果ページそのものは見ない）。
 *   彼らは常に見ていて、外れているときだけ CRT が乱れて理由を出す（合っていれば一言だけ）。HUD は使わない
 * - 判定が「一致」なら、合図を見せてから PC を畳む（成果物は持たせ済み）。タスクが済んだので座らせない
 * - Esc で離れる（カメラが一人称へ戻り、プレイヤーを返し、マウスルック（pointer lock）も取り直す。
 *   画面から抜けた直後にクリックを求めない）
 *
 * 使っていない間は電源が切れている（画面は黒）。HUD は使わず、状態は画面と机の上のメモで伝える。
 */
export function PcObject({object}: {object: GameObject}) {
  const {item} = useLayoutSlot();
  const screen = useMemo(() => engineScreen(), []);
  const keyboard = useMemo(() => engineKeyboard(), []);
  const crt = useMemo(
    () => createCrtMaterial(screen.texture, screen.width, screen.height),
    [screen],
  );
  useEffect(() => {
    setSkipGTAO(crt.material, true);
    return () => crt.material.dispose();
  }, [crt]);

  useEffect(
    () => () => {
      if (pcSession.getState().objectId === object.id) {
        pcSession.reset();
      }
    },
    [object.id],
  );

  useInteraction(object, pcInteraction);

  const session = usePcSession();
  const using = session.objectId === object.id && session.phase === "active";
  const showing = session.objectId === object.id && session.phase !== "idle";

  const screenRef = useRef<Mesh>(null);
  const memoRef = useRef<Mesh>(null);
  const cursor = useMemo<PcCursor>(() => ({x: 0, y: 0}), []);
  usePcPointer({enabled: using, screen, screenRef, memoRef, cursor});

  const judge = useJudge();
  const task = useTask();
  const mine = session.objectId === object.id;
  const currentUrl = useRef("");
  const judged = useRef<string | null>(null);
  const settle = useRef<number | undefined>(undefined);

  const judgeNow = useCallback(
    (url: string) => {
      window.clearTimeout(settle.current);
      settle.current = undefined;
      if (!url || url.startsWith("data:") || judged.current === url) {
        return;
      }
      judged.current = url;
      void (async () => {
        const currentTask = taskStore.getTask();
        const page = await screen.readPage?.();
        if (!page) {
          if (judged.current === url) {
            judged.current = null;
          }
          judgeStore.fail(
            currentTask,
            url,
            "今のページを読めません（エンジンが起動していない）",
          );
          return;
        }
        await judgeStore.run({task: currentTask, page});
      })();
    },
    [screen],
  );

  const scheduleJudgement = useCallback(
    (url: string) => {
      window.clearTimeout(settle.current);
      if (!url || url.startsWith("data:") || isSearchResultsUrl(url)) {
        return;
      }
      currentUrl.current = url;
      settle.current = window.setTimeout(() => judgeNow(url), JUDGE_SETTLE_MS);
    },
    [judgeNow],
  );

  useEffect(() => {
    if (!using) {
      return;
    }
    screen.onPageChange = scheduleJudgement;
    return () => {
      screen.onPageChange = undefined;
      window.clearTimeout(settle.current);
    };
  }, [using, screen, scheduleJudgement]);

  useEffect(() => {
    if (!using || !currentUrl.current) {
      return;
    }
    judged.current = null;
    scheduleJudgement(currentUrl.current);
  }, [task, using, scheduleJudgement]);

  useEffect(() => {
    if (!mine) {
      return;
    }
    const announcement = using ? judgeAnnouncement(judge) : null;
    screen.setNotice?.(announcement?.lines ?? null, announcement?.tear);
    if (!announcement) {
      return;
    }
    const timer = window.setTimeout(
      () => screen.setNotice?.(null),
      announcement.ms,
    );
    return () => window.clearTimeout(timer);
  }, [screen, mine, using, judge]);
  useEffect(
    () => () => {
      if (mine) {
        screen.setNotice?.(null);
      }
    },
    [screen, mine],
  );

  useEffect(() => {
    if (!using || judge.status !== "done" || judge.result.verdict !== "match") {
      return;
    }
    const timer = window.setTimeout(() => pcSession.leave(), CONFIRM_MS);
    return () => window.clearTimeout(timer);
  }, [using, judge]);

  useEffect(() => {
    if (!using) {
      judgeStore.reset();
      currentUrl.current = "";
      judged.current = null;
      window.clearTimeout(settle.current);
    }
  }, [using]);

  useEffect(() => {
    if (!using) {
      return;
    }
    void screen.boot();
    keyboard.onActiveChange = (active) => {
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

    crt.time.value += dt;
    crt.on.value = approach(crt.on.value, showing ? 1 : 0, POWER_RATE, dt);
    crt.boot.value = approach(
      crt.boot.value,
      screen.status === "ready" ? 1 : 0,
      BOOT_RATE,
      dt,
    );
    if (
      getEyePosition(localPlayer, eye).distanceTo(
        pcPosition.set(...item.position),
      ) < PREWARM_DISTANCE
    ) {
      prewarmEngine(location.search);
    }

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

const approach = (
  current: number,
  target: number,
  rate: number,
  dt: number,
): number => current + (target - current) * (1 - Math.exp(-rate * dt));

const easeInOut = (t: number): number =>
  t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;

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

const eyePose = (): {position: Vector3; quaternion: Quaternion} => {
  const position = getEyePosition(localPlayer, new Vector3());
  const quaternion = new Quaternion().setFromEuler(
    euler.set(localPlayer.pitch, localPlayer.yaw, 0),
  );
  return {position, quaternion};
};
