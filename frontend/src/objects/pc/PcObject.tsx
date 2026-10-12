import {useFrame} from "@react-three/fiber";
import {useEffect, useMemo, useRef} from "react";
import {
  type Camera,
  Euler,
  Matrix4,
  type Mesh,
  Quaternion,
  Vector3,
} from "three/webgpu";

import {setSkipGTAO} from "../../camera/postprocess/skipGTAO";
import {FRAME_PRIORITY} from "../../core/frameOrder";
import {createVirtualCursor} from "../../core/input/virtualCursor";
import {getEyePosition, localPlayer} from "../../player";
import {usePcLogo} from "../../tutorial/pcLogo";
import {useInteraction} from "../interaction/useInteraction";
import {useLayoutSlot} from "../layoutContext";
import type {GameObject} from "../types";
import {createCrtMaterial} from "./crtMaterial";
import {SCREEN} from "./dimensions";
import {type PcCursor, useNativePointer} from "./display/useNativePointer";
import {useVirtualPointer} from "./display/useVirtualPointer";
import {pcInteraction} from "./interaction";
import {createLogoTexture} from "./logoScreen";
import {PcModel} from "./PcModel";
import {
  getPortalMaterial,
  registerPcScreen,
  usePortalScreenId,
} from "./pcScreenRegistry";
import type {PcProgram} from "./program";
import {programOf} from "./programs";
import {type PcPhase, pcSession, usePcSession} from "./session";

const VIEW_SECONDS = 0.5;
const VIEW_DISTANCE = 0.36;
const POWER_RATE = 5;
const BOOT_RATE = 2.4;
const PREWARM_DISTANCE = 4;

const UP = new Vector3(0, 1, 0);
const eye = new Vector3();
const pcPosition = new Vector3();
const euler = new Euler(0, 0, 0, "YXZ");

export function PcObject({object}: {object: GameObject}) {
  const {item} = useLayoutSlot();
  const program = useMemo(() => programOf(item.program), [item.program]);
  const screen = useMemo(() => program.screen(), [program]);
  const crt = useMemo(
    () => createCrtMaterial(screen.texture, screen.width, screen.height),
    [screen],
  );
  useEffect(() => {
    setSkipGTAO(crt.material, true);
    return () => crt.material.dispose();
  }, [crt]);

  const logoOn = usePcLogo();
  const logoTexture = useMemo(() => createLogoTexture(), []);
  const logoCrt = useMemo(
    () =>
      createCrtMaterial(
        logoTexture,
        logoTexture.image.width,
        logoTexture.image.height,
      ),
    [logoTexture],
  );
  useEffect(() => {
    setSkipGTAO(logoCrt.material, true);
    return () => {
      logoCrt.material.dispose();
      logoTexture.dispose();
    };
  }, [logoCrt, logoTexture]);

  useEffect(
    () => () => {
      if (pcSession.getState().objectId === object.id) {
        pcSession.reset();
      }
    },
    [object.id],
  );

  const interaction = useMemo(() => pcInteraction(program.pointer), [program]);
  useInteraction(object, interaction);

  const session = usePcSession();
  const using = session.objectId === object.id && session.phase === "active";
  const mine = session.objectId === object.id;
  const showing = mine && session.phase !== "idle";

  const screenRef = useRef<Mesh>(null);
  const portalId = usePortalScreenId();
  useEffect(() => {
    const mesh = screenRef.current;
    return mesh ? registerPcScreen(object.id, mesh) : undefined;
  }, [object.id]);

  const nativeCursor = useMemo<PcCursor>(() => ({x: 0, y: 0}), []);
  useNativePointer({
    enabled: using && session.pointer === "native",
    screen,
    screenRef,
    cursor: nativeCursor,
  });
  const virtualCursor = useMemo(() => createVirtualCursor(), []);
  useVirtualPointer({
    enabled: mine && session.pointer === "virtual",
    active: using && session.pointer === "virtual",
    screen,
    screenRef,
    cursor: virtualCursor,
    onLeave: pcSession.leave,
  });

  const drive = useMemo(
    () => ({
      phase: "idle" as PcPhase,
      t: 0,
      from: new Vector3(),
      fromQuat: new Quaternion(),
    }),
    [],
  );

  useFrame(({camera, size}, dt) => {
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
      const target =
        phase === "active"
          ? viewPose(mesh, viewDistance(program, camera, size))
          : eyePose();
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
    logoCrt.time.value += dt;
    logoCrt.on.value = approach(
      logoCrt.on.value,
      logoOn ? 1 : 0,
      POWER_RATE,
      dt,
    );
    logoCrt.boot.value = approach(
      logoCrt.boot.value,
      logoOn ? 1 : 0,
      BOOT_RATE,
      dt,
    );
    if (
      getEyePosition(localPlayer, eye).distanceTo(
        pcPosition.set(...item.position),
      ) < PREWARM_DISTANCE
    ) {
      program.prewarm?.();
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
    <>
      <program.Runner
        object={object}
        screen={screen}
        using={using}
        mine={mine}
        screenRef={screenRef}
      />
      <PcModel
        screen={
          portalId === object.id
            ? getPortalMaterial()
            : logoOn && !showing
              ? logoCrt.material
              : crt.material
        }
        screenRef={screenRef}
      />
    </>
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

/** 画面の正面に寄る距離。view.fill があれば、画面が視界のその割合を占める距離(縦と横のきつい方に合わせる) */
const viewDistance = (
  program: PcProgram,
  camera: Camera,
  size: {width: number; height: number},
): number => {
  const fill = program.view?.fill;
  if (!fill || !("fov" in camera) || typeof camera.fov !== "number") {
    return VIEW_DISTANCE;
  }
  const tan = Math.tan((camera.fov * Math.PI) / 360);
  const aspect = size.width / size.height;
  return Math.max(
    SCREEN.height / (2 * tan * fill),
    SCREEN.width / (2 * tan * aspect * fill),
  );
};

const viewPose = (
  mesh: Mesh,
  distance: number,
): {position: Vector3; quaternion: Quaternion} => {
  const center = mesh.getWorldPosition(new Vector3());
  const normal = new Vector3(0, 0, 1).applyQuaternion(
    mesh.getWorldQuaternion(new Quaternion()),
  );
  const position = center.clone().addScaledVector(normal, distance);
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
