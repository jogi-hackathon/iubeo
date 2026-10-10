import {
  ACESFilmicToneMapping,
  AgXToneMapping,
  type Camera,
  Color,
  NearestFilter,
  NeutralToneMapping,
  NoToneMapping,
  RedFormat,
  ReinhardToneMapping,
  type Scene,
  SRGBColorSpace,
  type ToneMapping,
} from "three";
import {bloom} from "three/addons/tsl/display/BloomNode.js";
import {vignette} from "three/addons/tsl/display/CRT.js";
import {denoise} from "three/addons/tsl/display/DenoiseNode.js";
import {ao} from "three/addons/tsl/display/GTAONode.js";
import {outline} from "three/addons/tsl/display/OutlineNode.js";
import {
  ambientOcclusion,
  clamp,
  context,
  float,
  min,
  mix,
  max,
  mrt,
  normalView,
  output,
  pass,
  renderOutput,
  rtt,
  screenSize,
  screenUV,
  sin,
  texture,
  time,
  toneMapping,
  uniform,
  vec2,
  vec3,
  vec4,
} from "three/tsl";
import {
  type Node,
  type Renderer,
  type RenderTarget,
  RenderPipeline,
} from "three/webgpu";

import {pixelateUV} from "./nodes/pixelate";
import {outlineSelection} from "./outlineSelection";
import {powerOutlineFade, powerOutlineSelection} from "./powerOutlineSelection";
import {
  type PostProcessSettings,
  type ToneMappingKind,
  VIGNETTE_MIN_SMOOTHNESS,
} from "./settings";
import {isSkipGTAO} from "./skipGTAO";

const OUTLINE_COLOR = "#1a1a1a";
/** アウトラインの太さ(OutlineNode の edgeThickness。ぼかしの半径で、大きいほど太くぼやける。細めの線にするので 1.5) */
const OUTLINE_THICKNESS = 1.5;
const OUTLINE_STRENGTH = 4;

const POWER_OUTLINE_COLOR = "#ff1f2e";
const POWER_OUTLINE_WIDTH = 4;
const POWER_WOBBLE_PX = 0;

const TONE_MAPPING: Record<ToneMappingKind, ToneMapping> = {
  aces: ACESFilmicToneMapping,
  agx: AgXToneMapping,
  neutral: NeutralToneMapping,
  reinhard: ReinhardToneMapping,
  none: NoToneMapping,
};

export interface PostProcessPipeline {
  render(): void;
  /** 設定を反映する。数値は uniform の更新のみ、構成が変わるとき(effect の on/off など)だけ outputNode を組み直す */
  apply(settings: PostProcessSettings): void;
  dispose(): void;
}

const structureKey = (s: PostProcessSettings): string =>
  [
    s.bloom.enabled,
    s.pixelate.enabled,
    s.vignette.enabled,
    s.toneMapping,
    s.ao.enabled,
    s.ao.showOnly,
    s.ao.enabled && s.ao.denoise,
  ].join("|");

type MaterialLike = {transparent: boolean; skipGTAO?: unknown};

/**
 * scene pass の各マテリアルの AO(getAO)に GTAO を合成するコンテキスト。
 * - material.skipGTAO が true(skipGTAO.ts)(AO モード baked の prop、プレイヤーの骨格)→ マテリアル側の AO だけ
 *   (aoMap が無ければ AO なし)
 * - マテリアル側の AO(ベイク AO の aoMap)が無い → GTAO だけ
 * - それ以外(AO モード both など)→ 暗い方。three の builtinAOContext は掛け算するが、両者は同じ遮蔽の見積もりなので、
 *   掛けると両方が効く場所(接地・壁の根元)だけ二重に暗くなる
 */
const gtaoContext = (gtao: Node<"float">) =>
  context({
    getAO: (
      inputNode: Node<"float"> | null,
      {material}: {material: MaterialLike},
    ) => {
      if (material.transparent) {
        return inputNode;
      }
      if (isSkipGTAO(material)) {
        return inputNode;
      }
      if (inputNode === null) {
        return gtao;
      }
      return min(inputNode, gtao);
    },
  });

/**
 * AO の pre-pass(法線・深度)→ GTAO → scene pass(AO は間接光だけに掛かる。ベイク AO との分担は gtaoContext)→ Bloom 加算
 * → アウトライン(狙ったオブジェクトの外周。他の物に隠れた部分は出さない)→ ピクセレート → ビネット → 出力変換(最後に1回だけ)。
 * outputColorTransform=false にして出力変換を自前で行う(Renderer の toneMapping / outputColorSpace は R3F が
 * ACES / sRGB に上書きしているが、RenderPipeline 内では使わない)
 */
export const createPostProcessPipeline = (
  renderer: Renderer,
  scene: Scene,
  camera: Camera,
): PostProcessPipeline => {
  const pipeline = new RenderPipeline(renderer);
  pipeline.outputColorTransform = false;

  const exposure = uniform(1);
  const pixelSize = uniform(1);
  const vignetteIntensity = uniform(0);
  const vignetteSmoothness = uniform(0);

  // AO 用の pre-pass(法線・深度)。透明物は AO の入力に含めない。
  // テクスチャの型は PassNode.setup が Renderer の出力バッファ型(HalfFloat)で上書きするので、法線は詰めずにそのまま書く。
  // GTAO は深度を textureGather で読むため、Renderer の MSAA(antialias)を引き継がないよう samples: 0 にする
  // (マルチサンプルの深度テクスチャだと WGSL のコンパイルに失敗する)
  const prePass = pass(scene, camera, {samples: 0});
  prePass.transparent = false;
  prePass.setMRT(mrt({output: normalView}));
  const prePassNormal = prePass.getTextureNode();
  const prePassDepth = prePass.getTextureNode("depth");
  const aoPass = ao(prePassDepth, prePassNormal, camera);
  // GTAO の生の出力はディザ状のノイズが残るので、深度・法線を見ながらぼかす。
  // DenoiseNode は TempNode なので、scene のマテリアル内で毎フラグメント評価されないよう rtt で一度テクスチャに落とす。
  // 使うのは r だけなので RedFormat。解像度は apply で GTAO と揃える
  const denoiseNode = denoise(
    aoPass.getTextureNode(),
    prePassDepth,
    prePassNormal,
    camera,
  );
  const denoised = rtt(denoiseNode, null, null, {format: RedFormat});
  const aoValues = {
    raw: aoPass.getTextureNode().sample(screenUV).r,
    denoised: denoised.sample(screenUV).r,
  };
  const aoContexts = {
    raw: gtaoContext(aoValues.raw),
    denoised: gtaoContext(aoValues.denoised),
  };
  const aoOnlyPass = pass(scene, camera, {samples: 0});
  aoOnlyPass.setMRT(mrt({output, ao: vec4(ambientOcclusion, 1, 0, 1)}));

  const scenePass = pass(scene, camera);
  const sceneColor = scenePass.getTextureNode("output");
  // 使うグラフに含めたときだけ更新される。effect の on/off をまたいで使い回す。
  // BloomNode.setup は再ビルドごとに NodeMaterial を積み増すが、dispose で解放される(upstream 起因)
  const bloomNode = bloom(sceneColor);
  // 狙ったオブジェクト(outlineSelection)の外周。選択が空のあいだは OutlineNode が自分のパスを全部飛ばすので、グラフには常に入れておく
  const outlinePass = outline(scene, camera, {
    selectedObjects: outlineSelection,
    edgeThickness: uniform(OUTLINE_THICKNESS),
    edgeGlow: float(0),
  });
  const outlineColor = uniform(new Color(OUTLINE_COLOR));
  // 選択が空のあいだは OutlineNode が自分のパスを全部飛ばすので、狙いの縁取りと同じくグラフには常に入れておく
  const powerOutlinePass = outline(scene, camera, {
    selectedObjects: powerOutlineSelection,
    edgeGlow: float(0),
  });
  const powerOutlineColor = uniform(new Color(POWER_OUTLINE_COLOR));
  const powerWobble = vec2(
    sin(screenUV.y.mul(90).add(time.mul(7))).add(
      sin(screenUV.y.mul(37).sub(time.mul(4.3))).mul(0.5),
    ),
    sin(screenUV.x.mul(80).add(time.mul(6.1))).add(
      sin(screenUV.x.mul(41).add(time.mul(3.7))).mul(0.5),
    ),
  )
    .mul(POWER_WOBBLE_PX / 1.5)
    .div(screenSize);
  // OutlineNode のマスクは、r が選んだ物の上で 0(それ以外は 1)、g が選んだ物が他の物の深さより奥のとき 1(見えているのは 0)。
  // 公開されていない中身(_renderTargetMaskBuffer)なので、three を上げたときは名前と中身が変わっていないか確かめる
  const powerMask = texture(
    (powerOutlinePass as unknown as {_renderTargetMaskBuffer: RenderTarget})
      ._renderTargetMaskBuffer.texture,
  );
  const visibleSelectedAt = (dx: number, dy: number): Node<"float"> => {
    const m = powerMask.sample(
      screenUV.add(powerWobble).add(vec2(dx, dy).div(screenSize)),
    );
    return m.g.oneMinus().mul(m.r.oneMinus());
  };
  let powerCover: Node<"float"> = float(0);
  for (let radius = 1; radius <= POWER_OUTLINE_WIDTH; radius++) {
    const directions = radius <= 2 ? 8 : 16;
    for (let k = 0; k < directions; k++) {
      const angle = (k / directions) * Math.PI * 2;
      powerCover = max(
        powerCover,
        visibleSelectedAt(radius * Math.cos(angle), radius * Math.sin(angle)),
      );
    }
  }
  // OutlineNode はグラフに入れないとマスクを毎フレーム更新しないので、結果に影響しない形(0 倍)でつなぐ
  const powerEdge = powerCover
    .mul(powerMask.sample(screenUV).r)
    .add(powerOutlinePass.visibleEdge.mul(0));

  let pixelated: ReturnType<typeof rtt> | null = null;
  let key = "";

  const build = (s: PostProcessSettings): Node => {
    pixelated?.dispose();
    pixelated = null;

    const aoSource = s.ao.denoise ? "denoised" : "raw";
    const contextNode = s.ao.enabled ? aoContexts[aoSource] : null;
    for (const p of [scenePass, aoOnlyPass]) {
      if (p.contextNode === contextNode) {
        continue;
      }
      // needsUpdate で version が上がり、PassNode がキャッシュしているコンテキストも作り直される。
      // コンテキストが変わると scene の全マテリアルが再コンパイルされるので、変わったときだけ行う
      p.contextNode = contextNode;
      p.needsUpdate = true;
    }
    if (s.ao.showOnly) {
      const aoTex = aoOnlyPass.getTextureNode("ao");
      return renderOutput(
        vec4(vec3(mix(float(1), aoTex.r, aoTex.g)), 1),
        NoToneMapping,
        SRGBColorSpace,
      );
    }

    let color: Node<"vec4"> = s.bloom.enabled
      ? sceneColor.add(bloomNode)
      : sceneColor;

    color = vec4(
      mix(
        color.rgb,
        powerOutlineColor,
        clamp(powerEdge, 0, 1).mul(powerOutlineFade),
      ),
      color.a,
    );
    color = vec4(
      mix(
        color.rgb,
        outlineColor,
        clamp(outlinePass.visibleEdge.mul(OUTLINE_STRENGTH), 0, 1),
      ),
      color.a,
    );

    if (s.pixelate.enabled) {
      pixelated = rtt(color, null, null, {
        minFilter: NearestFilter,
        magFilter: NearestFilter,
      });
      color = pixelated.sample(pixelateUV(pixelSize));
    }

    if (s.vignette.enabled) {
      color = vec4(
        vignette(color.rgb, vignetteIntensity, vignetteSmoothness),
        color.a,
      );
    }

    const mapped =
      s.toneMapping === "none"
        ? vec4(color.rgb.mul(exposure).clamp(), color.a)
        : toneMapping(TONE_MAPPING[s.toneMapping], exposure, color);
    return renderOutput(mapped, NoToneMapping, SRGBColorSpace);
  };

  return {
    render: () => pipeline.render(),
    apply(s) {
      exposure.value = s.exposure;
      bloomNode.strength.value = s.bloom.strength;
      bloomNode.radius.value = s.bloom.radius;
      bloomNode.threshold.value = s.bloom.threshold;
      pixelSize.value = s.pixelate.pixelSize;
      vignetteIntensity.value = s.vignette.intensity;
      // smoothstep の edge0 == edge1 を避ける
      vignetteSmoothness.value = Math.max(
        s.vignette.smoothness,
        VIGNETTE_MIN_SMOOTHNESS,
      );
      aoPass.radius.value = s.ao.radius;
      aoPass.scale.value = s.ao.scale;
      aoPass.thickness.value = s.ao.thickness;
      aoPass.samples.value = s.ao.samples;
      aoPass.resolutionScale = s.ao.resolutionScale;
      denoised.setResolutionScale(s.ao.resolutionScale);

      const next = structureKey(s);
      if (next === key) {
        return;
      }
      key = next;
      pipeline.outputNode = build(s);
      pipeline.needsUpdate = true;
    },
    dispose() {
      pipeline.dispose();
      pixelated?.dispose();
      bloomNode.dispose();
      outlinePass.dispose();
      powerOutlinePass.dispose();
      denoised.dispose();
      denoiseNode.dispose();
      aoPass.dispose();
      prePass.dispose();
      aoOnlyPass.dispose();
      scenePass.dispose();
    },
  };
};
