/// <reference types="node" />
import {readFileSync} from "node:fs";
import {resolve} from "node:path";

import {afterEach, beforeAll, describe, expect, it, vi} from "vitest";

import {parseLayout, findLayoutMismatch} from "../../../bake/format";
import {meshSignature, selectBakeMeshes} from "../../../bake/meshes";
import {collectMeshes} from "../proxyAO";
import {createProxyScene, type ProxyScene} from "../proxyScene";

const layoutOf = (name: string) => {
  const bytes = readFileSync(
    resolve(import.meta.dirname, `../../../../public/ao/${name}.bin`),
  );
  return parseLayout(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  );
};

beforeAll(() => {
  vi.stubGlobal("document", {
    createElement: () => ({width: 0, height: 0, getContext: () => null}),
  });
});

let current: ProxyScene | null = null;
afterEach(() => {
  current?.dispose();
  current = null;
});

describe("偽物シーンのベイク対象", () => {
  it.each(["room", "sandbox"] as const)(
    "%s の mesh が public/ao のレイアウトと一致する",
    (name) => {
      current = createProxyScene(name);
      const meshes = selectBakeMeshes(collectMeshes(current.scene));
      expect(
        findLayoutMismatch(layoutOf(name), meshes.map(meshSignature)),
      ).toBeNull();
    },
  );
});
