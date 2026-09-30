// three-mesh-bvh/webgpu の型定義に無いものを、使う分だけ補う(実体は
// node_modules/three-mesh-bvh/src/webgpu/nodes/WGSLTagFnNode.js と BVHComputeData.js)。
import type {ComputeNode} from "three/webgpu";

declare module "three-mesh-bvh/webgpu" {
  /** WGSL のテンプレートリテラルから関数ノードを作る。`${node}` で TSL ノードを埋め込める */
  export function wgslTagFn(
    tokens: TemplateStringsArray,
    ...args: unknown[]
  ): (params: Record<string, unknown>) => {
    computeKernel(workgroupSize?: number[]): ComputeNode;
  };

  interface BVHComputeData {
    /** GPU に載せた storage buffer を解放する */
    dispose(): void;
  }
}
