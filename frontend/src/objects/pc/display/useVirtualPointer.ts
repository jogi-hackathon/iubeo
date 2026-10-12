import {useFrame, useThree} from "@react-three/fiber";
import {useEffect} from "react";
import {type Camera, type Mesh, Vector3} from "three/webgpu";

import {FRAME_PRIORITY} from "../../../core/frameOrder";
import {
  consumeLookDelta,
  isPointerLocked,
  usePointerLocked,
} from "../../../core/input";
import type {VirtualCursor} from "../../../core/input/virtualCursor";
import {NO_MODIFIERS, type ScreenModifiers, type ScreenSource} from "./types";

type Options = {
  /** 離れる補間の途中も含む。移動量を取り続け、一人称へ持ち越さない */
  enabled: boolean;
  /** 離れ始めたら false。右クリックと lock 解除を離れる合図として受け取る間 */
  using: boolean;
  /** using の間でも、電源が入っていないなど画面が受け取れないときは false */
  active: boolean;
  screen: ScreenSource;
  screenRef: {readonly current: Mesh | null};
  cursor: VirtualCursor;
  onLeave: () => void;
};

export function useVirtualPointer({
  enabled,
  using,
  active,
  screen,
  screenRef,
  cursor,
  onLeave,
}: Options): void {
  const gl = useThree((s) => s.gl);
  const locked = usePointerLocked();

  useFrame(({camera, size}) => {
    if (!enabled) {
      return;
    }
    const {dx, dy} = consumeLookDelta();
    const mesh = screenRef.current;
    if (!active || !mesh || (dx === 0 && dy === 0)) {
      return;
    }
    if (cursor.move(dx, dy, projectedSize(mesh, camera, size))) {
      screen.pointer({
        type: "move",
        ...toScreen(cursor, screen),
        button: -1,
        buttons: 0,
        clickCount: 0,
        modifiers: NO_MODIFIERS,
      });
    }
  }, FRAME_PRIORITY.player);

  useEffect(() => {
    if (!using) {
      return;
    }
    if (active) {
      screen.pointer({
        type: "move",
        ...toScreen(cursor, screen),
        button: -1,
        buttons: 0,
        clickCount: 0,
        modifiers: NO_MODIFIERS,
      });
    }

    const doc = gl.domElement.ownerDocument;
    // PC を選んだクリックの mouseup だけが届くことがあるので、down を送ったボタンの up だけを送る
    let pressed = 0;

    const onMouseDown = (event: MouseEvent) => {
      if (!isPointerLocked()) {
        return;
      }
      event.preventDefault();
      if (event.button === 2) {
        onLeave();
        return;
      }
      if (!active) {
        return;
      }
      pressed |= 1 << event.button;
      screen.pointer({
        type: "down",
        ...toScreen(cursor, screen),
        button: event.button,
        buttons: event.buttons,
        clickCount: event.detail || 1,
        modifiers: modifiersOf(event),
      });
    };
    const onMouseUp = (event: MouseEvent) => {
      const bit = 1 << event.button;
      if ((pressed & bit) === 0) {
        return;
      }
      pressed &= ~bit;
      screen.pointer({
        type: "up",
        ...toScreen(cursor, screen),
        button: event.button,
        buttons: event.buttons,
        clickCount: event.detail || 1,
        modifiers: modifiersOf(event),
      });
    };
    const onWheel = (event: WheelEvent) => {
      if (!active || !isPointerLocked()) {
        return;
      }
      event.preventDefault();
      const {x, y} = toScreen(cursor, screen);
      screen.wheel(event.deltaX, event.deltaY, x, y, modifiersOf(event));
    };
    const onContextMenu = (event: MouseEvent) => event.preventDefault();

    doc.addEventListener("mousedown", onMouseDown);
    doc.addEventListener("mouseup", onMouseUp);
    doc.addEventListener("wheel", onWheel, {passive: false});
    doc.addEventListener("contextmenu", onContextMenu);
    return () => {
      doc.removeEventListener("mousedown", onMouseDown);
      doc.removeEventListener("mouseup", onMouseUp);
      doc.removeEventListener("wheel", onWheel);
      doc.removeEventListener("contextmenu", onContextMenu);
    };
  }, [using, active, gl, screen, cursor, onLeave]);

  useEffect(() => {
    if (using && !locked) {
      onLeave();
    }
  }, [using, locked, onLeave]);
}

const corner = new Vector3();
const projected: Array<{x: number; y: number}> = [];

const projectedSize = (
  mesh: Mesh,
  camera: Camera,
  size: {width: number; height: number},
): {width: number; height: number} => {
  const geometry = mesh.geometry;
  if (!geometry.boundingBox) {
    geometry.computeBoundingBox();
  }
  const box = geometry.boundingBox;
  if (!box) {
    return size;
  }
  projected.length = 0;
  for (const [x, y] of [
    [box.min.x, box.min.y],
    [box.max.x, box.min.y],
    [box.min.x, box.max.y],
  ] as const) {
    corner.set(x, y, 0);
    mesh.localToWorld(corner).project(camera);
    projected.push({
      x: ((corner.x + 1) / 2) * size.width,
      y: ((1 - corner.y) / 2) * size.height,
    });
  }
  const [origin, right, top] = projected as [
    {x: number; y: number},
    {x: number; y: number},
    {x: number; y: number},
  ];
  const width = Math.hypot(right.x - origin.x, right.y - origin.y);
  const height = Math.hypot(top.x - origin.x, top.y - origin.y);
  return width > 1 && height > 1 ? {width, height} : size;
};

const toScreen = (
  cursor: VirtualCursor,
  screen: ScreenSource,
): {x: number; y: number} => {
  const {x, y} = cursor.get();
  return {
    x: Math.min(screen.width - 1, ((x + 1) / 2) * screen.width),
    y: Math.min(screen.height - 1, ((1 - y) / 2) * screen.height),
  };
};

const modifiersOf = (event: MouseEvent): ScreenModifiers => ({
  alt: event.altKey,
  ctrl: event.ctrlKey,
  shift: event.shiftKey,
  meta: event.metaKey,
});
