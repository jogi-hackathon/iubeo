import {
  Euler,
  type Matrix4,
  type PerspectiveCamera,
  Quaternion,
  Vector3,
} from "three";

import {authorityRegistry} from "../../authority/registry";
import {cameraGlitch} from "../../camera/postprocess";
import {getPostProcessSettings} from "../../camera/postprocess/settings";
import {sfxEngine} from "../../core/audio/sfx/engine";
import {resumePointerLock} from "../../core/input/pointerLock";
import {warmupShaders} from "../../core/ShaderWarmup";
import {getPcScreen, setPortalScreen} from "../../objects/pc/pcScreenRegistry";
import {localPlayer, playerManager} from "../../player";
import {spawnOf} from "../../scenes";
import type {SceneName} from "../../scenes";
import {sandboxSpawnOf} from "../../scenes/SandboxScene/layout";
import {whenSceneReady} from "../../scenes/sceneReady";
import {setDiveStyle} from "../../scenes/sceneStore";
import type {DiveTransitionStyle} from "../../scenes/styledTransition";
import {anchorFrame, coverDistance, entryDistance, poseAt} from "./divePath";
import {
  createDiveMachine,
  type DiveMachine,
  returnDurationOf,
} from "./diveStore";
import {portalCrt} from "./portalMaterial";
import {prefetchProxyAtlas} from "./proxyPrefetch";
import {proxyView} from "./proxyView";

const ENTRY_DISTANCE = 0.36;
const ANCHOR_LENGTH = 0;
const GLITCH_MS = 300;
const NEAR_MARGIN = 1.3;
const SMALL_NEAR = 0.01;

type ProxyName = "room" | "sandbox";

type Pose = {position: Vector3; quaternion: Quaternion};

type DiveSession = {
  machine: DiveMachine;
  screen: Matrix4;
  anchor: Matrix4;
  realAnchor: Matrix4 | null;
  returnFrom: Pose | null;
  proxy: ProxyName;
  fromPosition: Vector3;
  fromQuaternion: Quaternion;
  viewPose: Pose;
  /** 飛び込み始める距離(divePath の entryDistance) */
  entry: number;
  restoreNear: number | null;
  ready: boolean;
  portalResolved: boolean;
  resolvePortal: () => void;
  resolveFinish: () => void;
  finished: Promise<void>;
};

let camera: PerspectiveCamera | null = null;
let session: DiveSession | null = null;

const euler = new Euler(0, 0, 0, "YXZ");
const pose: Pose = {position: new Vector3(), quaternion: new Quaternion()};
const eyeQuaternion = new Quaternion();
const eyePosition = new Vector3();

const isProxyName = (scene: SceneName): scene is ProxyName =>
  scene === "room" || scene === "sandbox";

const mySeat = (): number | undefined => {
  const id = authorityRegistry.current()?.playerId;
  return id ? playerManager.getPlayer(id)?.seat : undefined;
};

const myPcId = (from: SceneName): string | null => {
  if (from === "room") {
    return "pc-1";
  }
  const seat = mySeat();
  return seat === undefined ? null : `pc-${seat}`;
};

const realAnchorOf = (s: DiveSession): Matrix4 => {
  if (s.realAnchor === null) {
    const seat = s.proxy === "sandbox" ? mySeat() : undefined;
    if (seat === undefined) {
      s.realAnchor = s.anchor;
    } else {
      const {position, yaw} = sandboxSpawnOf(seat);
      s.realAnchor = anchorFrame(new Vector3(...position), yaw, ANCHOR_LENGTH);
    }
  }
  return s.realAnchor;
};

const updateEyePose = (): void => {
  poseAt(anchorFrame(localPlayer.position, localPlayer.yaw, 0), 0, pose);
  eyePosition.copy(pose.position);
  eyeQuaternion.setFromEuler(euler.set(localPlayer.pitch, localPlayer.yaw, 0));
};

const returnDurationFor = (s: DiveSession): number => {
  poseAt(realAnchorOf(s), -ANCHOR_LENGTH, pose);
  const from = pose.position.clone();
  const fromQuaternion = pose.quaternion.clone();
  updateEyePose();
  return returnDurationOf(
    from.distanceTo(eyePosition),
    (fromQuaternion.angleTo(eyeQuaternion) * 180) / Math.PI,
  );
};

const anchorOf = (scene: SceneName): Matrix4 => {
  const {position, yaw} = spawnOf(scene);
  return anchorFrame(new Vector3(...position), yaw, ANCHOR_LENGTH);
};

export const isDiving = (): boolean => session !== null;

export const attachDiveCamera = (next: PerspectiveCamera | null): void => {
  camera = next;
  if (next === null) {
    abortDive();
  }
};

const finishDive = (s: DiveSession): void => {
  if (camera && s.restoreNear !== null) {
    camera.near = s.restoreNear;
    camera.updateProjectionMatrix();
  }
  proxyView.deactivate();
  setPortalScreen(null);
  session = null;
  s.resolvePortal();
  s.resolveFinish();
};

const abortDive = (): void => {
  if (session) {
    finishDive(session);
  }
};

const canRun = ({from, to}: {from: SceneName; to: SceneName}): boolean => {
  if (
    camera === null ||
    session !== null ||
    from === to ||
    !getPostProcessSettings().enabled
  ) {
    return false;
  }
  if (!isProxyName(from) || !isProxyName(to)) {
    return false;
  }
  const id = myPcId(from);
  return id !== null && getPcScreen(id) !== undefined;
};

const startDive = (from: SceneName, to: ProxyName): Promise<void> => {
  const cam = camera;
  const id = myPcId(from);
  const mesh = id ? getPcScreen(id) : undefined;
  if (!cam || !mesh) {
    throw new Error("ダイブの画面が見つかりません");
  }
  sfxEngine.them("dive");
  mesh.updateWorldMatrix(true, false);
  const screen = mesh.matrixWorld.clone();
  const anchor = anchorOf(to);
  const dCover = coverDistance(cam.fov, cam.aspect);
  const entry = entryDistance(screen, cam.position, ENTRY_DISTANCE, dCover);
  const view: Pose = {position: new Vector3(), quaternion: new Quaternion()};
  poseAt(screen, entry, view);

  let restoreNear: number | null = null;
  if (dCover < NEAR_MARGIN * cam.near) {
    restoreNear = cam.near;
    cam.near = SMALL_NEAR;
    cam.updateProjectionMatrix();
  }

  const machine = createDiveMachine({dCover, L: ANCHOR_LENGTH, dStart: entry});
  machine.start({
    flyDistance: cam.position.distanceTo(view.position),
    flyAngleDeg: (cam.quaternion.angleTo(view.quaternion) * 180) / Math.PI,
  });

  let resolvePortal = () => {};
  let resolveFinish = () => {};
  const portal = new Promise<void>((resolve) => {
    resolvePortal = resolve;
  });
  const finished = new Promise<void>((resolve) => {
    resolveFinish = resolve;
  });
  session = {
    machine,
    screen,
    anchor,
    realAnchor: null,
    returnFrom: null,
    proxy: to,
    fromPosition: cam.position.clone(),
    fromQuaternion: cam.quaternion.clone(),
    viewPose: view,
    entry,
    restoreNear,
    ready: false,
    portalResolved: false,
    resolvePortal,
    resolveFinish,
    finished,
  };
  portalCrt.on.value = 0;
  portalCrt.boot.value = 0;
  portalCrt.strength.value = 1;
  prefetchProxyAtlas(to);
  proxyView.activate(to);
  setPortalScreen(id);
  return portal;
};

export const tickDive = (dt: number): void => {
  const s = session;
  const cam = camera;
  if (!s || !cam) {
    return;
  }
  const f = s.machine.step(dt, {
    ready: s.ready,
    returnDuration:
      s.machine.phase === "switch" ? returnDurationFor(s) : undefined,
  });
  proxyView.blend.value = f.blend;
  portalCrt.on.value = f.on;
  portalCrt.boot.value = f.boot;
  portalCrt.strength.value = f.crt;
  portalCrt.time.value += dt;
  if (f.glitch) {
    cameraGlitch.pulse(GLITCH_MS);
  }

  const vcam = proxyView.vcam;
  if (f.phase === "fly") {
    poseAt(s.anchor, s.entry, pose);
    vcam.position.copy(pose.position);
    vcam.quaternion.copy(pose.quaternion);
    cam.position.lerpVectors(s.fromPosition, s.viewPose.position, f.flyT);
    cam.quaternion.slerpQuaternions(
      s.fromQuaternion,
      s.viewPose.quaternion,
      f.flyT,
    );
  } else if (f.phase === "dive" || f.phase === "portal") {
    poseAt(s.anchor, f.d, pose);
    vcam.position.copy(pose.position);
    vcam.quaternion.copy(pose.quaternion);
    poseAt(s.screen, f.d, pose);
    cam.position.copy(pose.position);
    cam.quaternion.copy(pose.quaternion);
  } else if (f.phase === "switch" && !f.done) {
    poseAt(s.anchor, f.d, pose);
    vcam.position.copy(pose.position);
    vcam.quaternion.copy(pose.quaternion);
    poseAt(realAnchorOf(s), f.d, pose);
    cam.position.copy(pose.position);
    cam.quaternion.copy(pose.quaternion);
  } else {
    if (proxyView.active) {
      proxyView.deactivate();
    }
    if (s.returnFrom === null) {
      poseAt(realAnchorOf(s), -ANCHOR_LENGTH, pose);
      s.returnFrom = {
        position: pose.position.clone(),
        quaternion: pose.quaternion.clone(),
      };
    }
    updateEyePose();
    const t = f.done ? 1 : f.returnT;
    cam.position.lerpVectors(s.returnFrom.position, eyePosition, t);
    cam.quaternion.slerpQuaternions(s.returnFrom.quaternion, eyeQuaternion, t);
  }

  if (f.portalReached && !s.portalResolved) {
    s.portalResolved = true;
    setPortalScreen(null);
    s.resolvePortal();
  }
  if (f.done) {
    finishDive(s);
    resumePointerLock();
  }
};

export const diveStyle: DiveTransitionStyle = {
  canRun,
  run: ({from, to}) => startDive(from, to as ProxyName),
  waitReady: async (scene) => {
    await whenSceneReady(scene).then(warmupShaders);
    if (session) {
      session.ready = true;
    }
  },
  finish: () => session?.finished ?? Promise.resolve(),
};

export const registerDiveStyle = (): (() => void) => {
  setDiveStyle(diveStyle);
  return () => {
    setDiveStyle(null);
    abortDive();
  };
};
