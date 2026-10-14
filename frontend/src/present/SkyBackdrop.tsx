import {Canvas, useFrame, useThree} from "@react-three/fiber";
import {
  Component,
  memo,
  type ReactNode,
  useEffect,
  useLayoutEffect,
  useMemo,
} from "react";
import {Vector2} from "three";
import {screenUV, uniform} from "three/tsl";
import type {WebGPURenderer} from "three/webgpu";

import {
  getPostProcessSettings,
  subscribePostProcessSettings,
} from "../camera/postprocess/settings";
import {createRenderer} from "../core/renderer";
import {createStandaloneSkybox} from "../scenes/environment/skybox";
import {createFrameGate} from "./frameGate";
import {
  pitchForHorizon,
  SKY_EYE_HEIGHT,
  SKY_FOV_DEG,
  SKY_HORIZON_FROM_TOP,
  SKY_WARM_FRAMES,
  SKY_WARM_INTERVAL_MS,
} from "./skyView";

const CAMERA = {
  fov: SKY_FOV_DEG,
  near: 0.1,
  far: 2000,
  position: [0, SKY_EYE_HEIGHT, 0] as [number, number, number],
};

function SkyScene({active}: {active: boolean}) {
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  const invalidate = useThree((s) => s.invalidate);
  const {skybox, size} = useMemo(() => {
    const size = uniform(new Vector2(1, 1));
    const skybox = createStandaloneSkybox({
      size,
      pixel: screenUV.mul(size),
    });
    return {skybox, size};
  }, []);

  useLayoutEffect(() => {
    camera.rotation.set(
      pitchForHorizon(SKY_FOV_DEG, SKY_HORIZON_FROM_TOP),
      0,
      0,
    );
    camera.updateMatrixWorld();
  }, [camera]);

  useEffect(() => {
    skybox.apply(getPostProcessSettings());
    const unsubscribe = subscribePostProcessSettings(() =>
      skybox.apply(getPostProcessSettings()),
    );
    scene.backgroundNode = skybox.node;
    return () => {
      unsubscribe();
      scene.backgroundNode = null;
    };
  }, [scene, skybox]);

  useEffect(() => {
    let left = SKY_WARM_FRAMES;
    const id = window.setInterval(() => {
      invalidate();
      left -= 1;
      if (left <= 0) {
        window.clearInterval(id);
      }
    }, SKY_WARM_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [invalidate]);

  useEffect(() => {
    if (!active) {
      return;
    }
    const open = createFrameGate();
    let id = requestAnimationFrame(function loop(now) {
      if (open(now)) {
        invalidate();
      }
      id = requestAnimationFrame(loop);
    });
    return () => cancelAnimationFrame(id);
  }, [active, invalidate]);

  useFrame(({gl, camera}) => {
    gl.getDrawingBufferSize(size.value);
    camera.updateMatrixWorld();
    skybox.update(gl as unknown as WebGPURenderer, camera);
  });

  return null;
}

class CanvasBoundary extends Component<
  {onFailed: () => void; children: ReactNode},
  {failed: boolean}
> {
  state = {failed: false};

  static getDerivedStateFromError() {
    return {failed: true};
  }

  componentDidCatch(error: Error) {
    console.warn("present sky backdrop unavailable", error);
    this.props.onFailed();
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}

export const SkyBackdrop = memo(function SkyBackdrop({
  active,
  onFailed,
}: {
  active: boolean;
  onFailed: () => void;
}) {
  return (
    <CanvasBoundary onFailed={onFailed}>
      <Canvas
        className="present-sky-canvas"
        flat
        frameloop="demand"
        gl={createRenderer}
        dpr={1}
        camera={CAMERA}
      >
        <SkyScene active={active} />
      </Canvas>
    </CanvasBoundary>
  );
});
