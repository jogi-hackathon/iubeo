// 実行中の CPU プロファイル(CDP の Profiler)。起動後、一定時間の関数ごと・パッケージごとの自己時間を出す
// 使い方: node perf/lib/profile-scene.mjs --label x [--url http://localhost:5173] [--seconds 8] [--uncapped] [--move]
import {mkdirSync, writeFileSync} from "node:fs";
import {join} from "node:path";
import {CHROME_PATH, DIST, PERF, importFromFrontend} from "./paths.mjs";
import {serveDir} from "./serve.mjs";
import {parseArgs} from "./util.mjs";

const args = parseArgs(process.argv.slice(2), {label: "profile", url: "", seconds: "8", uncapped: false, move: false, query: "", dpr: "1"});
const seconds = Number(args.seconds);
const outDir = join(PERF, "results", args.label);
mkdirSync(outDir, {recursive: true});
const {chromium} = await importFromFrontend("playwright-core");
const srv = args.url ? null : await serveDir(DIST);
const url = (args.url || srv.url) + (args.query ? `/?${args.query}` : "");
const flags = ["--enable-unsafe-webgpu", "--enable-features=WebGPU", "--ignore-gpu-blocklist",
  ...(args.uncapped ? ["--disable-gpu-vsync", "--disable-frame-rate-limit"] : [])];
const browser = await chromium.launch({executablePath: CHROME_PATH, headless: true, args: flags});
try {
  const page = await browser.newPage({viewport: {width: 1280, height: 800}, deviceScaleFactor: Number(args.dpr)});
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(url);
  await page.waitForFunction(() => document.querySelector("canvas") && !document.querySelector('.cover-overlay[data-covered="true"]'), null, {timeout: 300000, polling: 100});
  await page.waitForTimeout(2000);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Profiler.enable");
  await cdp.send("Profiler.setSamplingInterval", {interval: 200});
  // フレーム数も同時に数える(プロファイラの影響込みの参考値)
  await page.evaluate(() => { window.__n = 0; const t = () => { window.__n++; window.__rafId = requestAnimationFrame(t); }; window.__rafId = requestAnimationFrame(t); });
  if (args.move) await page.keyboard.down("KeyW");
  await cdp.send("Profiler.start");
  await page.waitForTimeout(seconds * 1000);
  const {profile} = await cdp.send("Profiler.stop");
  if (args.move) await page.keyboard.up("KeyW");
  const frames = await page.evaluate(() => { cancelAnimationFrame(window.__rafId); return window.__n; });

  // 自己時間: サンプルごとに、その時点の関数へ、次のサンプルまでの時間を加える
  const nodeById = new Map(profile.nodes.map((n) => [n.id, n]));
  const selfUs = new Map();
  for (let i = 0; i < profile.samples.length; i++) {
    const dt = profile.timeDeltas[i + 1] ?? 0;
    selfUs.set(profile.samples[i], (selfUs.get(profile.samples[i]) ?? 0) + dt);
  }
  const total = [...selfUs.values()].reduce((a, b) => a + b, 0);
  const byFn = new Map();
  const byPkg = new Map();
  const pkgOf = (u) => {
    if (!u) return "(native/gc/idle)";
    const nm = u.lastIndexOf("node_modules/");
    if (nm >= 0) {
      const rest = u.slice(nm + 13).split("/");
      return rest[0].startsWith("@") ? `${rest[0]}/${rest[1]}` : rest[0];
    }
    const m = u.match(/\/src\/([^/]+)/);
    return m ? `src/${m[1]}` : u.split("/").pop();
  };
  for (const [id, us] of selfUs) {
    const n = nodeById.get(id);
    const cf = n.callFrame;
    const name = `${cf.functionName || "(anon)"} ${cf.url.split("/").pop()}:${cf.lineNumber + 1}`;
    byFn.set(name, (byFn.get(name) ?? 0) + us);
    const pkg = pkgOf(cf.url);
    byPkg.set(pkg, (byPkg.get(pkg) ?? 0) + us);
  }
  const top = (m, k) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, k).map(([name, us]) => ({name, pct: +(100 * us / total).toFixed(2), ms: +(us / 1000).toFixed(1)}));
  const result = {url, seconds, uncapped: args.uncapped, move: args.move, frames, fps: frames / seconds, errors: errors.slice(0, 3), totalSampledMs: +(total / 1000).toFixed(0), byPackage: top(byPkg, 25), byFunction: top(byFn, 40)};
  writeFileSync(join(outDir, "profile.json"), JSON.stringify(result, null, 2));
  console.log(`fps ${result.fps.toFixed(1)} (profiler on) errors ${errors.length}`);
  console.log("--- package");
  for (const r of result.byPackage.slice(0, 15)) console.log(`${String(r.pct).padStart(6)}%  ${r.name}`);
  console.log("--- function");
  for (const r of result.byFunction.slice(0, 25)) console.log(`${String(r.pct).padStart(6)}%  ${r.name}`);
} finally {
  await browser.close();
  await srv?.close();
}
