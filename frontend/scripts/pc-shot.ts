// PC の 3D モデルを、ゲームと同じライト・同じ CRT マテリアルで撮る。
// Vite の dev サーバーを空きポートで起動し、インストール済みの Google Chrome をヘッドレスで開いて
// pc.html を撮る。3 視点（正面・斜め・モニタ接写）が 1 枚に入る。
//
// 使い方: pnpm shot:pc --out=<path> [--timeout=120] [--headed]
//   --out      書き出す PNG（frontend/ からの相対、または絶対パス）
//   --timeout  待つ秒数（既定 120）
//   --headed   ヘッドありで起動（デバッグ用）
import net from "node:net";
import path from "node:path";
import {fileURLToPath} from "node:url";

import {chromium} from "playwright-core";
import {createServer} from "vite";

interface Options {
  out: string;
  timeout: number;
  headed: boolean;
}

const HERE = fileURLToPath(new URL("../", import.meta.url));

const parseArgs = (argv: string[]): Options => {
  const opts: Options = {out: "", timeout: 120, headed: false};
  for (const arg of argv) {
    const [key, value = ""] = arg.replace(/^--/, "").split(/=(.*)/s);
    if (key === "out") {
      opts.out = value;
    } else if (key === "timeout") {
      opts.timeout = Number(value);
    } else if (key === "headed") {
      opts.headed = true;
    } else {
      throw new Error(`不明な引数: ${arg}`);
    }
  }
  if (!opts.out) {
    throw new Error("--out=<path> を指定してください");
  }
  return opts;
};

// 空きポートを探す（起動中の他の dev サーバーとは衝突させない）
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

// ヘッドレス Chrome で WebGPU を使うためのフラグ（scripts/bake-ao.ts と同じ）
const chromeFlags = (): string[] =>
  process.platform === "linux"
    ? [
        "--enable-unsafe-webgpu",
        "--enable-features=Vulkan",
        "--use-angle=vulkan",
        "--disable-vulkan-surface",
      ]
    : ["--enable-unsafe-webgpu"];

const main = async (): Promise<number> => {
  let opts: Options;
  try {
    opts = parseArgs(process.argv.slice(2));
  } catch (e) {
    console.error(`[pc-shot] ${e instanceof Error ? e.message : String(e)}`);
    return 2;
  }
  const out = path.resolve(HERE, opts.out);
  const port = await findFreePort();
  const server = await createServer({
    root: HERE,
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
    browser = await chromium.launch({
      channel: "chrome",
      headless: !opts.headed,
      args: chromeFlags(),
    });
    const page = await browser.newPage({
      viewport: {width: 1680, height: 500},
      deviceScaleFactor: 1,
    });
    page.on("pageerror", (e) => console.log(`[page:pageerror] ${e.message}`));
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        console.log(`[page:error] ${msg.text()}`);
      }
    });

    const url = `http://127.0.0.1:${port}/pc.html`;
    console.log(`[pc-shot] open ${url}`);
    await page.goto(url);
    await page.waitForFunction(
      () => (globalThis as {__pcShotReady?: boolean}).__pcShotReady === true,
      null,
      {timeout: opts.timeout * 1000, polling: 200},
    );
    const shots = page.locator("#shots");
    await shots.screenshot({path: out});
    console.log(`[pc-shot] wrote ${out}`);
    return 0;
  } catch (e) {
    console.error(`[pc-shot] ${e instanceof Error ? e.message : String(e)}`);
    return 1;
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
    await server.close().catch(() => {});
  }
};

process.exit(await main());
