import {useFrame} from "@react-three/fiber";
import {useEffect, useMemo} from "react";
import {type Mesh, Vector3} from "three/webgpu";

import {SCREEN} from "../dimensions";
import type {KeyboardCapture} from "./KeyboardCapture";
import type {ScreenSource} from "./types";

type Options = {
  enabled: boolean;
  screen: ScreenSource;
  screenRef: {readonly current: Mesh | null};
  keyboard: KeyboardCapture;
};

export function useImeCaret({
  enabled,
  screen,
  screenRef,
  keyboard,
}: Options): void {
  const point = useMemo(() => new Vector3(), []);

  useEffect(() => {
    if (!enabled) {
      return;
    }
    return () => keyboard.placeCaret(null);
  }, [enabled, keyboard]);

  useFrame(({camera, gl}) => {
    if (!enabled) {
      return;
    }
    const mesh = screenRef.current;
    const caret = screen.caretPoint?.();
    if (!mesh || !caret) {
      keyboard.placeCaret(null);
      return;
    }
    const rect = gl.domElement.getBoundingClientRect();
    camera.updateMatrixWorld();
    const toClient = (x: number, y: number) => {
      point.set(
        (x / screen.width - 0.5) * SCREEN.width,
        (0.5 - y / screen.height) * SCREEN.height,
        0,
      );
      mesh.localToWorld(point).project(camera);
      return {
        x: rect.left + ((point.x + 1) / 2) * rect.width,
        y: rect.top + ((1 - point.y) / 2) * rect.height,
      };
    };
    const top = toClient(caret.x, caret.y);
    const bottom = toClient(caret.x, caret.y + caret.height);
    keyboard.placeCaret({x: top.x, y: top.y, height: bottom.y - top.y});
  });
}
