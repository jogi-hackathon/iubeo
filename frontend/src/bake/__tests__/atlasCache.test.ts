/// <reference types="node" />
import {readFileSync} from "node:fs";
import {resolve} from "node:path";

import {Texture} from "three";
import {beforeEach, describe, expect, it, vi} from "vitest";

const loadAsync = vi.fn(async () => new Texture());

vi.mock("three", async (importOriginal) => ({
  ...(await importOriginal<typeof import("three")>()),
  TextureLoader: class {
    loadAsync = loadAsync;
  },
}));

const bytes = readFileSync(
  resolve(import.meta.dirname, "../../../public/ao/room.bin"),
);
const fetchMock = vi.fn(
  async () =>
    new Response(
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
      {headers: {"content-type": "application/octet-stream"}},
    ),
);

beforeEach(() => {
  vi.resetModules();
  loadAsync.mockClear();
  fetchMock.mockClear();
  vi.stubGlobal("fetch", fetchMock);
});

describe("atlasCache", () => {
  it("layout だけ読んでもアトラスは読まれない", async () => {
    const cache = await import("../atlasCache");
    const layout = await cache.loadLayout("room");
    expect(layout).not.toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(loadAsync).not.toHaveBeenCalled();
    expect(cache.peekAtlas("room")).toBeNull();
  });

  it("layout とアトラスはシーン名ごとに別々にキャッシュされる", async () => {
    const cache = await import("../atlasCache");
    await cache.loadLayout("room");
    await cache.loadLayout("room");
    const a = await cache.loadAtlas("room");
    const b = await cache.loadAtlas("room");
    await cache.loadAtlas("sandbox");
    expect(a).toBe(b);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(loadAsync).toHaveBeenCalledTimes(2);
    expect(cache.peekAtlas("room")).toBe(a);
  });

  it("loadBakedAO は同じキャッシュを使う", async () => {
    const cache = await import("../atlasCache");
    const atlas = await cache.loadAtlas("room");
    const data = await cache.loadBakedAO("room");
    expect(data?.atlas).toBe(atlas);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(loadAsync).toHaveBeenCalledTimes(1);
  });

  it("仮テクスチャは本物のアトラスと同じ設定で白", async () => {
    const cache = await import("../atlasCache");
    const real = await cache.loadAtlas("room");
    const dummy = cache.createPlaceholderAtlas();
    expect(dummy.colorSpace).toBe(real.colorSpace);
    expect(dummy.flipY).toBe(real.flipY);
    expect(dummy.generateMipmaps).toBe(real.generateMipmaps);
    expect(dummy.minFilter).toBe(real.minFilter);
    expect(dummy.magFilter).toBe(real.magFilter);
    expect(dummy.channel).toBe(real.channel);
    expect(dummy.format).toBe(real.format);
    expect(dummy.type).toBe(real.type);
    expect(Array.from((dummy.image as {data: Uint8Array}).data)).toEqual([
      255, 255, 255, 255,
    ]);
  });
});
