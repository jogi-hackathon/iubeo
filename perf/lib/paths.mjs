// 計測で使うパスと、frontend の node_modules 上の依存の解決
import {createRequire} from "node:module";
import {dirname, join, resolve} from "node:path";
import {fileURLToPath, pathToFileURL} from "node:url";

export const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
export const FRONTEND = join(REPO, "frontend");
/** vite build の出力(cf の設定どおり。Worker の静的アセット) */
export const DIST = process.env.PERF_DIST ?? join(FRONTEND, ".cloudflare/output/v0/workers/default/assets");
export const PERF = join(REPO, "perf");

const requireFromFrontend = createRequire(join(FRONTEND, "package.json"));

/** frontend の node_modules にある ESM パッケージを読む */
export const importFromFrontend = async (name) => {
  const entry = requireFromFrontend.resolve(name);
  const mod = await import(pathToFileURL(entry).href);
  // CJS の entry を読むと名前付き export が default の下に入る
  return mod.default?.chromium ? mod.default : mod;
};

/** Playwright が入れた Chrome for Testing(WebGPU が使える版)。CHROME_PATH で上書きできる */
export const CHROME_PATH =
  process.env.CHROME_PATH ??
  join(
    process.env.HOME,
    "Library/Caches/ms-playwright/chromium-1243/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing",
  );
