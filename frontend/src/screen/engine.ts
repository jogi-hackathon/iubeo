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

/**
 * エンジンの配信元（末尾の / を除く）。空なら同じオリジンの /engine/（開発時の既定）。
 * 本番は R2 の公開 URL を入れる（例: https://pub-xxxx.r2.dev）。マニフェストの中のパス（/engine/...）の前に付ける
 */
export const ENGINE_BASE_URL = (
  import.meta.env.VITE_ENGINE_BASE_URL ?? ""
).replace(/\/+$/, "");

/** マニフェストの中のパス（/engine/...）を、配信元を含めた URL にする */
export const engineUrl = (
  path: string,
  base: string = ENGINE_BASE_URL,
): string => (/^https?:\/\//.test(path) ? path : `${base}${path}`);

/**
 * 読みに行くマニフェストの候補。`?engine=<dir>` があればそのバージョン（<base>/engine/<dir>/）を
 * 先に見る。無ければ既定（<base>/engine/manifest.json）。
 */
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

/**
 * マニフェストが指す wasm をそのまま使う。
 *
 * 以前は「非圧縮の .wasm が同じ場所にあればそちらを使う」と HEAD で確かめていた(非圧縮ならブラウザが
 * application/wasm で配信するので instantiateStreaming が効き、zstd の展開も省ける)。
 * だが実際には圧縮版(.zst)しか置いていないので、HEAD は毎回 404 になり、往復 1 回とコンソールの
 * エラー(GET/HEAD の 404 はブラウザが必ずログに出す)を毎回払っていた。
 * どちらを置くかはパック側(scripts/link-engine.mjs の findWasm)が決めるので、ここでは推測しない。
 * 非圧縮の wasm を配れば instantiateStreaming の利益を得られる(そのときは compressed=false で来る)。
 */
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

/**
 * 先に取っておいた wasm。`blobUrl` をエンジンに渡すと、そのぶんのダウンロードを待たずに済む。
 * 取り中は `promise` を待つので、クリックと先取りで二重に落とすことはない
 */
type WasmPrefetch = {url: string; blobUrl: string};
let wasmPrefetch: {url: string; promise: Promise<WasmPrefetch | null>} | null =
  null;

/**
 * wasm を先に取っておく（すでに取っている・取っている最中なら、その約束を返す）。
 *
 * 33MB の wasm はブラウザの HTTP キャッシュに入らない（巨大なリソースは入れない決まりで、
 * 2 回目も丸ごと落ちてくる。実測: 912KB のファイルは 2 回目が 46ms で返るが、33MB は 2 回目も 94 秒）。
 * そのため「先に取っておく」にはバイト列を自分で持っておく必要があり、blob URL にして渡す。
 * 展開（zstd → 150MB）とコンパイルはクリック時にやる（そこまで抱え込むとメモリを圧迫するため）
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
      // 取れなくても普通に動く（クリック時にエンジンが自分で取りに行く）
      return null;
    }
  })();
  wasmPrefetch = {url, promise};
  return promise;
};

/**
 * 先に取っておいた（または取り中の）wasm の blob URL。無ければ undefined（呼び側はマニフェストの URL を使う）。
 * 取り中なら取れるまで待つ（クリックのときに二重に落とさないため）
 */
export const prewarmedWasmUrl = async (
  url: string,
): Promise<string | undefined> => {
  if (wasmPrefetch?.url !== url) {
    return undefined;
  }
  const loaded = await wasmPrefetch.promise;
  return loaded?.blobUrl;
};

/** 使い終わった先取りを解放する（33MB の blob を抱えたままにしない） */
export const releasePrewarmedWasm = (): void => {
  const current = wasmPrefetch;
  wasmPrefetch = null;
  void current?.promise.then((loaded) => {
    if (loaded) {
      URL.revokeObjectURL(loaded.blobUrl);
    }
  });
};

/**
 * エンジンの JS(埋め込み gecko.data を含む 13MB 級)を先に import しておく。クリック時の待ちが減る。
 * あわせて wasm も取りに行く(blob にして、クリックのときにエンジンへ渡す)。ページで 1 回だけやる
 */
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
    // クリック時の一番重い待ち（4G で 68 秒）を、起動の裏で済ませておく
    await prefetchEngineWasm(resolved.wasm.url);
  })();
};

/**
 * public/ 配下の素の URL として動的 import する。Vite に束ねさせないため @vite-ignore。
 * エンジンの中の wisp-js は評価時の WebSocket を持ち続けるので、その前に WISP のトークンの差し替えを仕込む
 */
export const importEngine = (entry: string): Promise<GeckoModule> => {
  installWispTokenRewrite();
  return import(/* @vite-ignore */ entry) as Promise<GeckoModule>;
};
