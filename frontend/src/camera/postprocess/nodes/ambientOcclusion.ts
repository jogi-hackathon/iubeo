import {type Camera, RedFormat, type Scene} from "three";
import {denoise} from "three/addons/tsl/display/DenoiseNode.js";
import {ao} from "three/addons/tsl/display/GTAONode.js";
import {
  ambientOcclusion,
  context,
  min,
  mrt,
  normalView,
  output,
  pass,
  rtt,
  screenUV,
  vec4,
} from "three/tsl";
import type {Node} from "three/webgpu";

import type {PostProcessSettings} from "../settings";
import {isSkipGTAO} from "../skipGTAO";

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

export const createAmbientOcclusion = (scene: Scene, camera: Camera) => {
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
  const contexts = {
    raw: gtaoContext(aoValues.raw),
    denoised: gtaoContext(aoValues.denoised),
  };
  const aoOnlyPass = pass(scene, camera, {samples: 0});
  aoOnlyPass.setMRT(mrt({output, ao: vec4(ambientOcclusion, 1, 0, 1)}));

  return {
    aoOnlyPass,
    /** pre-pass の深度(内部解像度・samples 0)。選択マスク・輪郭線も読むので、AO が off でも pre-pass は描かれる */
    depth: prePassDepth,
    contextFor: (s: PostProcessSettings) =>
      s.ao.enabled ? contexts[s.ao.denoise ? "denoised" : "raw"] : null,
    /** renderScale はシーンの内部解像度(pipeline)。AO の解像度は、その内部解像度に対する s.ao.resolutionScale */
    apply: (s: PostProcessSettings, renderScale: number): void => {
      aoPass.radius.value = s.ao.radius;
      aoPass.scale.value = s.ao.scale;
      aoPass.thickness.value = s.ao.thickness;
      aoPass.samples.value = s.ao.samples;
      prePass.setResolutionScale(renderScale);
      aoOnlyPass.setResolutionScale(renderScale);
      aoPass.resolutionScale = s.ao.resolutionScale * renderScale;
      denoised.setResolutionScale(s.ao.resolutionScale * renderScale);
    },
    dispose: (): void => {
      denoised.dispose();
      denoiseNode.dispose();
      aoPass.dispose();
      prePass.dispose();
      aoOnlyPass.dispose();
    },
  };
};

export type AmbientOcclusion = ReturnType<typeof createAmbientOcclusion>;
