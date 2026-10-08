// 動作確認: ビルド済みアプリを開き、起動完了までの時間とスクリーンショットを見る
import {serveDir} from "./serve.mjs";
import {CHROME_PATH, DIST, importFromFrontend} from "./paths.mjs";
import {writeFileSync} from "node:fs";
import {join} from "node:path";

const {chromium} = await importFromFrontend("playwright-core");
const srv = await serveDir(DIST);
const browser = await chromium.launch({
  executablePath: CHROME_PATH,
  headless: true,
  args: ["--enable-unsafe-webgpu", "--enable-features=WebGPU", "--ignore-gpu-blocklist"],
});
const page = await browser.newPage({viewport: {width: 1280, height: 800}});
const logs = [];
page.on("console", (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on("pageerror", (e) => logs.push(`[pageerror] ${e.message}`));
const t0 = Date.now();
await page.goto(srv.url);
await page.waitForSelector(".boot-screen", {state: "detached", timeout: 60000}).catch((e) => logs.push("boot-screen wait: " + e.message));
const readyMs = Date.now() - t0;
await page.waitForTimeout(3000);
console.log("readyMs(approx)", readyMs);
await page.screenshot({path: join(process.env.TMPDIR ?? "/tmp", "probe-app.png")});
console.log(logs.slice(0, 30).join("\n"));
await browser.close();
await srv.close();
