import {
  type Camera,
  type Intersection,
  type Mesh,
  Raycaster,
  Vector2,
} from "three/webgpu";

export const createPointerPick = (
  canvas: HTMLCanvasElement,
  camera: Camera,
) => {
  const raycaster = new Raycaster();
  const ndc = new Vector2();
  return (
    event: PointerEvent | WheelEvent | MouseEvent,
    target: Mesh | null,
  ): Intersection | null => {
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
};
