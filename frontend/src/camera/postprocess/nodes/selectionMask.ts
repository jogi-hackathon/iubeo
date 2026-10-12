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

/** 選択の根(outlineSelection / powerOutlineSelection)。配列は参照で持ち、中身は毎フレーム読む。根の子孫も対象 */
export type SelectionRoots = {
  aim: readonly Object3D[];
  power: readonly Object3D[];
};

/** 同じ面を同じ解像度で描いた深度どうしの比較なので、丸めの差だけ許す */
const DEPTH_EPSILON = 1e-6;

const _size = new Vector2();

/**
 * マスクのマテリアル。どの選択に入っているかは物ごとの uniform(onObjectUpdate)で渡し、マテリアルは 1 つにする
 * (選択の組ごとにマテリアルを分けると、ウォームアップで通らない組のシェーダーが後から作られる)
 */
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

/**
 * 狙いの縁取り(R)と力の縁取り(G)の選択物だけを、色なしのマスクとして 1 回で描く。
 * OutlineNode は選択ごとに「非選択の全物の深度パス」と「選択物のマスクパス」でシーンを 2 回描くが、
 * 隠れの判定は AO の pre-pass の深度と比べれば足りるので、シーンの再描画を無くして選択物だけ描く。
 * 出力は (見えている狙いの選択, 見えている力の選択, 狙いの選択の全体, 力の選択の全体)。
 * 全体(隠れた部分を含むシルエット)は、縁取りを物の内側に描かないための切り抜きに使う
 */
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
    /** シーンの深度(AO の pre-pass。samples 0)。マスクも同じ解像度・同じサンプル数で描いて比べる */
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
    // 背景(空)をマスクに描かないよう、OutlineNode と同じく一時的に外す
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

/**
 * 選択のマスク。visible は (見えている狙い, 見えている力, 狙いの全体, 力の全体) のテクスチャ(内部解像度)。
 * 縁取り(aimOutline・powerOutline)がこれを読む
 */
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
