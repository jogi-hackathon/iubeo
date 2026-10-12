/// <reference types="node" />
import {readFileSync} from "node:fs";
import {resolve} from "node:path";

import {
  type Material,
  type Mesh,
  type MeshStandardMaterial,
  Texture,
} from "three";
import {afterEach, beforeAll, describe, expect, it, vi} from "vitest";

import {createProxyScene, type ProxyScene} from "../proxyScene";

const real = new Texture();
const loadAsync = vi.fn(async () => real);

vi.mock("three", async (importOriginal) => ({
  ...(await importOriginal<typeof import("three")>()),
  TextureLoader: class {
    loadAsync = loadAsync;
  },
}));

beforeAll(() => {
  vi.stubGlobal("document", {
    createElement: () => ({width: 0, height: 0, getContext: () => null}),
  });
  const bytes = readFileSync(
    resolve(import.meta.dirname, "../../../../public/ao/sandbox.bin"),
  );
  vi.stubGlobal(
    "fetch",
    async () =>
      new Response(
        bytes.buffer.slice(
          bytes.byteOffset,
          bytes.byteOffset + bytes.byteLength,
        ),
        {headers: {"content-type": "application/octet-stream"}},
      ),
  );
});

let current: ProxyScene | null = null;
afterEach(() => {
  current?.dispose();
  current = null;
});

const baked = (scene: ProxyScene): MeshStandardMaterial[] => {
  const out = new Set<Material>();
  scene.scene.traverse((o) => {
    const m = (o as Mesh).material as MeshStandardMaterial | undefined;
    if (m?.aoMap) {
      out.add(m);
    }
  });
  return [...out] as MeshStandardMaterial[];
};

describe("偽物シーンの AO", () => {
  it("アトラス無しでは仮テクスチャを貼り、差し替えても material.version が増えない", async () => {
    const {attachProxyAO, swapProxyAtlas} = await import("../proxyAO");
    current = createProxyScene("sandbox");
    await attachProxyAO(current.scene, "sandbox", {eagerAtlas: false});
    expect(loadAsync).not.toHaveBeenCalled();

    const materials = baked(current);
    expect(materials.length).toBeGreaterThan(0);
    const placeholder = materials[0]!.aoMap;
    expect(placeholder).not.toBe(real);
    const versions = materials.map((m) => m.version);

    swapProxyAtlas("sandbox", real);

    expect(materials.every((m) => m.aoMap === real)).toBe(true);
    expect(materials.map((m) => m.version)).toEqual(versions);
  });
});
