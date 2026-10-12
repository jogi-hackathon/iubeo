import {
  NO_MODIFIERS,
  type ScreenKeyEvent,
  type ScreenModifiers,
  type ScreenPointerEvent,
} from "../../display/types";
import {searchPageUrl} from "./browserChrome";
import {CanvasScreenSource} from "./CanvasScreenSource";
import {
  importEngine,
  prewarmedWasmUrl,
  releasePrewarmedWasm,
  resolveEngine,
} from "./engine";
import {
  isEngineCrashLine,
  isResumablePage,
  takeRestartBudget,
} from "./engineCrash";
import type {GeckoConstructor, GeckoInstance} from "./geckoTypes";
import {
  pageToDataUrl,
  searchStartPage,
  type WispState,
} from "./searchStartPage";
import {
  describeWispHost,
  resolveWispUrl,
  searchTokenFrom,
  setFreshWispUrl,
  type WispWatcher,
  watchWispUrl,
  wispOverrideFrom,
} from "./wispUrl";

/**
 * Gecko（Firefox のエンジン）を WebAssembly 化したものを、このタブの中で走らせる画面ソース。
 * サーバも無く、レイテンシもゼロ。
 *
 * エンジン自身の canvas をそのままテクスチャに流し、入力は合成 DOM イベントとして投げ返す。
 * こうするとエンジンの入力パイプラインをそのまま再利用でき、コマンドプロトコルを二重に実装せずに済む。
 *
 * エンジンは毎フレームのソフトウェア合成結果を 2D コンテキストへ putImageData で書くので、
 * そこを包んで dirty を立てる（エンジンの内部実装には触れない）。
 *
 * cross-origin isolation は必須（エンジンが pthread のため SharedArrayBuffer を使う）。
 * COOP: same-origin + COEP: require-corp を vite.config.ts が付与している。
 */

const PROGRESS_INTERVAL_MS = 1000;
const WISP_TIMEOUT_MS = 8000;
const WISP_COLD_START_TIMEOUT_MS = 90_000;

export class GeckoSource extends CanvasScreenSource {
  private engine: GeckoInstance | null = null;
  private ready = false;
  private gpuMode = false;
  private progressTimer?: number;
  private wispWatcher?: WispWatcher;
  private bootGeneration = 0;
  private restartHistory: number[] = [];
  private resumeUrl: string | null = null;
  private readonly wispOverride: string | undefined;
  private wispUrl?: string;
  private wispExpiresAt?: string;
  private wispState: WispState = "none";

  constructor(width: number, height: number, search: string) {
    super(width, height, "screen");
    this.wispOverride = wispOverrideFrom(search, import.meta.env.VITE_WISP_URL);
  }

  get liveSurface(): boolean {
    return this.gpuMode;
  }

  override async boot(): Promise<void> {
    if (this.status === "booting" || this.status === "ready") {
      return;
    }
    const generation = ++this.bootGeneration;
    const stale = (): boolean => generation !== this.bootGeneration;
    this.setStatus("booting", "エンジンを探しています");

    const resolved = await resolveEngine(location.search);
    if (stale()) {
      return;
    }
    if (!resolved) {
      this.setStatus(
        "unavailable",
        "engine-local/ にエンジンがありません。pnpm engine:setup を実行してください",
      );
      return;
    }

    let Gecko: GeckoConstructor | undefined;
    try {
      const module = await importEngine(resolved.entry);
      Gecko = module.Gecko ?? module.default;
    } catch (error) {
      if (stale()) {
        return;
      }
      this.setStatus(
        "error",
        `エンジンの読み込みに失敗しました: ${describe(error)}`,
      );
      return;
    }
    if (stale()) {
      return;
    }
    if (!Gecko) {
      this.setStatus("error", "エンジンのバンドルに Gecko クラスがありません");
      return;
    }

    this.patchBlitNotify();

    const env: Record<string, string> = {GECKO_COARSE_CLOCK: "1"};
    for (const [key, value] of new URLSearchParams(location.search)) {
      if (key.startsWith("env.")) {
        env[key.slice(4)] = value;
      }
    }
    this.gpuMode = !!env.GECKO_GPU;

    const sizeMb = resolved.wasm.compressed ? "34MB" : "150MB";
    const startedAt = performance.now();
    const progressTimer = window.setInterval(() => {
      const seconds = Math.round((performance.now() - startedAt) / 1000);
      this.setDetail(
        `エンジンを起動中… ${seconds} 秒（${sizeMb} の wasm を読み込んでいます）`,
      );
    }, PROGRESS_INTERVAL_MS);
    this.progressTimer = progressTimer;
    this.setStatus(
      "booting",
      `エンジンを起動中… 0 秒（${sizeMb} の wasm を読み込んでいます）`,
    );

    const wisp = await resolveWispUrl(this.wispOverride, fetch);
    if (stale()) {
      window.clearInterval(progressTimer);
      return;
    }
    this.wispUrl = wisp?.url;
    this.wispExpiresAt = wisp?.expiresAt;
    const usesToken = this.wispOverride === undefined && !!this.wispUrl;
    const wispCheck = this.wispUrl
      ? checkWisp(
          this.wispUrl,
          usesToken ? WISP_COLD_START_TIMEOUT_MS : WISP_TIMEOUT_MS,
        )
      : Promise.resolve(false);
    if (this.wispOverride === undefined) {
      this.watchWisp();
    }

    try {
      const prewarmed = await prewarmedWasmUrl(resolved.wasm.url);
      if (stale()) {
        return;
      }
      const engine = new Gecko({
        canvas: this.canvas,
        width: this.width,
        height: this.height,
        env,
        wasm: prewarmed ? {...resolved.wasm, url: prewarmed} : resolved.wasm,
        wispUrl: this.wispUrl,
        forwardInput: true,
        print: (line) => console.log("[gecko]", line),
        printErr: (line) => {
          console.warn("[gecko]", line);
          if (!stale() && isEngineCrashLine(line)) {
            this.restartAfterCrash();
          }
        },
      });
      this.engine = engine;

      await engine.init();
      if (stale()) {
        return;
      }
      if (prewarmed) {
        releasePrewarmedWasm();
      }
      await engine.resize(this.width, this.height);
      window.clearInterval(progressTimer);

      const wispOk = await wispCheck;
      if (stale()) {
        return;
      }
      const wispState: WispState = !this.wispUrl
        ? "none"
        : wispOk
          ? "ok"
          : "unreachable";
      this.wispState = wispState;
      const resume = wispState === "ok" ? this.resumeUrl : null;
      await engine.load(resume ?? this.homeUrl());
      if (stale()) {
        return;
      }

      this.ready = true;
      const versionTag = resolved.version ? ` v${resolved.version}` : "";
      const network = this.wispUrl
        ? wispOk
          ? `WISP 経由 ${describeWispHost(this.wispUrl)}`
          : `WISP プロキシ ${describeWispHost(this.wispUrl)} に接続できません`
        : "オフライン（検索結果は WISP が必要）";
      this.setStatus("ready", `Gecko エンジン${versionTag} · ${network}`);
    } catch (error) {
      if (stale()) {
        return;
      }
      this.engine?.destroy();
      this.engine = null;
      this.stopWispWatch();
      this.setStatus(
        "error",
        `エンジンの起動に失敗しました: ${describe(error)}`,
      );
    } finally {
      window.clearInterval(progressTimer);
    }
  }

  private stopProgress(): void {
    if (this.progressTimer !== undefined) {
      window.clearInterval(this.progressTimer);
      this.progressTimer = undefined;
    }
  }

  private watchWisp(): void {
    this.stopWispWatch();
    if (this.wispUrl) {
      setFreshWispUrl(this.wispUrl);
    }
    this.wispWatcher = watchWispUrl({
      expiresAt: this.wispExpiresAt,
      onUrl: (url) => {
        this.applyWispUrl(url);
      },
    });
  }

  private stopWispWatch(): void {
    this.wispWatcher?.stop();
    this.wispWatcher = undefined;
  }

  private applyWispUrl(url: string): void {
    const gained = this.wispUrl === undefined;
    this.wispUrl = url;
    setFreshWispUrl(url);
    if (gained) {
      this.rebootWithWisp();
    }
  }

  private rebootWithWisp(): void {
    if (this.status !== "booting" && this.status !== "ready") {
      return;
    }
    this.cancelBoot();
    this.status = "idle";
    this.boot().catch((error: unknown) => {
      this.setStatus(
        "error",
        `エンジンの再起動に失敗しました: ${describe(error)}`,
      );
    });
  }

  /**
   * エンジンが落ちた（wasm の RuntimeError など）ときに、作り直す。
   * 同じ失敗が続く場合は、回数の上限を超えた時点で止めてエラーを出す（無限に再起動しない）。
   */
  private restartAfterCrash(): void {
    const budget = takeRestartBudget(this.restartHistory, performance.now());
    this.restartHistory = budget.history;
    if (!budget.allowed) {
      this.cancelBoot();
      this.setStatus(
        "error",
        "エンジンが短時間に何度も停止したため、再起動を止めました",
      );
      return;
    }
    // 直前にも落ちていれば、そのページが原因の可能性が高い。読み直さずスタートページへ戻す
    if (budget.history.length > 1) {
      this.resumeUrl = null;
    }
    console.warn("[gecko] エンジンが停止したので再起動します");
    this.rebootWithWisp();
  }

  /** 今開いているページを覚えておく（エンジンが落ちたとき、同じページを読み直すため） */
  rememberPage(url: string): void {
    if (isResumablePage(url)) {
      this.resumeUrl = url;
    }
  }

  private cancelBoot(): void {
    this.bootGeneration++;
    this.stopProgress();
    this.engine?.destroy();
    this.engine = null;
    this.ready = false;
  }

  private setDetail(detail: string): void {
    this.statusDetail = detail;
    this.paintNotice();
    this.markDirty();
  }

  private patchBlitNotify(): void {
    const canvas = this.canvas as HTMLCanvasElement & {__blitPatched?: boolean};
    if (canvas.__blitPatched) {
      return;
    }
    canvas.__blitPatched = true;
    const origGetContext = canvas.getContext.bind(canvas);
    canvas.getContext = ((contextId: string, options?: unknown) => {
      const ctx = origGetContext(
        contextId as "2d",
        options as CanvasRenderingContext2DSettings | undefined,
      );
      if (
        contextId === "2d" &&
        ctx &&
        !(ctx as {__putPatched?: boolean}).__putPatched
      ) {
        const c2d = ctx as CanvasRenderingContext2D & {__putPatched?: boolean};
        const origPut = c2d.putImageData.bind(c2d);
        c2d.putImageData = ((
          ...args: Parameters<CanvasRenderingContext2D["putImageData"]>
        ) => {
          origPut(...args);
          this.markDirty();
        }) as typeof c2d.putImageData;
        c2d.__putPatched = true;
      }
      return ctx;
    }) as typeof canvas.getContext;
  }

  override pointer(event: ScreenPointerEvent): void {
    if (!this.ready) {
      return;
    }
    this.dispatchPointer(event);
    this.markDirty();
  }

  override wheel(
    dx: number,
    dy: number,
    x: number,
    y: number,
    modifiers: ScreenModifiers,
  ): void {
    if (!this.ready) {
      return;
    }
    this.dispatchWheel(dx, dy, x, y, modifiers);
    this.markDirty();
  }

  override key(event: ScreenKeyEvent): void {
    if (!this.ready) {
      return;
    }
    this.dispatchKey(withAccelAsCtrl(event));
    this.markDirty();
  }

  override insertText(text: string): void {
    if (!this.ready) {
      return;
    }
    for (const char of Array.from(text)) {
      const codePoint = char.codePointAt(0) ?? 0;
      if (codePoint === 0x0a || codePoint === 0x0d) {
        this.dispatchKey({
          type: "down",
          key: "Enter",
          keyCode: 13,
          charCode: 13,
          modifiers: NO_MODIFIERS,
        });
        continue;
      }
      this.dispatchKey({
        type: "down",
        key: char,
        keyCode: 0,
        charCode: codePoint,
        modifiers: NO_MODIFIERS,
      });
    }
    this.markDirty();
  }

  /** 最初の検索画面の URL */
  homeUrl(): string {
    return pageToDataUrl(
      searchStartPage(
        this.wispState,
        import.meta.env.DEV,
        searchPageUrl(),
        searchTokenFrom(this.wispUrl),
      ),
    );
  }

  goHome(): void {
    this.resumeUrl = null;
    this.navigate(this.homeUrl());
  }

  navigate(url: string): void {
    if (!this.ready || !this.engine) {
      return;
    }
    this.engine.load(url).catch((error: unknown) => {
      console.warn("[gecko] 読み込みに失敗しました", describe(error));
    });
  }

  async evalContent(code: string): Promise<string | null> {
    const eng = this.engine as unknown as {
      run?: (args: {op: number; url: string}) => Promise<unknown>;
    } | null;
    if (!eng?.run || !this.ready) {
      return null;
    }
    try {
      const result = await eng.run({op: 5, url: code});
      return typeof result === "string" ? result : null;
    } catch {
      return null;
    }
  }

  override dispose(): void {
    this.cancelBoot();
    this.stopWispWatch();
    super.dispose();
  }
}

const checkWisp = (url: string, timeoutMs: number): Promise<boolean> =>
  new Promise<boolean>((resolve) => {
    let settled = false;
    let ws: WebSocket | undefined;
    const finish = (ok: boolean) => {
      if (settled) {
        return;
      }
      settled = true;
      window.clearTimeout(timer);
      if (ws) {
        ws.onopen = null;
        ws.onerror = null;
        ws.onclose = null;
        try {
          ws.close();
        } catch {}
      }
      resolve(ok);
    };
    const timer = window.setTimeout(() => finish(false), timeoutMs);
    try {
      ws = new WebSocket(url.endsWith("/") ? url : `${url}/`);
    } catch {
      finish(false);
      return;
    }
    ws.onopen = () => finish(true);
    ws.onerror = () => finish(false);
  });

/**
 * エンジンは Mac ではない環境として動くので、ショートカットの修飾キーは Ctrl しか見ない。
 * ⌘A・⌘C などを Ctrl に読み替えて、Mac でも定番のショートカットが効くようにする
 */
const withAccelAsCtrl = (event: ScreenKeyEvent): ScreenKeyEvent =>
  event.modifiers.meta
    ? {...event, modifiers: {...event.modifiers, ctrl: true, meta: false}}
    : event;

const describe = (error: unknown): string =>
  error instanceof Error ? `${error.name}: ${error.message}` : String(error);
