import {PerspectiveCamera, RenderTarget, Vector2} from "three";
import {texture, uniform} from "three/tsl";
import type {WebGPURenderer} from "three/webgpu";

import {attachProxyAO} from "./proxyAO";
import {createProxyScene, type ProxyScene} from "./proxyScene";

type ProxyName = "room" | "sandbox";

const drawingBufferSize = new Vector2();

let renderTarget: RenderTarget | null = null;
const scenes = new Map<ProxyName, ProxyScene>();
const aoReady = new Map<ProxyName, Promise<void>>();
let proxy: ProxyScene | null = null;
let compiling: Promise<void> | null = null;
let activeName: ProxyName | null = null;

const idleTexture = new RenderTarget(1, 1, {depthBuffer: false});
const textureNode = texture(idleTexture.texture);
const blend = uniform(0);
const vcam = new PerspectiveCamera();

const ensureTarget = (renderer: WebGPURenderer): RenderTarget => {
  if (renderTarget === null) {
    renderTarget = new RenderTarget(1, 1, {
      type: renderer.getOutputBufferType(),
      samples: renderer.samples,
      depthBuffer: true,
    });
    textureNode.value = renderTarget.texture;
  }
  return renderTarget;
};

const sceneOf = (name: ProxyName): ProxyScene => {
  let built = scenes.get(name);
  if (built === undefined) {
    built = createProxyScene(name);
    scenes.set(name, built);
    aoReady.set(
      name,
      attachProxyAO(built.scene, name, {eagerAtlas: name === "room"}),
    );
  }
  return built;
};

const releaseTarget = (): void => {
  if (renderTarget === null) {
    return;
  }
  textureNode.value = idleTexture.texture;
  renderTarget.dispose();
  renderTarget = null;
};

const drawTo = (
  renderer: WebGPURenderer,
  target: RenderTarget,
  render: () => void,
): void => {
  const previousTarget = renderer.getRenderTarget();
  const previousMrt = renderer.getMRT();
  renderer.setRenderTarget(target);
  renderer.setMRT(null);
  try {
    render();
  } finally {
    renderer.setRenderTarget(previousTarget);
    renderer.setMRT(previousMrt);
  }
};

const compileAll = async (renderer: WebGPURenderer): Promise<void> => {
  const ownsTarget = renderTarget === null;
  const target = ensureTarget(renderer);
  try {
    for (const name of ["room", "sandbox"] as const) {
      const {scene} = sceneOf(name);
      await aoReady.get(name);
      const previousTarget = renderer.getRenderTarget();
      renderer.setRenderTarget(target);
      let pending: Promise<void>;
      try {
        pending = renderer.compileAsync(scene, vcam);
      } finally {
        renderer.setRenderTarget(previousTarget);
      }
      await pending;
    }
  } finally {
    if (ownsTarget && activeName === null) {
      releaseTarget();
    }
  }
};

export const proxyView = {
  textureNode,
  blend,
  vcam,
  get active(): boolean {
    return activeName !== null;
  },
  activate(scene: ProxyName): void {
    if (activeName === scene && proxy !== null) {
      return;
    }
    proxy = sceneOf(scene);
    activeName = scene;
  },
  deactivate(): void {
    activeName = null;
    blend.value = 0;
    proxy = null;
    releaseTarget();
  },
  render(renderer: WebGPURenderer, camera: PerspectiveCamera): void {
    if (proxy === null) {
      return;
    }
    vcam.fov = camera.fov;
    vcam.aspect = camera.aspect;
    vcam.near = camera.near;
    vcam.far = camera.far;
    vcam.updateProjectionMatrix();
    vcam.updateMatrixWorld(true);

    const target = ensureTarget(renderer);
    renderer.getDrawingBufferSize(drawingBufferSize);
    const width = Math.max(1, drawingBufferSize.x);
    const height = Math.max(1, drawingBufferSize.y);
    if (target.width !== width || target.height !== height) {
      target.setSize(width, height);
    }
    const {scene} = proxy;
    drawTo(renderer, target, () => renderer.render(scene, vcam));
  },
  precompile(renderer: WebGPURenderer): Promise<void> {
    compiling ??= compileAll(renderer).finally(() => {
      compiling = null;
    });
    return compiling;
  },
};

export type ProxyView = typeof proxyView;
