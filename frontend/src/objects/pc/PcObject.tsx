import {useFrame} from "@react-three/fiber";
import {useCallback, useEffect, useMemo, useRef, useState} from "react";
import {
  type Camera,
  Euler,
  Matrix4,
  type Group,
  type Mesh,
  Quaternion,
  Vector3,
} from "three/webgpu";

import {setSkipGTAO} from "../../camera/postprocess/skipGTAO";
import {useSfxEmitter} from "../../core/audio/sfx/useSfxEmitter";
import {FRAME_PRIORITY} from "../../core/frameOrder";
import {createVirtualCursor} from "../../core/input/virtualCursor";
import {getEyePosition, localPlayer} from "../../player";
import {useInteraction} from "../interaction/useInteraction";
import {useLayoutSlot} from "../layoutContext";
import {useObjectState} from "../objectContext";
import type {GameObject} from "../types";
import {BootScreen} from "./bootScreen";
import {type CrtControls, createCrtMaterial} from "./crtMaterial";
import {SCREEN} from "./dimensions";
import {type PcCursor, useNativePointer} from "./display/useNativePointer";
import {useVirtualPointer} from "./display/useVirtualPointer";
import {pcInteraction} from "./interaction";
import {PcModel} from "./PcModel";
import {
  getPortalMaterial,
  registerPcScreen,
  usePortalScreenId,
} from "./pcScreenRegistry";
import {pcPower, usePcPower} from "./power";
import type {PcProgram} from "./program";
import {programOf} from "./programs";
import {engineKeyboard} from "./search/browser/engineScreen";
import {type PcPhase, pcSession, usePcSession} from "./session";

const VIEW_SECONDS = 0.5;
const VIEW_DISTANCE = 0.36;
const POWER_RATE = 5;
const BOOT_RATE = 2.4;
const POWER_ON_RATE = 1.6;
const POWER_ON_BOOT_RATE = 1.2;
const PREWARM_DISTANCE = 4;

const UP = new Vector3(0, 1, 0);
const eye = new Vector3();
const pcPosition = new Vector3();
const euler = new Euler(0, 0, 0, "YXZ");

const SWIPE_FULL_PX = 30;

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

  const power = usePcPower();
  const root = useRef<Group>(null);
  const sfx = useSfxEmitter(["pcFan", "key", "click", "swipe"], root);
  const {visible} = useObjectState();
  useEffect(() => {
    if (power !== "off" && visible) {
      sfx.play("pcFan");
    } else {
      sfx.stop("pcFan");
    }
  }, [power, visible, sfx]);
  const boot = useBootDisplay(power === "booting");
  const powered = power === "on";

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
  useEffect(() => {
    if (!using) {
      return;
    }
    const keyboard = engineKeyboard();
    keyboard.onKey = () => sfx.play("key");
    return () => {
      keyboard.onKey = undefined;
    };
  }, [using, sfx]);
  const showing =
    powered &&
    (program.alwaysOn === true || (mine && session.phase !== "idle"));

  const screenRef = useRef<Mesh>(null);
  const portalId = usePortalScreenId();
  useEffect(() => {
    const mesh = screenRef.current;
    return mesh ? registerPcScreen(object.id, mesh) : undefined;
  }, [object.id]);

  const onPress = useCallback(
    (phase: "down" | "up") => sfx.play("click", phase),
    [sfx],
  );
  const onMove = useCallback(
    (distance: number) =>
      sfx.play("swipe", Math.min(1, distance / SWIPE_FULL_PX)),
    [sfx],
  );
  const nativeCursor = useMemo<PcCursor>(() => ({x: 0, y: 0}), []);
  useNativePointer({
    enabled: using && powered && session.pointer === "native",
    screen,
    screenRef,
    cursor: nativeCursor,
    onPress,
    onMove,
  });
  const virtualCursor = useMemo(() => createVirtualCursor(), []);
  useVirtualPointer({
    enabled: mine && session.pointer === "virtual",
    using: using && session.pointer === "virtual",
    active: using && powered && session.pointer === "virtual",
    screen,
    screenRef,
    cursor: virtualCursor,
    onLeave: pcSession.leave,
    onPress,
    onMove,
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
    if (boot) {
      const booting = pcPower.get() === "booting";
      boot.crt.time.value += dt;
      boot.crt.on.value = approach(
        boot.crt.on.value,
        booting ? 1 : 0,
        POWER_ON_RATE,
        dt,
      );
      boot.crt.boot.value = approach(
        boot.crt.boot.value,
        booting ? 1 : 0,
        POWER_ON_BOOT_RATE,
        dt,
      );
      if (booting) {
        boot.screen.paint(pcPower.elapsed());
      }
    }
    if (
      getEyePosition(localPlayer, eye).distanceTo(
        pcPosition.set(...item.position),
      ) < PREWARM_DISTANCE
    ) {
      program.prewarm?.();
    }

    if (phase === "idle" && !program.alwaysOn) {
      return;
    }
    screen.tick();
    if (screen.liveSurface || screen.isDirty()) {
      screen.texture.needsUpdate = true;
      screen.clearDirty();
    }
  }, FRAME_PRIORITY.camera);

  return (
    <group ref={root}>
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
            : power === "booting" && boot
              ? boot.crt.material
              : crt.material
        }
        screenRef={screenRef}
      />
    </group>
  );
}

type BootDisplay = {screen: BootScreen; crt: CrtControls};

const useBootDisplay = (booting: boolean): BootDisplay | null => {
  const [boot, setBoot] = useState<BootDisplay | null>(null);
  useEffect(() => {
    if (!booting) {
      return;
    }
    const screen = new BootScreen();
    const crt = createCrtMaterial(screen.texture, screen.width, screen.height);
    setSkipGTAO(crt.material, true);
    setBoot({screen, crt});
    return () => {
      setBoot(null);
      crt.material.dispose();
      screen.dispose();
    };
  }, [booting]);
  return boot;
};

const approach = (
  current: number,
  target: number,
  rate: number,
  dt: number,
): number => current + (target - current) * (1 - Math.exp(-rate * dt));

const easeInOut = (t: number): number =>
  t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;

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
