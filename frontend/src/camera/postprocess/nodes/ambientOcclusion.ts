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
  // テクスチャの型は PassNode.setup が Renderer の出力バッファ型(HalfFloat)で上書きするので、法線は詰めずにそのまま書く。
  // GTAO は深度を textureGather で読むため、Renderer の MSAA(antialias)を引き継がないよう samples: 0 にする
  // (マルチサンプルの深度テクスチャだと WGSL のコンパイルに失敗する)
  const prePass = pass(scene, camera, {samples: 0});
  prePass.transparent = false;
  prePass.setMRT(mrt({output: normalView}));
  const prePassNormal = prePass.getTextureNode();
  const prePassDepth = prePass.getTextureNode("depth");
  const aoPass = ao(prePassDepth, prePassNormal, camera);
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
    /** pre-pass のビュー空間の法線(詰めていない xyz) */
    normal: prePassNormal,
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
