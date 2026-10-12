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

import {proxyView} from "../../transition/dive/proxyView";
import {createAimOutline} from "./nodes/aimOutline";
import {createAmbientOcclusion} from "./nodes/ambientOcclusion";
import {createGlitch} from "./nodes/glitch";
import {pixelateUV} from "./nodes/pixelate";
import {createPowerOutline} from "./nodes/powerOutline";
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

export interface PostProcessPipeline {
  render(): void;
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

  const occlusion = createAmbientOcclusion(scene, camera);

  const scenePass = pass(scene, camera);
  const sceneColor = scenePass.getTextureNode("output");
  // BloomNode.setup は再ビルドのたびに NodeMaterial を積み増す(dispose で解放)ので、build ごとに作らず使い回す
  const bloomNode = bloom(sceneColor);
  const glitch = createGlitch();
  const aimOutline = createAimOutline(scene, camera);
  const powerOutline = createPowerOutline(scene, camera);

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

  let pixelated: ReturnType<typeof rtt> | null = null;
  let key = "";

  const build = (s: PostProcessSettings): Node => {
    pixelated?.dispose();
    pixelated = null;

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

    color = powerOutline.composite(color, sceneWeight);
    color = aimOutline.composite(color, sceneWeight);

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
      occlusion.apply(s);

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
      aimOutline.dispose();
      powerOutline.dispose();
      occlusion.dispose();
      scenePass.dispose();
    },
  };
};
