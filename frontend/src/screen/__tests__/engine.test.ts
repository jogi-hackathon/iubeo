import {describe, expect, it, vi} from "vitest";

import {engineManifestUrls, engineUrl} from "../engine";

describe("engineManifestUrls", () => {
  it("既定ではルートの manifest.json だけを見る", () => {
    expect(engineManifestUrls("")).toEqual(["/engine/manifest.json"]);
    expect(engineManifestUrls("?debug")).toEqual(["/engine/manifest.json"]);
  });

  it("?engine=<dir> があれば、そのバージョンを先に見る", () => {
    expect(engineManifestUrls("?engine=v0.0.9")).toEqual([
      "/engine/v0.0.9/manifest.json",
      "/engine/manifest.json",
    ]);
  });

  it("ディレクトリとして不正な値は無視する（パスの外へ出さない）", () => {
    expect(engineManifestUrls("?engine=../secret")).toEqual([
      "/engine/manifest.json",
    ]);
  });

  it("配信元（基点 URL）を付けた候補になる", () => {
    expect(
      engineManifestUrls("?engine=v0.0.9", "https://pub-x.r2.dev"),
    ).toEqual([
      "https://pub-x.r2.dev/engine/v0.0.9/manifest.json",
      "https://pub-x.r2.dev/engine/manifest.json",
    ]);
  });
});

describe("engineUrl", () => {
  it("マニフェストの相対パスには基点を付け、絶対 URL はそのまま使う", () => {
    expect(engineUrl("/engine/v0.0.9/gecko.js", "https://pub-x.r2.dev")).toBe(
      "https://pub-x.r2.dev/engine/v0.0.9/gecko.js",
    );
    expect(engineUrl("/engine/v0.0.9/gecko.js", "")).toBe(
      "/engine/v0.0.9/gecko.js",
    );
    expect(
      engineUrl("https://cdn.example.com/gecko.js", "https://pub-x.r2.dev"),
    ).toBe("https://cdn.example.com/gecko.js");
  });
});

/** 先取りの状態はモジュールに持つので、テストごとに読み直して仕切り直す */
const freshEngine = async () => {
  vi.resetModules();
  return await import("../engine");
};

const wasmResponse = (bytes = 8) =>
  new Response(new Uint8Array(bytes), {status: 200});

describe("prefetchEngineWasm", () => {
  it("取っておいた wasm を blob URL で返す", async () => {
    const engine = await freshEngine();
    const fetchFn = vi.fn(async () => wasmResponse());
    await engine.prefetchEngineWasm("/engine/v0.0.9/gecko.wasm.zst", fetchFn);

    expect(
      await engine.prewarmedWasmUrl("/engine/v0.0.9/gecko.wasm.zst"),
    ).toMatch(/^blob:/);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("同じ URL を二度取りに行かない（クリックと先取りで二重に落とさない）", async () => {
    const engine = await freshEngine();
    const fetchFn = vi.fn(async () => wasmResponse());
    const url = "/engine/v0.0.9/gecko.wasm.zst";
    const first = await engine.prefetchEngineWasm(url, fetchFn);
    const second = await engine.prefetchEngineWasm(url, fetchFn);

    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(second).toBe(first);
  });

  it("取り中に呼ばれても、同じ約束を待って blob URL を返す", async () => {
    const engine = await freshEngine();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const fetchFn = vi.fn(async () => {
      await gate;
      return wasmResponse();
    });
    const inflight = engine.prefetchEngineWasm(
      "/engine/v0.0.9/gecko.wasm.zst",
      fetchFn,
    );
    const waited = engine.prewarmedWasmUrl("/engine/v0.0.9/gecko.wasm.zst");
    release();

    expect(await waited).toMatch(/^blob:/);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    await inflight;
  });

  it("取れなかったら undefined（呼び側はマニフェストの URL を使う）", async () => {
    const engine = await freshEngine();
    const notFound = vi.fn(async () => new Response("", {status: 404}));
    await engine.prefetchEngineWasm("/engine/x/gecko.wasm.zst", notFound);
    expect(
      await engine.prewarmedWasmUrl("/engine/x/gecko.wasm.zst"),
    ).toBeUndefined();

    const engine2 = await freshEngine();
    const boom = vi.fn(async () => {
      throw new Error("offline");
    });
    await engine2.prefetchEngineWasm("/engine/y/gecko.wasm.zst", boom);
    expect(
      await engine2.prewarmedWasmUrl("/engine/y/gecko.wasm.zst"),
    ).toBeUndefined();
  });

  it("先取りしていない URL では undefined", async () => {
    const engine = await freshEngine();
    expect(
      await engine.prewarmedWasmUrl("/engine/v0.0.9/gecko.wasm.zst"),
    ).toBeUndefined();
  });

  it("解放すると blob を戻して、次の先取りはまた取りに行く", async () => {
    const engine = await freshEngine();
    const revoke = vi
      .spyOn(URL, "revokeObjectURL")
      .mockImplementation(() => {});
    const fetchFn = vi.fn(async () => wasmResponse());
    const url = "/engine/v0.0.9/gecko.wasm.zst";
    await engine.prefetchEngineWasm(url, fetchFn);
    const blobUrl = await engine.prewarmedWasmUrl(url);

    engine.releasePrewarmedWasm();
    await Promise.resolve();
    expect(revoke).toHaveBeenCalledWith(blobUrl);
    expect(await engine.prewarmedWasmUrl(url)).toBeUndefined();

    await engine.prefetchEngineWasm(url, fetchFn);
    expect(fetchFn).toHaveBeenCalledTimes(2);
    revoke.mockRestore();
  });
});
