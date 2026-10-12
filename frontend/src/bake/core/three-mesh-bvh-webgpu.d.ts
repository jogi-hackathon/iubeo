import type {ComputeNode} from "three/webgpu";

declare module "three-mesh-bvh/webgpu" {
  export function wgslTagFn(
    tokens: TemplateStringsArray,
    ...args: unknown[]
  ): (params: Record<string, unknown>) => {
    computeKernel(workgroupSize?: number[]): ComputeNode;
  };

  interface BVHComputeData {
    dispose(): void;
  }
}
