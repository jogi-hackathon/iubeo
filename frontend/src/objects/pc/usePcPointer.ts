import {useThree} from "@react-three/fiber";
import {useEffect} from "react";
import {type Mesh, Raycaster, Vector2} from "three/webgpu";

import type {
  CursorKind,
  ScreenModifiers,
  ScreenSource,
} from "../../screen/types";
import {taskStore} from "./task";

/** ガラスの上のポインタ位置（UV）と、いま当たっているか。CRT の目印の描画に使う */
export type PcCursor = {x: number; y: number; active: boolean};

type Options = {
  /** PC を使っている間だけ true。マウスは画面とメモへ向く（ポインタロックは解けている） */
  enabled: boolean;
  screen: ScreenSource;
  screenRef: {readonly current: Mesh | null};
  memoRef: {readonly current: Mesh | null};
  cursor: PcCursor;
};

/**
 * マウスで PC の画面を操作する。R3F の合成イベントではなく canvas に直接 DOM リスナーを付ける
 * （メッシュの外へ出ても持続するポインタキャプチャ、`passive: false` の wheel を使うため）。
 *
 * - 画面の上ではエンジンへ転送する（座標は canvas 画素）。レイキャストの uv は曲面ジオメトリの上の値
 *   なので、そのまま canvas の位置に対応する
 * - お題のメモをクリックすると、別のお題を引く
 */
export function usePcPointer({
  enabled,
  screen,
  screenRef,
  memoRef,
  cursor,
}: Options): void {
  const gl = useThree((s) => s.gl);
  const camera = useThree((s) => s.camera);

  useEffect(() => {
    if (!enabled) {
      return;
    }
    const canvas = gl.domElement;
    const raycaster = new Raycaster();
    const ndc = new Vector2();
    let dragging = false;
    let captured: number | null = null;
    let hovering = false;

    const hitOf = (event: PointerEvent | WheelEvent, target: Mesh | null) => {
      if (!target) {
        return null;
      }
      const rect = canvas.getBoundingClientRect();
      ndc.set(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1,
      );
      camera.updateMatrixWorld();
      raycaster.setFromCamera(ndc, camera);
      const hit = raycaster.intersectObject(target, false)[0];
      return hit?.uv ? hit : null;
    };

    /** 画面の上なら canvas 画素の座標を返す。原点は左上（テクスチャの V は上向き） */
    const screenPick = (event: PointerEvent | WheelEvent) => {
      const hit = hitOf(event, screenRef.current);
      if (!hit?.uv) {
        return null;
      }
      return {
        uv: hit.uv,
        x: hit.uv.x * screen.width,
        y: (1 - hit.uv.y) * screen.height,
      };
    };

    const modifiers = (event: PointerEvent | WheelEvent): ScreenModifiers => ({
      alt: event.altKey,
      ctrl: event.ctrlKey,
      shift: event.shiftKey,
      meta: event.metaKey,
    });

    const setHovering = (next: boolean) => {
      hovering = next;
      if (!next) {
        cursor.active = false;
        canvas.style.cursor = "";
      }
    };

    const onPointerDown = (event: PointerEvent) => {
      if (hitOf(event, memoRef.current)) {
        event.preventDefault();
        taskStore.draw();
        return;
      }
      const pick = screenPick(event);
      if (!pick) {
        return;
      }

      event.preventDefault();
      dragging = true;
      captured = event.pointerId;
      canvas.setPointerCapture(event.pointerId);

      cursor.x = pick.uv.x;
      cursor.y = pick.uv.y;
      cursor.active = true;
      screen.pointer({
        type: "down",
        x: pick.x,
        y: pick.y,
        button: event.button,
        buttons: event.buttons,
        clickCount: event.detail || 1,
        modifiers: modifiers(event),
      });
    };

    const onPointerMove = (event: PointerEvent) => {
      const pick = screenPick(event);
      if (!pick) {
        // ボタンを押している間は直前の有効な座標を使い続ける（レイがガラスから外れてもドラッグを切らない）
        if (!dragging) {
          setHovering(false);
        }
        return;
      }
      hovering = true;
      cursor.x = pick.uv.x;
      cursor.y = pick.uv.y;
      cursor.active = true;
      canvas.style.cursor = cursorCss(screen.cursorKind(pick.x, pick.y));

      screen.pointer({
        type: "move",
        x: pick.x,
        y: pick.y,
        button: -1,
        buttons: event.buttons,
        clickCount: 0,
        modifiers: modifiers(event),
      });
    };

    const onPointerUp = (event: PointerEvent) => {
      if (!dragging || captured !== event.pointerId) {
        return;
      }
      canvas.releasePointerCapture(event.pointerId);
      captured = null;
      dragging = false;
      const pick = screenPick(event);
      screen.pointer({
        type: "up",
        x: pick ? pick.x : cursor.x * screen.width,
        y: pick ? pick.y : (1 - cursor.y) * screen.height,
        button: event.button,
        buttons: event.buttons,
        clickCount: event.detail || 1,
        modifiers: modifiers(event),
      });
    };

    const onWheel = (event: WheelEvent) => {
      const pick = screenPick(event);
      if (!pick) {
        return;
      }
      event.preventDefault();
      screen.wheel(
        event.deltaX,
        event.deltaY,
        pick.x,
        pick.y,
        modifiers(event),
      );
    };

    // 画面の上では、ブラウザの右クリックメニューを出さない（エンジンの中のメニューを使う）
    const onContextMenu = (event: MouseEvent) => {
      if (hovering) {
        event.preventDefault();
      }
    };

    const onPointerLeave = () => setHovering(false);

    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("pointercancel", onPointerUp);
    canvas.addEventListener("pointerleave", onPointerLeave);
    canvas.addEventListener("wheel", onWheel, {passive: false});
    canvas.addEventListener("contextmenu", onContextMenu);

    return () => {
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointercancel", onPointerUp);
      canvas.removeEventListener("pointerleave", onPointerLeave);
      canvas.removeEventListener("wheel", onWheel);
      canvas.removeEventListener("contextmenu", onContextMenu);
      canvas.style.cursor = "";
      cursor.active = false;
    };
  }, [enabled, gl, camera, screen, screenRef, memoRef, cursor]);
}

const cursorCss = (kind: CursorKind): string =>
  kind === "pointer" ? "pointer" : kind === "text" ? "text" : "default";
