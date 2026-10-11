import {createRequire} from "node:module";
import {dirname, join, resolve} from "node:path";
import {fileURLToPath, pathToFileURL} from "node:url";

export const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
export const FRONTEND = join(REPO, "frontend");
export const DIST = process.env.PERF_DIST ?? join(FRONTEND, ".cloudflare/output/v0/workers/default/assets");
export const PERF = join(REPO, "perf");

const requireFromFrontend = createRequire(join(FRONTEND, "package.json"));

export const importFromFrontend = async (name) => {
  const entry = requireFromFrontend.resolve(name);
  const mod = await import(pathToFileURL(entry).href);
  return mod.default?.chromium ? mod.default : mod;
};

export const CHROME_PATH =
  process.env.CHROME_PATH ??
  join(
    process.env.HOME,
    "Library/Caches/ms-playwright/chromium-1243/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing",
  );
