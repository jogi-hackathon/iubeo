import {mkdirSync, writeFileSync} from "node:fs";
import {join} from "node:path";
import {DIST, CHROME_PATH, PERF, importFromFrontend} from "./paths.mjs";
import {serveDir} from "./serve.mjs";
import {parseArgs, percentile, mean} from "./util.mjs";

const args = parseArgs(process.argv.slice(2), {label: "adhoc", runs: "3", seconds: "8", move: false, uncapped: false, net: "none", cpu: "1", dpr: "1", query: "", url: "", repeat: false});
const NET_PRESETS = {
  none: null,
  regular4g: {downloadThroughput: (4 * 1000 * 1000) / 8, uploadThroughput: (3 * 1000 * 1000) / 8, latency: 40},
  fast3g: {downloadThroughput: (1.6 * 1000 * 1000) / 8, uploadThroughput: (0.75 * 1000 * 1000) / 8, latency: 150},
};
if (!(args.net in NET_PRESETS)) throw new Error(`--net は ${Object.keys(NET_PRESETS).join(" / ")}`);
const runs = Number(args.runs);
const seconds = Number(args.seconds);
const outDir = join(PERF, "results", args.label);
mkdirSync(outDir, {recursive: true});

const {chromium} = await importFromFrontend("playwright-core");
const srv = args.url ? null : await serveDir(DIST);
const baseUrl = (args.url || srv.url) + (args.query ? `/?${args.query}` : "");

const INIT = `
(() => {
  window.__perf = {longTasks: [], readyAt: null, bootGoneAt: null, overlayGoneAt: null};
  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) window.__perf.longTasks.push(e.duration);
    }).observe({type: "longtask", buffered: true});
  } catch (_) {}
  const check = () => {
    const p = window.__perf;
    // 起動画面(正常時は BootError の .boot-screen だけが出る)。ウォームアップの覆いは .cover-overlay
    const boot = document.querySelector(".boot-screen");
    const cover = document.querySelector('.cover-overlay[data-covered="true"]');
    if (p.bootGoneAt === null && !boot && document.querySelector("canvas")) p.bootGoneAt = performance.now();
    if (p.bootGoneAt !== null && p.overlayGoneAt === null && !cover) {
      p.overlayGoneAt = performance.now();
      p.readyAt = p.overlayGoneAt;
      return;
    }
    requestAnimationFrame(check);
  };
  requestAnimationFrame(check);
})();
`;

const CHROME_ARGS = [
  "--enable-unsafe-webgpu",
  "--enable-features=WebGPU",
  "--ignore-gpu-blocklist",
  ...(args.uncapped ? ["--disable-gpu-vsync", "--disable-frame-rate-limit"] : []),
];

const runOnce = async (browser, index) => {
  const context = await browser.newContext({viewport: {width: 1280, height: 800}, deviceScaleFactor: Number(args.dpr)});
  const page = await context.newPage();
  await page.addInitScript(INIT);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  const cdp = await context.newCDPSession(page);
  await cdp.send("Performance.enable");
  if (NET_PRESETS[args.net]) {
    await cdp.send("Network.enable");
    await cdp.send("Network.emulateNetworkConditions", {offline: false, ...NET_PRESETS[args.net]});
  }
  if (Number(args.cpu) > 1) await cdp.send("Emulation.setCPUThrottlingRate", {rate: Number(args.cpu)});

  if (args.repeat) {
    await page.goto(baseUrl, {waitUntil: "load"});
    await page.waitForFunction(() => window.__perf?.readyAt !== null, null, {timeout: 120000, polling: 50});
    await page.waitForTimeout(500);
  }
  const navStart = Date.now();
  await page.goto(baseUrl, {waitUntil: "load"});
  await page.waitForFunction(() => window.__perf?.readyAt !== null, null, {timeout: 120000, polling: 50});
  const ready = await page.evaluate(() => ({bootGoneAt: window.__perf.bootGoneAt, readyAt: window.__perf.readyAt}));
  const readyMsWall = Date.now() - navStart;

  await page.waitForTimeout(1500);

  const beforeMetrics = await cdp.send("Performance.getMetrics");
  await page.evaluate(() => {
    window.__perf.longTasks = [];
    window.__frames = [];
    const tick = (t) => {
      window.__frames.push(t);
      window.__frameLoop = requestAnimationFrame(tick);
    };
    window.__frameLoop = requestAnimationFrame(tick);
  });
  if (args.move) await page.keyboard.down("KeyW");
  await page.waitForTimeout(seconds * 1000);
  if (args.move) await page.keyboard.up("KeyW");
  const sample = await page.evaluate(() => {
    cancelAnimationFrame(window.__frameLoop);
    const f = window.__frames;
    const deltas = [];
    for (let i = 1; i < f.length; i++) deltas.push(f[i] - f[i - 1]);
    return {frames: f.length, deltas, longTasks: window.__perf.longTasks};
  });
  const afterMetrics = await cdp.send("Performance.getMetrics");
  const m = (list, name) => list.metrics.find((x) => x.name === name)?.value ?? 0;

  const resources = await page.evaluate(() =>
    performance.getEntriesByType("resource").map((r) => ({
      name: r.name.replace(location.origin, ""),
      type: r.initiatorType,
      transfer: r.transferSize,
      encoded: r.encodedBodySize,
      decoded: r.decodedBodySize,
    })),
  );
  const navTiming = await page.evaluate(() => {
    const n = performance.getEntriesByType("navigation")[0];
    return {domContentLoaded: n.domContentLoadedEventEnd, load: n.loadEventEnd};
  });

  const deltas = sample.deltas;
  const sorted = [...deltas].sort((a, b) => a - b);
  const window_ = seconds;
  const result = {
    run: index,
    mode: {move: args.move, uncapped: args.uncapped, net: args.net, cpu: Number(args.cpu), dpr: Number(args.dpr), query: args.query, repeat: args.repeat, seconds},
    bootGoneMs: ready.bootGoneAt,
    readyMs: ready.readyAt,
    readyWallMs: readyMsWall,
    domContentLoadedMs: navTiming.domContentLoaded,
    loadMs: navTiming.load,
    fps: sample.frames / window_,
    frame: {
      meanMs: mean(deltas),
      p50Ms: percentile(sorted, 50),
      p95Ms: percentile(sorted, 95),
      p99Ms: percentile(sorted, 99),
      over33ms: deltas.filter((d) => d > 33.4).length,
    },
    longTasks: {count: sample.longTasks.length, totalMs: sample.longTasks.reduce((a, b) => a + b, 0)},
    cdp: {
      jsHeapUsedMB: m(afterMetrics, "JSHeapUsedSize") / 1048576,
      scriptMsPerSec: ((m(afterMetrics, "ScriptDuration") - m(beforeMetrics, "ScriptDuration")) * 1000) / window_,
      layoutMsPerSec: ((m(afterMetrics, "LayoutDuration") - m(beforeMetrics, "LayoutDuration")) * 1000) / window_,
      taskMsPerSec: ((m(afterMetrics, "TaskDuration") - m(beforeMetrics, "TaskDuration")) * 1000) / window_,
    },
    transfer: {
      requests: resources.length,
      totalBytes: resources.reduce((a, r) => a + r.transfer, 0),
      jsBytes: resources.filter((r) => r.name.endsWith(".js")).reduce((a, r) => a + r.transfer, 0),
      cssBytes: resources.filter((r) => r.name.endsWith(".css")).reduce((a, r) => a + r.transfer, 0),
    },
    errors: errors.slice(0, 5),
  };
  await context.close();
  return result;
};

const results = [];
try {
  {
    const warm = await chromium.launch({executablePath: CHROME_PATH, headless: true, args: CHROME_ARGS});
    try {
      await runOnce(warm, 0);
    } finally {
      await warm.close();
    }
  }
  for (let i = 1; i <= runs; i++) {
    const browser = await chromium.launch({executablePath: CHROME_PATH, headless: true, args: CHROME_ARGS});
    let r;
    try {
      r = await runOnce(browser, i);
    } finally {
      await browser.close();
    }
    results.push(r);
    writeFileSync(join(outDir, `browser-run-${i}.json`), JSON.stringify(r, null, 2));
    console.log(
      `run ${i}: ready ${r.readyMs.toFixed(0)}ms(boot gone ${r.bootGoneMs.toFixed(0)}) fps ${r.fps.toFixed(1)} ` +
        `frame p50 ${r.frame.p50Ms.toFixed(1)} p95 ${r.frame.p95Ms.toFixed(1)} p99 ${r.frame.p99Ms.toFixed(1)} ` +
        `longTasks ${r.longTasks.count}/${r.longTasks.totalMs.toFixed(0)}ms heap ${r.cdp.jsHeapUsedMB.toFixed(1)}MB ` +
        `js ${(r.transfer.jsBytes / 1024).toFixed(0)}KB errors ${r.errors.length}`,
    );
  }
} finally {
  await srv?.close();
}
