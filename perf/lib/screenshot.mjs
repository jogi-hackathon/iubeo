// 見た目の回帰チェック用のスクリーンショット。起動完了後、静止画と前進後の 2 枚を撮る
// 使い方: node perf/lib/screenshot.mjs <label>   → perf/results/<label>/shot-{still,moved}.png
import {mkdirSync} from "node:fs";
import {join} from "node:path";
import {CHROME_PATH, DIST, PERF, importFromFrontend} from "./paths.mjs";
import {serveDir} from "./serve.mjs";

const label = process.argv[2] ?? "adhoc";
const query = process.argv[3] ? `/?${process.argv[3]}` : "";
const outDir = join(PERF, "results", label);
mkdirSync(outDir, {recursive: true});

const {chromium} = await importFromFrontend("playwright-core");
const srv = await serveDir(DIST);
const browser = await chromium.launch({executablePath: CHROME_PATH, headless: true,
  args: ["--enable-unsafe-webgpu", "--enable-features=WebGPU", "--ignore-gpu-blocklist"]});
try {
  const page = await browser.newPage({viewport: {width: 1280, height: 800}, deviceScaleFactor: 1});
  await page.goto(srv.url + query);
  await page.waitForFunction(() => document.querySelector("canvas") && !document.querySelector('.cover-overlay[data-covered="true"]'), null, {timeout: 120000});
  await page.waitForTimeout(2000);
  await page.screenshot({path: join(outDir, "shot-still.png")});
  await page.keyboard.down("KeyW");
  await page.waitForTimeout(1000);
  await page.keyboard.up("KeyW");
  await page.waitForTimeout(1000);
  await page.screenshot({path: join(outDir, "shot-moved.png")});
  console.log(`saved ${outDir}/shot-{still,moved}.png`);
} finally {
  await browser.close();
  await srv.close();
}
