// 起動の DOM の推移を見る(boot 画面・ウォームアップの被せ・canvas がいつ出入りするか)
import {serveDir} from "./serve.mjs";
import {CHROME_PATH, DIST, importFromFrontend} from "./paths.mjs";

const {chromium} = await importFromFrontend("playwright-core");
const srv = await serveDir(DIST);
const browser = await chromium.launch({executablePath: CHROME_PATH, headless: true,
  args: ["--enable-unsafe-webgpu", "--enable-features=WebGPU", "--ignore-gpu-blocklist"]});
const page = await browser.newPage();
await page.addInitScript(() => {
  window.__tl = [];
  let last = "";
  const f = () => {
    const s = [
      document.querySelector(".boot-screen") ? "boot" : "-",
      document.querySelector(".boot-overlay") ? "overlay" : "-",
      document.querySelector("canvas") ? "canvas" : "-",
      document.querySelector(".boot-screen p:nth-child(2)")?.textContent ?? "",
    ].join("|");
    if (s !== last) { window.__tl.push([Math.round(performance.now()), s]); last = s; }
    requestAnimationFrame(f);
  };
  requestAnimationFrame(f);
});
// 1 回目は圧縮キャッシュを温めるための捨て打ち(サーバーの初回だけ時間がかかる)
await page.goto(srv.url);
await page.waitForFunction(() => document.querySelector("canvas"), null, {timeout: 120000});
await page.waitForTimeout(1500);
await page.reload();
await page.waitForFunction(() => document.querySelector(".boot-overlay") === null && document.querySelector("canvas") && document.querySelector(".boot-screen") === null && performance.now() > 50, null, {timeout: 120000, polling: 50});
await page.waitForTimeout(1500);
console.log((await page.evaluate(() => window.__tl)).map((x) => x.join("  ")).join("\n"));
await browser.close();
await srv.close();
