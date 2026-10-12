import {
  ACESFilmicToneMapping,
  AgXToneMapping,
  type Camera,
  NearestFilter,
  NeutralToneMapping,
  NoToneMapping,
  ReinhardToneMapping,
  type Scene,
  SRGBColorSpace,
  type ToneMapping,
} from "three";
import {bloom} from "three/addons/tsl/display/BloomNode.js";
import {vignette} from "three/addons/tsl/display/CRT.js";
import {fsr1} from "three/addons/tsl/display/FSR1Node.js";
import {
  float,
  Fn,
  If,
  mix,
  pass,
  renderOutput,
  rtt,
  toneMapping,
  uniform,
  vec3,
  vec4,
} from "three/tsl";
import {type Node, type Renderer, RenderPipeline} from "three/webgpu";

import {disarmPipelineWatch} from "../../core/debug/pipelineWatch";
import {proxyView} from "../../transition/dive/proxyView";
import {createAimOutline} from "./nodes/aimOutline";
import {createAmbientOcclusion} from "./nodes/ambientOcclusion";
import {createContour} from "./nodes/contour";
import {createGlitch} from "./nodes/glitch";
import {createGrain} from "./nodes/grain";
import {pixelateUV} from "./nodes/pixelate";
import {createPowerOutline} from "./nodes/powerOutline";
import {createSelectionMask} from "./nodes/selectionMask";
import {outlineSelection} from "./outlineSelection";
import {powerOutlineSelection} from "./powerOutlineSelection";
import {
  type PostProcessSettings,
  type ToneMappingKind,
  VIGNETTE_MIN_SMOOTHNESS,
} from "./settings";

const TONE_MAPPING: Record<ToneMappingKind, ToneMapping> = {
  aces: ACESFilmicToneMapping,
  agx: AgXToneMapping,
  neutral: NeutralToneMapping,
  reinhard: ReinhardToneMapping,
  none: NoToneMapping,
};

/** BloomNode の既定と同じ。内部解像度に対する比率 */
const BLOOM_RESOLUTION_SCALE = 0.5;

export interface PostProcessPipeline {
  render(): void;
  apply(settings: PostProcessSettings): void;
  /** シーン(と AO・ブルーム)を描く内部解像度の、画面に対する比率(0〜1。core/graphics の getRenderScale) */
  setRenderScale(scale: number): void;
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
    s.upscale.enabled,
    s.contour.enabled,
    s.grain.enabled,
  ].join("|");

type Disposable = {dispose(): void};

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
  const upscaleSharpness = uniform(0.2);
  // 後処理の中で TSL の cameraNear / cameraFar を読むと quad のカメラの値になるので、シーンのカメラの値を毎フレーム渡す
  const cameraPlanes = {near: uniform(0.1), far: uniform(100)};
  let renderScale = 1;

  const occlusion = createAmbientOcclusion(scene, camera);

  const scenePass = pass(scene, camera);
  const sceneColor = scenePass.getTextureNode("output");
  // 使うグラフに含めたときだけ更新される。effect の on/off をまたいで使い回す。
  // BloomNode.setup は再ビルドごとに NodeMaterial を積み増すが、dispose で解放される(upstream 起因)
  const bloomNode = bloom(sceneColor);
  const glitch = createGlitch();
  const contour = createContour(
    occlusion.normal,
    occlusion.depth,
    cameraPlanes,
  );
  const grain = createGrain();
  // 2 つの縁取りの選択を 1 回のマスクで描き、隠れは pre-pass の深度と比べる(シーンの再描画なし)
  const selection = createSelectionMask(
    scene,
    camera,
    {aim: outlineSelection, power: powerOutlineSelection},
    occlusion.depth,
  );
  const aimOutline = createAimOutline(selection);
  const powerOutline = createPowerOutline(selection);

  const sampleScene = (uv: Node<"vec2">): Node<"vec4"> =>
    Fn(() => {
      const result = sceneColor.sample(uv).level(float(0)).toVar();
      If(proxyView.blend.greaterThan(0), () => {
        result.assign(
          mix(
            result,
            proxyView.textureNode.sample(uv).level(float(0)),
            proxyView.blend,
          ),
        );
      });
      return result;
    })();

  let lowRes: ReturnType<typeof rtt> | null = null;
  let upscaled: Disposable | null = null;
  let pixelated: ReturnType<typeof rtt> | null = null;
  let key = "";
  let current: PostProcessSettings | null = null;

  const applyRenderScale = (s: PostProcessSettings) => {
    scenePass.setResolutionScale(renderScale);
    occlusion.apply(s, renderScale);
    bloomNode.setResolutionScale(BLOOM_RESOLUTION_SCALE * renderScale);
    selection.setRenderScale(renderScale);
    powerOutline.setRenderScale(renderScale);
    lowRes?.setResolutionScale(renderScale);
  };

  const build = (s: PostProcessSettings): Node => {
    pixelated?.dispose();
    pixelated = null;
    upscaled?.dispose();
    upscaled = null;
    lowRes?.dispose();
    lowRes = null;

    const contextNode = occlusion.contextFor(s);
    for (const p of [scenePass, occlusion.aoOnlyPass]) {
      if (p.contextNode === contextNode) {
        continue;
      }
      p.contextNode = contextNode;
      p.needsUpdate = true;
    }
    if (s.ao.showOnly) {
      const aoTex = occlusion.aoOnlyPass.getTextureNode("ao");
      return renderOutput(
        vec4(vec3(mix(float(1), aoTex.r, aoTex.g)), 1),
        NoToneMapping,
        SRGBColorSpace,
      );
    }

    const sceneWeight = proxyView.blend.oneMinus();
    const base = glitch.scene(sampleScene);
    let color: Node<"vec4"> = s.bloom.enabled
      ? base.add(bloomNode.mul(sceneWeight))
      : base;

    if (s.contour.enabled) {
      color = contour.composite(color, sceneWeight);
    }
    color = powerOutline.composite(color, sceneWeight);
    color = aimOutline.composite(color, sceneWeight);

    const mapped =
      s.toneMapping === "none"
        ? vec4(color.rgb.mul(exposure).clamp(), color.a)
        : toneMapping(TONE_MAPPING[s.toneMapping], exposure, color);

    // ここまでを内部解像度の 1 枚に落とし、FSR1 で画面の解像度へ上げる。off のときはバイリニアで伸ばす(比較用)
    lowRes = rtt(mapped, null, null, {resolutionScale: renderScale});
    let full: Node<"vec4"> = lowRes;
    if (s.upscale.enabled) {
      const node = fsr1(lowRes, upscaleSharpness);
      upscaled = node;
      full = node;
    }

    if (s.pixelate.enabled) {
      pixelated = rtt(full, null, null, {
        minFilter: NearestFilter,
        magFilter: NearestFilter,
      });
      full = pixelated.sample(pixelateUV(pixelSize));
    }

    if (s.grain.enabled) {
      full = grain.composite(full);
    }

    if (s.vignette.enabled) {
      full = vec4(
        vignette(full.rgb, vignetteIntensity, vignetteSmoothness),
        full.a,
      );
    }

    return renderOutput(full, NoToneMapping, SRGBColorSpace);
  };

  return {
    render: () => {
      const planes = camera as {near?: number; far?: number};
      cameraPlanes.near.value = planes.near ?? cameraPlanes.near.value;
      cameraPlanes.far.value = planes.far ?? cameraPlanes.far.value;
      pipeline.render();
    },
    apply(s) {
      current = s;
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
      upscaleSharpness.value = s.upscale.sharpness;
      contour.apply(s.contour);
      grain.apply(s.grain.amount);
      applyRenderScale(s);

      const next = structureKey(s);
      if (next === key) {
        return;
      }
      if (key !== "") {
        // 構成の変更で全マテリアルのパイプラインが作り直されるので、ウォームアップ後の警告は次のウォームアップまで止める
        disarmPipelineWatch();
      }
      key = next;
      pipeline.outputNode = build(s);
      pipeline.needsUpdate = true;
    },
    setRenderScale(scale) {
      if (scale === renderScale) {
        return;
      }
      renderScale = scale;
      if (current) {
        applyRenderScale(current);
      }
    },
    dispose() {
      pipeline.dispose();
      pixelated?.dispose();
      upscaled?.dispose();
      lowRes?.dispose();
      bloomNode.dispose();
      aimOutline.dispose();
      powerOutline.dispose();
      selection.dispose();
      occlusion.dispose();
      scenePass.dispose();
    },
  };
};
