import type {GeckoModule} from "./geckoTypes";
import {installWispTokenRewrite} from "./wispUrl";

const ENGINE_DIR_PATTERN = /^[\w.-]+$/;
const ENTRY_FALLBACK = "/engine/gecko.js";
const WASM_FALLBACKS: ReadonlyArray<readonly [string, boolean]> = [
  ["/engine/gecko.wasm.zst", true],
  ["/engine/gecko.wasm", false],
];

type EngineManifest = {
  entry?: string;
  wasm?: {url?: string; compressed?: boolean};
  version?: string;
};

export type ResolvedEngine = {
  entry: string;
  wasm: {url: string; compressed: boolean};
  version?: string;
};

export const ENGINE_BASE_URL = (
  import.meta.env.VITE_ENGINE_BASE_URL ?? ""
).replace(/\/+$/, "");

export const engineUrl = (
  path: string,
  base: string = ENGINE_BASE_URL,
): string => (/^https?:\/\//.test(path) ? path : `${base}${path}`);

export const engineManifestUrls = (
  search: string,
  base: string = ENGINE_BASE_URL,
): string[] => {
  const requested = new URLSearchParams(search).get("engine") ?? "";
  return [
    ENGINE_DIR_PATTERN.test(requested)
      ? engineUrl(`/engine/${requested}/manifest.json`, base)
      : "",
    engineUrl("/engine/manifest.json", base),
  ].filter(Boolean);
};

const resolveWasm = (
  wasm: NonNullable<EngineManifest["wasm"]>,
): {url: string; compressed: boolean} => ({
  url: engineUrl(wasm.url ?? ""),
  compressed: !!wasm.compressed,
});

export const resolveEngine = async (
  search: string,
): Promise<ResolvedEngine | null> => {
  for (const url of engineManifestUrls(search)) {
    try {
      const response = await fetch(url, {cache: "no-store"});
      if (!response.ok) {
        continue;
      }
      const manifest = (await response.json()) as EngineManifest;
      if (manifest.wasm?.url) {
        return {
          entry: engineUrl(manifest.entry ?? ENTRY_FALLBACK),
          wasm: resolveWasm(manifest.wasm),
          version: manifest.version,
        };
      }
    } catch {}
  }

  for (const [url, compressed] of WASM_FALLBACKS) {
    try {
      const response = await fetch(engineUrl(url), {method: "HEAD"});
      if (response.ok) {
        return {
          entry: engineUrl(ENTRY_FALLBACK),
          wasm: {url: engineUrl(url), compressed},
        };
      }
    } catch {}
  }
  return null;
};

let prewarmed = false;

type WasmPrefetch = {url: string; blobUrl: string};
let wasmPrefetch: {url: string; promise: Promise<WasmPrefetch | null>} | null =
  null;

/**
 * 33MB の wasm はブラウザの HTTP キャッシュに入らない（巨大なリソースは入れない決まりで、
 * 2 回目も丸ごと落ちてくる。実測: 912KB のファイルは 2 回目が 46ms で返るが、33MB は 2 回目も 94 秒）。
 * そのため「先に取っておく」にはバイト列を自分で持っておく必要があり、blob URL にして渡す。
 */
export const prefetchEngineWasm = (
  url: string,
  fetchFn: typeof fetch = fetch,
): Promise<WasmPrefetch | null> => {
  if (wasmPrefetch?.url === url) {
    return wasmPrefetch.promise;
  }
  const promise = (async (): Promise<WasmPrefetch | null> => {
    try {
      const response = await fetchFn(url);
      if (!response.ok) {
        return null;
      }
      const blob = await response.blob();
      return {url, blobUrl: URL.createObjectURL(blob)};
    } catch {
      return null;
    }
  })();
  wasmPrefetch = {url, promise};
  return promise;
};

export const prewarmedWasmUrl = async (
  url: string,
): Promise<string | undefined> => {
  if (wasmPrefetch?.url !== url) {
    return undefined;
  }
  const loaded = await wasmPrefetch.promise;
  return loaded?.blobUrl;
};

export const releasePrewarmedWasm = (): void => {
  const current = wasmPrefetch;
  wasmPrefetch = null;
  void current?.promise.then((loaded) => {
    if (loaded) {
      URL.revokeObjectURL(loaded.blobUrl);
    }
  });
};

export const prewarmEngine = (search: string): void => {
  if (prewarmed) {
    return;
  }
  prewarmed = true;
  void (async () => {
    const resolved = await resolveEngine(search);
    if (!resolved) {
      return;
    }
    try {
      await importEngine(resolved.entry);
    } catch {}
    await prefetchEngineWasm(resolved.wasm.url);
  })();
};

/**
 * エンジンの中の wisp-js は評価時の WebSocket を持ち続けるので、その前に WISP のトークンの差し替えを仕込む。
 */
export const importEngine = (entry: string): Promise<GeckoModule> => {
  installWispTokenRewrite();
  return import(/* @vite-ignore */ entry) as Promise<GeckoModule>;
};
