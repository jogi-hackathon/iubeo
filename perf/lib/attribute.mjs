// 描画コストの内訳(効果ごとの差分)。開発サーバー上で、ポストプロセスの設定を 1 つずつ変えて、
// 上限なしの fps(=1 フレームの実コスト)を比べる。設定は app と同じモジュールを import() して変える(dev のみ)
// 使い方: node perf/lib/attribute.mjs --url http://localhost:5173 --dpr 2 --seconds 4 --runs 2
import {CHROME_PATH, DIST, importFromFrontend} from "./paths.mjs";
import {serveDir} from "./serve.mjs";
import {parseArgs, median} from "./util.mjs";

const args = parseArgs(process.argv.slice(2), {url: "", dpr: "2", seconds: "4", runs: "2", scene: "", only: ""});
const SCENARIOS = [
  ["ベース", {}],
  ["AO(GTAO)オフ", {ao: {enabled: false}}],
  ["AO のデノイズオフ", {ao: {denoise: false}}],
  ["AO の解像度 1/4", {ao: {resolutionScale: 0.25}}],
  ["ブルームオフ", {bloom: {enabled: false}}],
  ["ビネットオフ", {vignette: {enabled: false}}],
  ["空のノイズオフ", {skyNoise: {enabled: false}}],
  ["ピクセレート オン", {pixelate: {enabled: true}}],
  ["ポストプロセス全体オフ", {enabled: false}],
  ["ベース(後)", {}],
];
const {chromium} = await importFromFrontend("playwright-core");
// url 未指定なら計測用ビルド(PERF_DIST)を配る。指定があれば dev サーバーなどに直接つなぐ
const srv = args.url ? null : await serveDir(DIST);
const baseUrl = args.url || srv.url;
const browser = await chromium.launch({executablePath: CHROME_PATH, headless: true,
  args: ["--enable-unsafe-webgpu", "--enable-features=WebGPU", "--ignore-gpu-blocklist", "--disable-gpu-vsync", "--disable-frame-rate-limit"]});
const results = new Map(SCENARIOS.map(([n]) => [n, []]));
try {
  for (let run = 0; run < Number(args.runs); run++) {
    const page = await browser.newPage({viewport: {width: 1280, height: 800}, deviceScaleFactor: Number(args.dpr)});
    await page.goto(baseUrl + (args.scene ? `?scene=${args.scene}` : ""));
    await page.waitForFunction(() => document.querySelector("canvas") && !document.querySelector('.cover-overlay[data-covered="true"]'), null, {timeout: 300000});
    await page.waitForTimeout(1500);
    for (const [name, patch] of SCENARIOS) {
      const fps = await page.evaluate(async ([patch, secs]) => {
        const mod = globalThis.__pp ?? (await import("/src/camera/postprocess/settings.ts"));
        // 毎回、既定値に戻してから変える(変更は積み上がるため)
        mod.updatePostProcessSettings(structuredClone(mod.DEFAULT_POSTPROCESS_SETTINGS));
        await new Promise((r) => setTimeout(r, 300));
        mod.updatePostProcessSettings(patch);
        await new Promise((r) => setTimeout(r, 600));
        let n = 0;
        let id;
        const t = () => { n++; id = requestAnimationFrame(t); };
        id = requestAnimationFrame(t);
        await new Promise((r) => setTimeout(r, secs * 1000));
        cancelAnimationFrame(id);
        return n / secs;
      }, [patch, Number(args.seconds)]);
      results.get(name).push(fps);
      console.log(`run ${run + 1} ${name}: ${fps.toFixed(0)} fps`);
    }
    await page.evaluate(async () => {
      const mod = globalThis.__pp ?? (await import("/src/camera/postprocess/settings.ts"));
      mod.updatePostProcessSettings({enabled: true, bloom: {enabled: true}, vignette: {enabled: true}, skyNoise: {enabled: true}, pixelate: {enabled: false}, ao: {enabled: true, denoise: true, resolutionScale: 0.5}});
    });
    await page.close();
  }
} finally {
  await browser.close();
  await srv?.close();
}
console.log(`\n== 中央値(dpr ${args.dpr}, 上限なし)`);
const base = median([...results.get("ベース"), ...results.get("ベース(後)")]);
const baseMs = 1000 / base;
console.log("ベース(前後の値): " + results.get("ベース").map((x) => x.toFixed(0)).join(",") + " / " + results.get("ベース(後)").map((x) => x.toFixed(0)).join(","));
for (const [name] of SCENARIOS) {
  const f = median(results.get(name));
  const ms = 1000 / f;
  console.log(`${name.padEnd(16)} ${f.toFixed(0).padStart(5)} fps  ${ms.toFixed(2).padStart(6)} ms/frame  差 ${(ms - baseMs >= 0 ? "+" : "")}${(ms - baseMs).toFixed(2)} ms`);
}
