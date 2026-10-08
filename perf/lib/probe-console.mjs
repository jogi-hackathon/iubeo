// 起動時のコンソール(info 以上)とページのエラーを出す。ベイク AO が貼られたかの確認用
import {CHROME_PATH, DIST, importFromFrontend} from "./paths.mjs";
import {serveDir} from "./serve.mjs";
const query = process.argv[2] ? `/?${process.argv[2]}` : "";
const {chromium} = await importFromFrontend("playwright-core");
const srv = await serveDir(DIST);
const browser = await chromium.launch({executablePath: CHROME_PATH, headless: true, args: ["--enable-unsafe-webgpu", "--enable-features=WebGPU", "--ignore-gpu-blocklist"]});
try {
  const page = await browser.newPage();
  page.on("console", (m) => { if (m.type() !== "debug") console.log(`[${m.type()}] ${m.text()}`); });
  page.on("pageerror", (e) => console.log(`[pageerror] ${e.message}`));
  await page.goto(srv.url + query);
  await page.waitForFunction(() => document.querySelector("canvas") && !document.querySelector(".boot-overlay"), null, {timeout: 120000});
  await page.waitForTimeout(1000);
} finally { await browser.close(); await srv.close(); }
