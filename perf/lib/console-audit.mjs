import {CHROME_PATH, DIST, importFromFrontend} from "./paths.mjs";
import {serveDir} from "./serve.mjs";
import {parseArgs} from "./util.mjs";

const args = parseArgs(process.argv.slice(2), {
  url: "",
  dist: DIST,
  seconds: "15",
  click: false,
  debug: false,
  query: "",
});

const {chromium} = await importFromFrontend("playwright-core");
const srv = args.url ? null : await serveDir(args.dist);
const query = [args.query, args.debug ? "debug" : ""].filter(Boolean).join("&");
const base = (args.url || srv.url) + (query ? `/?${query}` : "");

const browser = await chromium.launch({
  executablePath: CHROME_PATH,
  headless: true,
  args: [
    "--enable-unsafe-webgpu",
    "--enable-features=WebGPU",
    "--ignore-gpu-blocklist",
    "--enable-logging=stderr",
    "--v=0",
  ],
});

const messages = [];
const failures = [];
let ctx;
try {
  ctx = await browser.newContext({viewport: {width: 1280, height: 800}, deviceScaleFactor: 1});
  const page = await ctx.newPage();
  const t0 = Date.now();
  page.on("console", (m) => {
    messages.push({kind: "console", type: m.type(), text: m.text(), loc: m.location(), at: Date.now() - t0});
  });
  page.on("pageerror", (e) => {
    messages.push({kind: "pageerror", type: "error", text: `${e.name}: ${e.message}`, stack: (e.stack ?? "").split("\n").slice(0, 4).join("\n"), at: Date.now() - t0});
  });
  page.on("requestfailed", (r) => {
    failures.push({url: r.url(), method: r.method(), failure: r.failure()?.errorText ?? "?"});
  });
  page.on("response", (r) => {
    if (r.status() >= 400) {
      failures.push({url: r.url(), method: r.request().method(), status: r.status()});
    }
  });

  await page.goto(base, {waitUntil: "load"});
  await page
    .waitForFunction(() => document.querySelector("canvas") && !document.querySelector('.cover-overlay[data-covered="true"]'), null, {timeout: 120000, polling: 50})
    .catch(() => console.log("(覆いが外れるのを待てなかった)"));
  if (args.click) {
    await page.mouse.click(640, 400);
    await page.keyboard.down("KeyW");
    await page.waitForTimeout(1200);
    await page.keyboard.up("KeyW");
  }
  await page.waitForTimeout(Number(args.seconds) * 1000);
} finally {
  await browser.close();
  await srv?.close();
}

const interesting = messages.filter((m) => m.type === "error" || m.type === "warning" || m.kind === "pageerror");
const counts = new Map();
for (const m of interesting) {
  const key = `${m.type} | ${m.text}`;
  counts.set(key, (counts.get(key) ?? 0) + 1);
}
console.log(`=== コンソール(エラー・警告) ${interesting.length} 件 / 種類 ${counts.size} ===`);
for (const [key, n] of [...counts.entries()].sort((a, b) => b[1] - a[1])) {
  const first = interesting.find((m) => `${m.type} | ${m.text}` === key);
  console.log(`  [${n}] (初回 ${first?.at}ms) ${key}`);
}
const locs = interesting.map((m) => m.loc?.url && `${m.loc.url}:${m.loc.lineNumber}`).filter(Boolean);
const uniqLocs = [...new Set(locs)];
if (uniqLocs.length) {
  console.log(`--- 出どころ ---`);
  for (const l of uniqLocs) console.log(`  ${l}`);
}
if (messages.some((m) => m.stack)) {
  console.log(`--- スタック ---`);
  for (const m of messages.filter((x) => x.stack)) console.log(`  ${m.text}\n${m.stack}\n`);
}
console.log(`=== 失敗したリクエスト ${failures.length} 件 ===`);
const fcounts = new Map();
for (const f of failures) {
  const key = `${f.status ?? f.failure} ${f.url.split("?")[0]}`;
  fcounts.set(key, (fcounts.get(key) ?? 0) + 1);
}
for (const [key, n] of [...fcounts.entries()].sort((a, b) => b[1] - a[1])) console.log(`  [${n}] ${key}`);

const all = messages.filter((m) => m.type !== "log" && m.type !== "info" && m.type !== "debug");
console.log(`(参考) log/info/debug 以外のコンソール ${all.length} 件、全部のコンソール ${messages.length} 件`);
