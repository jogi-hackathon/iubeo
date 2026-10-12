import {describe, expect, it} from "vitest";

import {describeRenderObject} from "../pipelineWatch";

describe("describeRenderObject", () => {
  it("マテリアル・物・インスタンス数・ジオメトリの属性・描画先を 1 行にする", () => {
    expect(
      describeRenderObject({
        material: {type: "MeshStandardMaterial", name: ""},
        object: {type: "InstancedMesh", name: "keys", count: 12},
        geometry: {attributes: {position: {}, normal: {}}},
        context: {renderTarget: {texture: {name: "PassNode"}}, sampleCount: 4},
      }),
    ).toBe(
      "MeshStandardMaterial on InstancedMesh(keys) x12 [normal/position] -> PassNode (samples 4)",
    );
    expect(
      describeRenderObject({
        material: {type: "NodeMaterial", name: "OutlineNode.depth"},
        object: {type: "Mesh", name: ""},
        geometry: {attributes: {}},
        context: {renderTarget: null, sampleCount: 1},
      }),
    ).toBe("NodeMaterial(OutlineNode.depth) on Mesh [] -> canvas (samples 1)");
  });
});
