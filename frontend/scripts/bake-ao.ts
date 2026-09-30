// AO の GPU ベイクを1コマンドで完結させる。Vite の dev サーバー(vite.config.ts の保存プラグイン込み)を空きポートで起動し、
// インストール済みの Google Chrome をヘッドレスで起動して bake.html を開き、完了か失敗まで待つ。
// 結果は public/ao/<scene>.png / .bin に書かれ、ゲーム本体の BakedAO がそのまま読む(保存は dev サーバー側のプラグイン)。
// 使い方: pnpm bake:ao [--scene=test] [--timeout=300] [--allow-software] [--headed] [--chrome-arg=<flag>]
//   --scene           ベイクするシーン(src/scenes/index.ts のキー。既定 test)
//   --timeout         秒(既定 300)
//   --allow-software  ソフトウェア実装(SwiftShader など)の adapter でも続行する(既定は止める)
//   --headed          ヘッドありで起動(デバッグ用)
//   --chrome-arg      Chrome に渡す追加フラグ(複数指定可)
import net from "node:net";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import { createServer } from "vite";

interface Options {
  scene: string;
  timeout: number;
  allowSoftware: boolean;
  headed: boolean;
  chromeArgs: string[];
}

/** bake.html が完了時に window.__bakeResult に置く値(src/bake/page.tsx) */
interface BakeResult {
  ok: boolean;
  error?: string;
  files?: string[];
  timings?: Record<string, number>;
  adapter?: Record<string, unknown>;
  chartCount?: number;
  hiddenCount?: number;
  atlasW?: number;
  atlasH?: number;
}

const parseArgs = (argv: string[]): Options => {
  const opts: Options = {
    scene: "test",
    timeout: 300,
    allowSoftware: false,
    headed: false,
    chromeArgs: [],
  };
  for (const arg of argv) {
    const [key, value = ""] = arg.replace(/^--/, "").split(/=(.*)/s);
    if (key === "scene") opts.scene = value;
    else if (key === "timeout") opts.timeout = Number(value);
    else if (key === "allow-software") opts.allowSoftware = true;
    else if (key === "headed") opts.headed = true;
    else if (key === "chrome-arg") opts.chromeArgs.push(value);
    else throw new Error(`不明な引数: ${arg}`);
  }
  if (!/^[a-z0-9-]+$/i.test(opts.scene)) {
    throw new Error(
      `--scene は英数字とハイフンで指定してください: ${opts.scene}`,
    );
  }
  if (!(opts.timeout > 0))
    throw new Error("--timeout は正の秒数で指定してください");
  return opts;
};

// 空きポートを探す(起動中の他の dev サーバーとは衝突させない)
const findFreePort = (): Promise<number> =>
  new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.once("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const address = srv.address();
      const port = typeof address === "object" && address ? address.port : 0;
      srv.close(() => resolve(port));
    });
  });

// ヘッドレス Chrome で WebGPU を使うためのフラグ。macOS(Metal)はフラグ無しでも実 GPU で動く。
// Linux は Vulkan 経由の明示が必要(出典はファイル末尾)
const chromeFlags = (opts: Options): string[] => {
  const flags = ["--enable-unsafe-webgpu"];
  if (process.platform === "linux") {
    flags.push(
      "--enable-features=Vulkan",
      "--use-angle=vulkan",
      "--disable-vulkan-surface",
    );
  }
  return [...flags, ...opts.chromeArgs];
};

const sec = (ms: number) => `${(ms / 1000).toFixed(2)}s`;

const main = async (): Promise<number> => {
  let opts: Options;
  try {
    opts = parseArgs(process.argv.slice(2));
  } catch (e) {
    console.error(`[bake-ao] ${e instanceof Error ? e.message : String(e)}`);
    return 2;
  }
  const t0 = performance.now();
  const port = await findFreePort();
  const server = await createServer({
    root: fileURLToPath(new URL("../", import.meta.url)),
    logLevel: "warn",
    server: {
      host: "127.0.0.1",
      port,
      strictPort: true,
      hmr: false,
      watch: null,
    },
  });
  let browser: Awaited<ReturnType<typeof chromium.launch>> | null = null;
  try {
    await server.listen();
    console.log(`[bake-ao] vite dev server: http://127.0.0.1:${port}/`);
    try {
      browser = await chromium.launch({
        channel: "chrome",
        headless: !opts.headed,
        args: chromeFlags(opts),
      });
    } catch (e) {
      const first = String(e instanceof Error ? e.message : e).split("\n")[0];
      throw new Error(
        `Google Chrome を起動できません(インストール済みの Chrome が必要です。ブラウザのダウンロードはしません): ${first}`,
      );
    }
    console.log(
      `[bake-ao] chrome ${browser.version()} (${opts.headed ? "headed" : "headless"})`,
    );

    const page = await browser.newPage();
    page.on("console", (msg) => {
      const text = msg.text();
      if (text.startsWith("[bake]")) console.log(text);
      else if (msg.type() === "error" || msg.type() === "warning") {
        console.log(`[page:${msg.type()}] ${text}`);
      }
    });
    page.on("pageerror", (e) => console.log(`[page:pageerror] ${e.message}`));
    page.on("crash", () =>
      console.log("[page:crash] ページがクラッシュしました"),
    );

    const query = new URLSearchParams({ scene: opts.scene });
    if (opts.allowSoftware) query.set("allowSoftware", "1");
    const url = `http://127.0.0.1:${port}/bake.html?${query}`;
    console.log(`[bake-ao] open ${url} (timeout ${opts.timeout}s)`);
    await page.goto(url);

    let result: BakeResult;
    try {
      const handle = await page.waitForFunction(
        // ページ内で評価される関数。Node 側の型に window は無いので globalThis で参照する
        () => (globalThis as { __bakeResult?: unknown }).__bakeResult,
        null,
        { timeout: opts.timeout * 1000, polling: 250 },
      );
      result = (await handle.jsonValue()) as BakeResult;
    } catch (e) {
      const first = String(e instanceof Error ? e.message : e).split("\n")[0];
      throw new Error(`${opts.timeout} 秒以内に完了しませんでした: ${first}`);
    }
    if (!result.ok) throw new Error(`ベイク失敗: ${result.error}`);

    console.log(`[bake-ao] adapter: ${JSON.stringify(result.adapter)}`);
    const timings = Object.entries(result.timings ?? {})
      .map(([k, v]) => `${k}=${sec(v)}`)
      .join(" ");
    console.log(`[bake-ao] timings: ${timings}`);
    console.log(
      `[bake-ao] 完了 scene=${opts.scene} charts=${result.chartCount} hidden=${result.hiddenCount} atlas=${result.atlasW}x${result.atlasH} 全体 ${sec(performance.now() - t0)}`,
    );
    console.log(`[bake-ao] wrote ${(result.files ?? []).join(", ")}`);
    return 0;
  } catch (e) {
    console.error(`[bake-ao] ${e instanceof Error ? e.message : String(e)}`);
    return 1;
  } finally {
    if (browser) await browser.close().catch(() => {});
    await server.close().catch(() => {});
  }
};

process.exit(await main());

// ヘッドレス Chrome で WebGPU を有効にするフラグの出典:
// - https://developer.chrome.com/blog/supercharge-web-ai-testing
// - https://developer.chrome.com/docs/web-platform/webgpu/troubleshooting-tips
