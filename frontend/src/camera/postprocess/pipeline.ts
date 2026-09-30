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
import {pass, renderOutput, rtt, toneMapping, uniform, vec4} from "three/tsl";
import {type Node, type Renderer, RenderPipeline} from "three/webgpu";

import {pixelateUV} from "./nodes/pixelate";
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
  /** 設定を反映する。数値は uniform の更新のみ、構成が変わるとき(effect の on/off など)だけ outputNode を組み直す */
  apply(settings: PostProcessSettings): void;
  dispose(): void;
}

/** outputNode の組み直しが必要になる設定の組。数値パラメータは含めない */
const structureKey = (s: PostProcessSettings): string =>
  [s.bloom.enabled, s.pixelate.enabled, s.vignette.enabled, s.toneMapping].join(
    "|",
  );

/**
 * scene pass(HalfFloat・リニア)→ Bloom 加算 → ピクセレート → ビネット → 出力変換(最後に1回だけ)。
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

  // 数値パラメータはすべて uniform。再構築なしで反映する
  const exposure = uniform(1);
  const pixelSize = uniform(1);
  const vignetteIntensity = uniform(0);
  const vignetteSmoothness = uniform(0);

  const scenePass = pass(scene, camera);
  const sceneColor = scenePass.getTextureNode("output");
  // 使うグラフに含めたときだけ更新される。effect の on/off をまたいで使い回す。
  // BloomNode.setup は再ビルドごとに NodeMaterial を積み増すが、dispose で解放される(upstream 起因)
  const bloomNode = bloom(sceneColor);

  let pixelated: ReturnType<typeof rtt> | null = null;
  let key = "";

  const build = (s: PostProcessSettings): Node => {
    pixelated?.dispose();
    pixelated = null;

    let color: Node<"vec4"> = s.bloom.enabled
      ? sceneColor.add(bloomNode)
      : sceneColor;

    if (s.pixelate.enabled) {
      // Bloom 合成後の画像を最近傍のテクスチャに落とし、量子化した UV でサンプルする。
      // scene / bloom の各テクスチャを個別に量子化するより経路が1本で済み、bloom もブロックに揃う
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

    // 出力変換。exposure は変換の前に掛ける
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
      scenePass.dispose();
    },
  };
};
