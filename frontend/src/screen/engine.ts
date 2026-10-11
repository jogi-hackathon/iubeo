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
 * エンジンの JS（埋め込み gecko.data を含む 13MB 級）を先に import しておく。クリック時の待ちが減る。
 * wasm 本体は取らない（localhost なら速く、抱え込むとメモリを圧迫するだけ）。ページで 1 回だけ取りに行く
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
