#!/usr/bin/env node

import {spawnSync} from "node:child_process";
import {
  createWriteStream,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  statSync,
} from "node:fs";
import {dirname, join, resolve} from "node:path";
import {Readable} from "node:stream";
import {pipeline} from "node:stream/promises";
import {fileURLToPath} from "node:url";

import {
  REPO,
  RELEASES_LATEST_URL,
  isEngineUpToDate,
  pickGeckoArchiveAsset,
  releaseByTagUrl,
  versionFromTag,
} from "./engine-release.mjs";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDir, "..");
const ENGINE_DIR = join(projectRoot, "engine-local");
const CACHE_DIR = join(projectRoot, ".cache", "engine");
const LINK_SCRIPT = join(scriptDir, "link-engine.mjs");

const HELP = `Gecko エンジン (firefox-wasm) を GitHub Releases から取り込む

使い方:
  pnpm engine:setup [オプション]

オプション:
  --tag, -t <tag>   リリースタグを指定 (例: v0.0.9)。省略時は latest
  --force, -f       既に同じ版が入っていても再ダウンロード・再リンクする
  --no-default      link-engine と同様、既定の manifest.json を更新しない
  --help, -h        このヘルプ

例:
  pnpm engine:setup
  pnpm engine:setup -- --tag v0.0.9
  pnpm engine:setup -- --force

手元の dist / 別パスから取り込む場合は従来どおり:
  pnpm engine:link -- --from <path>`;

const fail = (message, {showHelp = false} = {}) => {
  console.error(`\n  ✗ ${message}\n`);
  if (showHelp) {
    console.error(`${HELP}\n`);
  }
  process.exit(1);
};

const parseArgs = (argv) => {
  let tag = null;
  let force = false;
  let makeDefault = true;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--tag" || arg === "-t") {
      tag = argv[index + 1] ?? null;
      index += 1;
    } else if (arg === "--force" || arg === "-f") {
      force = true;
    } else if (arg === "--no-default") {
      makeDefault = false;
    } else if (arg === "--help" || arg === "-h") {
      console.log(HELP);
      process.exit(0);
    } else {
      fail(`不明な引数: ${arg}`, {showHelp: true});
    }
  }
  return {tag, force, makeDefault};
};

const readInstalledVersion = () => {
  const manifestPath = join(ENGINE_DIR, "manifest.json");
  if (!existsSync(manifestPath)) {
    return null;
  }
  try {
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    return typeof manifest.version === "string" ? manifest.version : null;
  } catch {
    return null;
  }
};

/**
 * @param {string} url
 * @param {Record<string, string>} headers
 */
const fetchJson = async (url, headers) => {
  const response = await fetch(url, {headers, redirect: "follow"});
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `GitHub API ${response.status} ${response.statusText}: ${url}${
        body ? `\n${body.slice(0, 500)}` : ""
      }`,
    );
  }
  return response.json();
};

const githubHeaders = () => {
  const headers = {
    Accept: "application/vnd.github+json",
    "User-Agent": "iubeo-engine-setup",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
};

const downloadFile = async (url, destPath) => {
  mkdirSync(dirname(destPath), {recursive: true});
  const headers = {
    Accept: "application/octet-stream",
    "User-Agent": "iubeo-engine-setup",
  };
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  const response = await fetch(url, {headers, redirect: "follow"});
  if (!response.ok || !response.body) {
    throw new Error(
      `ダウンロードに失敗しました: HTTP ${response.status} ${response.statusText}\n  ${url}`,
    );
  }
  const tmpPath = `${destPath}.part`;
  await pipeline(Readable.fromWeb(response.body), createWriteStream(tmpPath));
  renameSync(tmpPath, destPath);
};

const formatBytes = (bytes) => {
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KiB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;
};

const runLink = (archivePath, makeDefault) => {
  const args = [LINK_SCRIPT, "--from", archivePath];
  if (!makeDefault) {
    args.push("--no-default");
  }
  const result = spawnSync(process.execPath, args, {
    stdio: "inherit",
    cwd: projectRoot,
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
};

const main = async () => {
  const {tag, force, makeDefault} = parseArgs(process.argv.slice(2));
  const headers = githubHeaders();

  console.log(`\n  → ${REPO} のリリース情報を取得しています…`);
  let release;
  try {
    release = tag
      ? await fetchJson(releaseByTagUrl(tag), headers)
      : await fetchJson(RELEASES_LATEST_URL, headers);
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
  }

  const releaseTag = release.tag_name;
  if (!releaseTag) {
    fail("リリースに tag_name がありません");
  }

  const asset = pickGeckoArchiveAsset(release.assets);
  if (!asset?.browser_download_url) {
    fail(
      `リリース ${releaseTag} に gecko.js-v*.tar.gz がありません。\n` +
        `  ${release.html_url ?? "https://github.com/" + REPO + "/releases"}`,
    );
  }

  const installed = readInstalledVersion();
  if (!force && makeDefault && isEngineUpToDate(installed, releaseTag)) {
    console.log(
      `\n  ✓ エンジンは既に最新です (${installed} · ${releaseTag})。`,
    );
    console.log(
      "    再取得する場合は pnpm engine:setup -- --force を実行してください。\n",
    );
    return;
  }

  mkdirSync(CACHE_DIR, {recursive: true});
  const cachePath = join(CACHE_DIR, asset.name);
  const needsDownload =
    force || !existsSync(cachePath) || statSync(cachePath).size === 0;

  if (needsDownload) {
    console.log(
      `  → ${asset.name} をダウンロード (${formatBytes(asset.size ?? 0)})…`,
    );
    try {
      await downloadFile(asset.browser_download_url, cachePath);
    } catch (error) {
      fail(error instanceof Error ? error.message : String(error));
    }
    console.log(`    保存先: ${cachePath}`);
  } else {
    console.log(`  → キャッシュを使用: ${cachePath}`);
  }

  console.log(
    `  → engine-local/ にリンク (${versionFromTag(releaseTag)} / ${releaseTag})…`,
  );
  runLink(cachePath, makeDefault);
};

main().catch((error) => {
  fail(error instanceof Error ? error.message : String(error));
});
