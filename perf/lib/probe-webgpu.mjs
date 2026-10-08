// 計測の前提確認: この Chromium で WebGPU が使えるか、アダプタを取れるかを見る(WebGPU は secure context のみ)
import {serveDir} from "./serve.mjs";
import {CHROME_PATH, importFromFrontend} from "./paths.mjs";
import {mkdtempSync, writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";

const {chromium} = await importFromFrontend("playwright-core");
const dir = mkdtempSync(join(tmpdir(), "probe-"));
writeFileSync(join(dir, "index.html"), "<p>x</p>");
const srv = await serveDir(dir);
const browser = await chromium.launch({
  executablePath: CHROME_PATH,
  headless: true,
  args: ["--enable-unsafe-webgpu", "--enable-features=WebGPU", "--ignore-gpu-blocklist"],
});
const page = await browser.newPage();
await page.goto(srv.url);
const r = await page.evaluate(async () => {
  const out = {secure: window.isSecureContext, hasGpu: !!navigator.gpu};
  if (navigator.gpu) {
    const a = await navigator.gpu.requestAdapter({featureLevel: "compatibility", powerPreference: "high-performance"});
    out.adapter = !!a;
    out.info = a?.info ? JSON.stringify(a.info) : null;
  }
  return out;
});
console.log(JSON.stringify(r, null, 2));
await browser.close();
await srv.close();
