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

/** 画面の前へ寄る（離れる）補間の長さ(s) */
const VIEW_SECONDS = 0.5;
/** 画面の中心からカメラまでの距離(m)。16:10 で、お題のメモが画面の端に収まる限界（16:9 でも収まる） */
const VIEW_DISTANCE = 0.36;
/** 電源の立ち上がり・ラスタ展開の速さ（指数減衰の係数。大きいほど速い） */
const POWER_RATE = 5;
const BOOT_RATE = 2.4;
/** これより近づいたら、エンジンの JS を先に取っておく(m)。部屋に入っただけの人には取らせない */
const PREWARM_DISTANCE = 4;
/**
 * ページに着いてから判定するまでの待ち(ms)。読み込みが落ち着く前に本文を読むと、
 * 前のページの内容で判定してしまう
 */
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

  useInteraction(object, pcInteraction);

  const session = usePcSession();
  const using = session.objectId === object.id && session.phase === "active";
  const showing = session.objectId === object.id && session.phase !== "idle";

  const screenRef = useRef<Mesh>(null);
  const memoRef = useRef<Mesh>(null);
  const cursor = useMemo<PcCursor>(() => ({x: 0, y: 0}), []);
  usePcPointer({enabled: using, screen, screenRef, memoRef, cursor});

  /**
   * 常時判定。プレイヤーは何も押さない。ページが着いて落ち着いたら、彼らが勝手に見る。
   * ページの読み取りと判定は非同期なので走らせっぱなしにし、結果は画面の中の通知に出す
   */
  const judge = useJudge();
  const task = useTask();
  const mine = session.objectId === object.id;
  /** 直前に着いた、判定できるページの URL（スタートページは入れない） */
  const currentUrl = useRef("");
  /** 判定済みの URL。同じページを二度見ない */
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
          // 読めなかったページは判定済みにしない（エンジンが起動すれば、次に着いたとき・お題を引き直したときに見る）
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

  /**
   * ページに着いた合図。読み込みが落ち着くまで待ってから見る。
   * 検索結果ページは「開いたサイト」ではないので見ない（検索しただけでは判定しない。
   * 結果を辿って着いたページを見る）
   */
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

  // 表示中のページが変わるたびに、彼らが見る（プレイヤーの操作は要らない）
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

  // お題が引き直されたら、同じページをもう一度見る（お題が変われば答えも変わる）
  useEffect(() => {
    if (!using || !currentUrl.current) {
      return;
    }
    judged.current = null;
    scheduleJudgement(currentUrl.current);
  }, [task, using, scheduleJudgement]);

  // 判定の知らせは、HUD ではなく PC の画面の中（通知の帯）に出す。
  // 画面（BrowserScreen）はシーンで 1 枚を共有するので、他の PC が消さないよう、使っている PC だけが触る
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

  // 判定が「一致」なら、「お題に合っている」の合図（CONFIRM_MS）を見せてから PC を畳む。
  // 合図の間に別のページへ進めば閉じない（検索を続けているので、途中で座席を奪わない）
  useEffect(() => {
    if (!using || judge.status !== "done" || judge.result.verdict !== "match") {
      return;
    }
    const timer = window.setTimeout(() => pcSession.leave(), CONFIRM_MS);
    return () => window.clearTimeout(timer);
  }, [using, judge]);

  // 離れたら判定を畳む（次に使うときは、前の結果と前のページを残さない）
  useEffect(() => {
    if (!using) {
      judgeStore.reset();
      currentUrl.current = "";
      judged.current = null;
      window.clearTimeout(settle.current);
    }
  }, [using]);

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

    // 画面：電源とラスタを、毎フレーム CRT の値へ写す
    crt.time.value += dt;
    crt.on.value = approach(crt.on.value, showing ? 1 : 0, POWER_RATE, dt);
    crt.boot.value = approach(
      crt.boot.value,
      screen.status === "ready" ? 1 : 0,
      BOOT_RATE,
      dt,
    );
    // 近づいたら、エンジンの JS を先に取っておく（初めて使うときの待ちを減らす。ページで 1 回だけ）
    if (
      getEyePosition(localPlayer, eye).distanceTo(
        pcPosition.set(...item.position),
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
