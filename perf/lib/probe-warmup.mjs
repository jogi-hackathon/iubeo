// ウォームアップの経過を見る(計測用ビルドの globalThis.__warmLog)。構成が最後に変わった時刻と、待ちの床(500ms)の関係を出す
// 使い方: PERF_DIST=<計測用ビルド> node perf/lib/probe-warmup.mjs --query "scene=room" --net regular4g --runs 3
import {CHROME_PATH, DIST, importFromFrontend} from "./paths.mjs";
import {serveDir} from "./serve.mjs";
import {parseArgs} from "./util.mjs";

const args = parseArgs(process.argv.slice(2), {query: "scene=room", net: "none", runs: "3"});
const NET = {regular4g: {downloadThroughput: 500000, uploadThroughput: 375000, latency: 40}};
const {chromium} = await importFromFrontend("playwright-core");
const srv = await serveDir(DIST);
try {
  for (let i = 0; i < Number(args.runs); i++) {
    const browser = await chromium.launch({executablePath: CHROME_PATH, headless: true, args: ["--enable-unsafe-webgpu", "--enable-features=WebGPU", "--ignore-gpu-blocklist"]});
    const page = await browser.newPage({viewport: {width: 1280, height: 800}});
    if (NET[args.net]) {
      const cdp = await page.context().newCDPSession(page);
      await cdp.send("Network.enable");
      await cdp.send("Network.emulateNetworkConditions", {offline: false, ...NET[args.net]});
    }
    await page.goto(`${srv.url}/?${args.query}`);
    await page.waitForFunction(() => document.querySelector("canvas") && !document.querySelector(".boot-overlay"), null, {timeout: 120000, polling: 20});
    const overlayGone = await page.evaluate(() => performance.now());
    const log = await page.evaluate(() => globalThis.__warmLog ?? []);
    const start = log.find((e) => e[0] === "start")?.[1] ?? 0;
    const changes = log.filter((e) => e[0] === "changed");
    const heldEvents = log.filter((e) => e[0] === "held");
    const lastChange = changes.length ? changes[changes.length - 1][1] - start : 0;
    const lastHeld = heldEvents.length ? heldEvents[heldEvents.length - 1][1] - start : 0;
    console.log(`run ${i + 1}: 開始 ${start.toFixed(0)}ms / 構成の変化 ${changes.length} 回(最後 +${lastChange.toFixed(0)}ms、mesh/材質 ${changes.at(-1)?.[2] ?? 0}) / hold 最後 +${lastHeld.toFixed(0)}ms / 被せが消えた +${(overlayGone - start).toFixed(0)}ms`);
    console.log("   変化の時刻: " + changes.map((e) => `+${(e[1] - start).toFixed(0)}`).join(" "));
    await browser.close();
  }
} finally {
  await srv.close();
}
