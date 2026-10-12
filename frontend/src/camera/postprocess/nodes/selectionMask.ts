import {Fn, rtt, screenUV, step, texture, uniform, vec4} from "three/tsl";
import {
  type Camera,
  DepthTexture,
  FloatType,
  type Node,
  type NodeBuilder,
  type NodeFrame,
  NodeMaterial,
  NodeUpdateType,
  type Object3D,
  type Renderer,
  RendererUtils,
  RenderTarget,
  type Scene,
  TempNode,
  type TextureNode,
  Vector2,
} from "three/webgpu";

export type SelectionRoots = {
  aim: readonly Object3D[];
  power: readonly Object3D[];
};

const DEPTH_EPSILON = 1e-6;

const _size = new Vector2();

const createMaskMaterial = (caches: {
  aim: Set<Object3D>;
  power: Set<Object3D>;
}) => {
  const flag = (set: Set<Object3D>) =>
    uniform(0).onObjectUpdate(({object}) =>
      object !== null && set.has(object) ? 1 : 0,
    );
  const m = new NodeMaterial();
  m.name = "SelectionMask";
  m.colorNode = vec4(flag(caches.aim), flag(caches.power), 0, 1);
  m.fog = false;
  return m;
};

class SelectionMaskNode extends TempNode<"vec4"> {
  static get type(): string {
    return "SelectionMaskNode";
  }

  private readonly renderTarget: RenderTarget;
  private readonly maskNode: TextureNode;
  private readonly depthNode: TextureNode;
  private readonly material: NodeMaterial;
  private readonly caches = {
    aim: new Set<Object3D>(),
    power: new Set<Object3D>(),
  };
  private rendererState: RendererUtils.RendererState | null = null;
  private sceneState: RendererUtils.SceneState | null = null;
  private lastCount = 0;
  private resolutionScale = 1;

  constructor(
    private readonly scene: Scene,
    private readonly camera: Camera,
    private readonly roots: SelectionRoots,
    private readonly sceneDepth: TextureNode,
  ) {
    super("vec4");
    const depthTexture = new DepthTexture(1, 1);
    depthTexture.type = FloatType;
    this.renderTarget = new RenderTarget(1, 1, {depthTexture, samples: 0});
    this.renderTarget.texture.name = "SelectionMask";
    this.maskNode = texture(this.renderTarget.texture);
    this.depthNode = texture(depthTexture);
    this.material = createMaskMaterial(this.caches);
    this.updateBeforeType = NodeUpdateType.FRAME;
  }

  setResolutionScale(scale: number): void {
    this.resolutionScale = scale;
  }

  private collect(): number {
    const {aim, power} = this.caches;
    aim.clear();
    power.clear();
    for (const root of this.roots.aim) {
      root.traverse((o) => aim.add(o));
    }
    for (const root of this.roots.power) {
      root.traverse((o) => power.add(o));
    }
    return aim.size + power.size;
  }

  override updateBefore(frame: NodeFrame): undefined {
    const renderer = frame.renderer as Renderer;
    const {scene, camera, renderTarget} = this;
    const count = this.collect();
    if (count === 0) {
      if (this.lastCount > 0) {
        this.lastCount = 0;
        this.rendererState = RendererUtils.resetRendererState(
          renderer,
          (this.rendererState ?? undefined) as RendererUtils.RendererState,
        );
        renderer.setRenderTarget(renderTarget);
        renderer.setClearColor(0x000000, 0);
        renderer.clear();
        RendererUtils.restoreRendererState(renderer, this.rendererState);
      }
      return;
    }
    this.lastCount = count;

    this.rendererState = RendererUtils.resetRendererState(
      renderer,
      (this.rendererState ?? undefined) as RendererUtils.RendererState,
    );
    this.sceneState = RendererUtils.resetSceneState(
      scene,
      (this.sceneState ?? undefined) as RendererUtils.SceneState,
    );

    renderer.getDrawingBufferSize(_size);
    renderTarget.setSize(
      Math.floor(_size.x * this.resolutionScale),
      Math.floor(_size.y * this.resolutionScale),
    );
    renderer.setRenderTarget(renderTarget);
    renderer.setClearColor(0x000000, 0);
    renderer.autoClear = true;
    const {aim, power} = this.caches;
    const {material} = this;
    renderer.setRenderObjectFunction(
      (object, scene, camera, geometry, _material, group, lightsNode, clip) => {
        if (
          (!aim.has(object) && !power.has(object)) ||
          (object as {isSprite?: boolean}).isSprite
        ) {
          return;
        }
        renderer.renderObject(
          object,
          scene,
          camera,
          geometry,
          material,
          group,
          lightsNode,
          clip,
        );
      },
    );
    renderer.render(scene, camera);

    RendererUtils.restoreSceneState(scene, this.sceneState);
    RendererUtils.restoreRendererState(renderer, this.rendererState);
  }

  override setup(builder: NodeBuilder): Node<"vec4"> {
    const reversed =
      (builder.renderer as unknown as {reversedDepthBuffer?: boolean})
        .reversedDepthBuffer === true;
    return Fn(() => {
      const mask = this.maskNode.sample(screenUV);
      const maskDepth = this.depthNode.sample(screenUV).r;
      const sceneDepth = this.sceneDepth.sample(screenUV).r;
      const visible = reversed
        ? step(sceneDepth.sub(DEPTH_EPSILON), maskDepth)
        : step(maskDepth, sceneDepth.add(DEPTH_EPSILON));
      return vec4(mask.r.mul(visible), mask.g.mul(visible), mask.r, mask.g);
    })();
  }

  override dispose(): void {
    super.dispose();
    this.renderTarget.dispose();
    this.material.dispose();
  }
}

export const createSelectionMask = (
  scene: Scene,
  camera: Camera,
  roots: SelectionRoots,
  sceneDepth: TextureNode,
) => {
  const node = new SelectionMaskNode(scene, camera, roots, sceneDepth);
  const visible = rtt(node);
  return {
    visible,
    setRenderScale: (scale: number): void => {
      node.setResolutionScale(scale);
      visible.setResolutionScale(scale);
    },
    dispose: (): void => {
      visible.dispose();
      node.dispose();
    },
  };
};

export type SelectionMask = ReturnType<typeof createSelectionMask>;
