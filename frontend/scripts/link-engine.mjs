#!/usr/bin/env node

import {spawnSync} from "node:child_process";
import {createHash} from "node:crypto";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import {tmpdir} from "node:os";
import {dirname, isAbsolute, join, resolve} from "node:path";
import {fileURLToPath} from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ENGINE_DIR = join(projectRoot, "engine-local");
const DIR_PATTERN = /^[\w.-]+$/;

const USAGE = `使い方: pnpm engine:link -- --from <gecko.js/dist | firefox-wasm のリポジトリ | *.tar.gz> [--name <dir>] [--no-default]`;

const fail = (message) => {
  console.error(`\n  ✗ ${message}\n`);
  console.error(`${USAGE}\n`);
  process.exit(1);
};

const parseArgs = (argv) => {
  let from = null;
  let name = null;
  let makeDefault = true;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--from" || arg === "-f") {
      from = argv[index + 1] ?? null;
      index += 1;
    } else if (arg === "--name") {
      name = argv[index + 1] ?? null;
      index += 1;
    } else if (arg === "--no-default") {
      makeDefault = false;
    } else if (arg === "--help" || arg === "-h") {
      console.log(USAGE);
      process.exit(0);
    } else if (!from) {
      from = arg;
    }
  }
  return {from, name, makeDefault};
};

const expandIfArchive = (path) => {
  if (!/\.(tar\.gz|tgz)$/i.test(path)) {
    return path;
  }
  const target = mkdtempSync(join(tmpdir(), "gecko-link-"));
  const result = spawnSync("tar", ["-xzf", path, "-C", target], {
    stdio: "inherit",
  });
  if (result.status !== 0) {
    fail(`展開に失敗しました: ${path}`);
  }
  return target;
};

const resolveDist = (from) => {
  const trimmed = from.replace(/\/+$/, "");
  for (const candidate of [
    trimmed,
    join(trimmed, "gecko.js", "dist"),
    join(trimmed, "dist"),
  ]) {
    const entry = join(candidate, "gecko.js");
    if (existsSync(entry) && statSync(entry).isFile()) {
      return resolve(candidate);
    }
  }
  return null;
};

const findWasm = (dist) => {
  const zst = join(dist, "gecko.wasm.zst");
  if (existsSync(zst)) {
    return {path: zst, name: "gecko.wasm.zst", compressed: true};
  }
  const raw = join(dist, "gecko.wasm");
  if (existsSync(raw)) {
    return {path: raw, name: "gecko.wasm", compressed: false};
  }
  return null;
};

const {from, name: nameArg, makeDefault} = parseArgs(process.argv.slice(2));
if (!from) {
  fail("--from がありません: どこからビルド成果物を取るのか分かりません");
}

const fromPath = isAbsolute(from) ? from : resolve(process.cwd(), from);
if (!existsSync(fromPath)) {
  fail(`パスが存在しません: ${fromPath}`);
}

const dist = resolveDist(expandIfArchive(fromPath));
if (!dist) {
  fail(
    `${fromPath} に gecko.js が見つかりません。\n` +
      "    フォークのビルド済みリリースを使うのが最短です(最新のタグは releases ページで確認):\n" +
      "    curl -LO https://github.com/thirdlf03/firefox-wasm/releases/download/v0.0.9/gecko.js-v0.0.9.tar.gz\n" +
      "    pnpm engine:link -- --from gecko.js-v0.0.9.tar.gz",
  );
}

const wasm = findWasm(dist);
if (!wasm) {
  fail(
    `${dist} に gecko.wasm / gecko.wasm.zst がありません。成果物が不完全です`,
  );
}

const pkgPath = join(dist, "..", "package.json");
let version = "unknown";
if (existsSync(pkgPath)) {
  try {
    version = JSON.parse(readFileSync(pkgPath, "utf8")).version ?? "unknown";
  } catch {
    version = "unparsable";
  }
}
const wasmSha256 = createHash("sha256")
  .update(readFileSync(wasm.path))
  .digest("hex");

const dirName = nameArg ?? `v${version}`;
if (!DIR_PATTERN.test(dirName)) {
  fail(`--name は英数字と . _ - だけにしてください: ${dirName}`);
}

const target = join(ENGINE_DIR, dirName);
mkdirSync(target, {recursive: true});
copyFileSync(join(dist, "gecko.js"), join(target, "gecko.js"));
copyFileSync(wasm.path, join(target, wasm.name));
const typings = join(dist, "index.d.ts");
if (existsSync(typings)) {
  copyFileSync(typings, join(target, "index.d.ts"));
}

const manifest = {
  entry: `/engine/${dirName}/gecko.js`,
  wasm: {url: `/engine/${dirName}/${wasm.name}`, compressed: wasm.compressed},
  version,
  wasmSha256,
  builtAt: new Date().toISOString(),
};
writeFileSync(
  join(target, "manifest.json"),
  `${JSON.stringify(manifest, null, 2)}\n`,
);

const versionsPath = join(ENGINE_DIR, "versions.json");
const versions = existsSync(versionsPath)
  ? JSON.parse(readFileSync(versionsPath, "utf8"))
  : [];
const rest = versions.filter((entry) => entry.dir !== dirName);
writeFileSync(
  versionsPath,
  `${JSON.stringify([...rest, {dir: dirName, version, wasm: wasm.name}], null, 2)}\n`,
);

if (makeDefault) {
  copyFileSync(
    join(target, "manifest.json"),
    join(ENGINE_DIR, "manifest.json"),
  );
}

console.log(
  `\n  ✓ エンジンを取り込みました: engine-local/${dirName}/ (${version})`,
);
console.log(`    wasm: ${wasm.name}（sha256 ${wasmSha256.slice(0, 12)}…）`);
console.log(
  makeDefault
    ? "    既定のエンジンに設定しました（engine-local/manifest.json）"
    : "    既定は変えていません",
);
console.log("    次は pnpm dev で起動し、PC の前に立って使ってください。\n");
