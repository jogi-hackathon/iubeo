// ?debug の統計パネル(ドローコール・三角形数・GPU 時間)を読む。テストシーン(dev)の描画負荷の確認用
// 使い方: node perf/lib/read-stats.mjs --url "http://localhost:5173/?debug" --wait 4
import {CHROME_PATH, importFromFrontend} from "./paths.mjs";
import {parseArgs} from "./util.mjs";

const args = parseArgs(process.argv.slice(2), {url: "http://localhost:5173/?debug", wait: "4", uncapped: false, dpr: "1"});
const {chromium} = await importFromFrontend("playwright-core");
const flags = ["--enable-unsafe-webgpu", "--enable-features=WebGPU", "--ignore-gpu-blocklist", "--enable-dawn-features=allow_unsafe_apis,timestamp_query_inside_passes",
  ...(args.uncapped ? ["--disable-gpu-vsync", "--disable-frame-rate-limit"] : [])];
const browser = await chromium.launch({executablePath: CHROME_PATH, headless: true, args: flags});
try {
  const page = await browser.newPage({viewport: {width: 1280, height: 800}, deviceScaleFactor: Number(args.dpr)});
  await page.goto(args.url);
  await page.waitForFunction(() => document.querySelector("canvas") && !document.querySelector(".boot-overlay"), null, {timeout: 300000});
  await page.waitForTimeout(Number(args.wait) * 1000);
  console.log(`dpr ${args.dpr}`);
  console.log(await page.evaluate(() => [...document.querySelectorAll("pre")].map((p) => p.textContent).join("\n---\n")));
} finally {
  await browser.close();
}
