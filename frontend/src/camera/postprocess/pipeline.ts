import {
  ACESFilmicToneMapping,
  AgXToneMapping,
  type Camera,
  NearestFilter,
  NeutralToneMapping,
  NoToneMapping,
  RedFormat,
  ReinhardToneMapping,
  type Scene,
  SRGBColorSpace,
  type ToneMapping,
} from "three";
import { bloom } from "three/addons/tsl/display/BloomNode.js";
import { vignette } from "three/addons/tsl/display/CRT.js";
import { denoise } from "three/addons/tsl/display/DenoiseNode.js";
import { ao } from "three/addons/tsl/display/GTAONode.js";
import {
  ambientOcclusion,
  context,
  float,
  min,
  mix,
  mrt,
  normalView,
  output,
  pass,
  renderOutput,
  rtt,
  screenUV,
  toneMapping,
  uniform,
  vec3,
  vec4,
} from "three/tsl";
import { type Node, type Renderer, RenderPipeline } from "three/webgpu";
import { pixelateUV } from "./nodes/pixelate";
import {
  type PostProcessSettings,
  type ToneMappingKind,
  VIGNETTE_MIN_SMOOTHNESS,
} from "./settings";
import { SKIP_GTAO } from "./skipGTAO";

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
  [
    s.bloom.enabled,
    s.pixelate.enabled,
    s.vignette.enabled,
    s.toneMapping,
    // GTAO が off のときは denoise は効かないので、キーにも含めない。showOnly は GTAO と独立
    s.ao.enabled,
    s.ao.showOnly,
    s.ao.enabled && s.ao.denoise,
  ].join("|");

type MaterialLike = { transparent: boolean; userData: Record<string, unknown> };

/**
 * scene pass の各マテリアルの AO(getAO)に GTAO を合成するコンテキスト。
 * - マテリアル側の AO(ベイク AO の aoMap)が無い → GTAO だけ
 * - userData[SKIP_GTAO] が立っている(AO モード baked の prop)→ マテリアル側の AO だけ
 * - それ以外(AO モード both など)→ 暗い方。three の builtinAOContext は掛け算するが、両者は同じ遮蔽の見積もりなので、
 *   掛けると両方が効く場所(接地・壁の根元)だけ二重に暗くなる
 */
const gtaoContext = (gtao: Node<"float">) =>
  context({
    getAO: (
      inputNode: Node<"float"> | null,
      { material }: { material: MaterialLike },
    ) => {
      if (material.transparent) return inputNode;
      if (inputNode === null) return gtao;
      if (material.userData[SKIP_GTAO] === true) return inputNode;
      return min(inputNode, gtao);
    },
  });

/**
 * AO の pre-pass(法線・深度)→ GTAO → scene pass(AO は間接光だけに掛かる。ベイク AO との分担は gtaoContext)→ Bloom 加算 → ピクセレート
 * → ビネット → 出力変換(最後に1回だけ)。
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

  // AO 用の pre-pass(法線・深度)。透明物は AO の入力に含めない。
  // テクスチャの型は PassNode.setup が Renderer の出力バッファ型(HalfFloat)で上書きするので、法線は詰めずにそのまま書く。
  // GTAO は深度を textureGather で読むため、Renderer の MSAA(antialias)を引き継がないよう samples: 0 にする
  // (マルチサンプルの深度テクスチャだと WGSL のコンパイルに失敗する)
  const prePass = pass(scene, camera, { samples: 0 });
  prePass.transparent = false;
  prePass.setMRT(mrt({ output: normalView }));
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
  const denoised = rtt(denoiseNode, null, null, { format: RedFormat });
  const aoValues = {
    raw: aoPass.getTextureNode().sample(screenUV).r,
    denoised: denoised.sample(screenUV).r,
  };
  // scene pass の各マテリアルの getAO に差し込む。AO が off のときは contextNode を外すので、
  // pre-pass と GTAO はグラフから外れて計算されない
  const aoContexts = {
    raw: gtaoContext(aoValues.raw),
    denoised: gtaoContext(aoValues.denoised),
  };
  // 調整用の「AO だけ表示」専用のパス。マテリアルが実際に使う AO(ベイク AO と GTAO の合成後)を MRT で書き出す。
  // scene pass の MRT を切り替えると、外したあとも描画先のアタッチメント数が戻らず WebGPU の検証エラーになるので、
  // 別のパスにしてある(表示中だけグラフに入るので、普段は描かれない)。
  // ambientOcclusion は AO の無いマテリアルでは既定値 1。g は「何か描かれた」印(背景はクリア値のまま)
  const aoOnlyPass = pass(scene, camera, { samples: 0 });
  aoOnlyPass.setMRT(mrt({ output, ao: vec4(ambientOcclusion, 1, 0, 1) }));

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

    const aoSource = s.ao.denoise ? "denoised" : "raw";
    const contextNode = s.ao.enabled ? aoContexts[aoSource] : null;
    for (const p of [scenePass, aoOnlyPass]) {
      if (p.contextNode === contextNode) continue;
      // needsUpdate で version が上がり、PassNode がキャッシュしているコンテキストも作り直される。
      // コンテキストが変わると scene の全マテリアルが再コンパイルされるので、変わったときだけ行う
      p.contextNode = contextNode;
      p.needsUpdate = true;
    }
    if (s.ao.showOnly) {
      // 調整用: 合成後の AO だけを白黒で出す。トーンマップ・露出は掛けない。
      // 何も描かれていない背景(g がクリア値の 0)は AO なし(白)として出す
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
      aoPass.radius.value = s.ao.radius;
      aoPass.scale.value = s.ao.scale;
      aoPass.thickness.value = s.ao.thickness;
      aoPass.samples.value = s.ao.samples;
      // uniform ではないが、GTAO が毎フレームの setSize で読むので再構築は要らない
      aoPass.resolutionScale = s.ao.resolutionScale;
      // denoise のカーネル幅は入力(AO)の解像度で決まるので、出力を AO と同じ解像度にしても結果は変わらない
      denoised.setResolutionScale(s.ao.resolutionScale);

      const next = structureKey(s);
      if (next === key) return;
      key = next;
      pipeline.outputNode = build(s);
      pipeline.needsUpdate = true;
    },
    dispose() {
      pipeline.dispose();
      pixelated?.dispose();
      bloomNode.dispose();
      denoised.dispose();
      denoiseNode.dispose();
      aoPass.dispose();
      prePass.dispose();
      aoOnlyPass.dispose();
      scenePass.dispose();
    },
  };
};
