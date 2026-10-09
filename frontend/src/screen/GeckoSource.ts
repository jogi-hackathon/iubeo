import {CanvasScreenSource} from "./CanvasScreenSource";
import {importEngine, resolveEngine} from "./engine";
import type {GeckoConstructor, GeckoInstance} from "./geckoTypes";
import {
  pageToDataUrl,
  searchStartPage,
  type WispState,
} from "./searchStartPage";
import {
  NO_MODIFIERS,
  type ScreenKeyEvent,
  type ScreenModifiers,
  type ScreenPointerEvent,
} from "./types";
import {
  describeWispHost,
  resolveWispUrl,
  setFreshWispUrl,
  wispOverrideFrom,
  wispPassFrom,
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

/** 起動の進みを画面に出すための間隔(ms) */
const PROGRESS_INTERVAL_MS = 1000;
/** WISP プロキシの疎通を待つ上限(ms)。超えたら「つながらない」として扱う */
const WISP_TIMEOUT_MS = 8000;
/**
 * トークンで繋ぐ（本番の）WISP の疎通を待つ上限(ms)。眠っている Container の起動を待つ分だけ長くする
 * （worker/wisp.ts の START_TIMEOUT_MS と同じ）。wasm の起動と並行して待つ
 */
const WISP_COLD_START_TIMEOUT_MS = 90_000;
/** WISP のトークン（期限 5 分）を取り直す間隔(ms) */
const WISP_TOKEN_REFRESH_MS = 4 * 60 * 1000;

export class GeckoSource extends CanvasScreenSource {
  private engine: GeckoInstance | null = null;
  private ready = false;
  private gpuMode = false;
  private progressTimer?: number;
  private tokenTimer?: number;
  /** 直結の指定（?wisp= か VITE_WISP_URL）。undefined ならトークンを発行してもらう */
  private readonly wispOverride: string | undefined;
  /** トークンの発行に要る合言葉（?wisppass=）。無ければ undefined */
  private readonly wispPass: string | undefined;
  /** 実際に使う WISP の URL（起動時に決まる。無ければ undefined） */
  private wispUrl?: string;

  constructor(width: number, height: number, search: string) {
    super(width, height, "screen");
    this.wispOverride = wispOverrideFrom(search, import.meta.env.VITE_WISP_URL);
    this.wispPass = wispPassFrom(search);
  }

  /** GPU モードのエンジンはフレームをこちらへ通知せず #screen へ直接合成するので、毎フレーム読み直す */
  get liveSurface(): boolean {
    return this.gpuMode;
  }

  override async boot(): Promise<void> {
    if (this.status === "booting" || this.status === "ready") {
      return;
    }
    this.setStatus("booting", "エンジンを探しています");

    const resolved = await resolveEngine(location.search);
    if (!resolved) {
      this.setStatus(
        "unavailable",
        "engine-local/ にエンジンがありません。pnpm engine:link を実行してください",
      );
      return;
    }

    let Gecko: GeckoConstructor | undefined;
    try {
      const module = await importEngine(resolved.entry);
      Gecko = module.Gecko ?? module.default;
    } catch (error) {
      this.setStatus(
        "error",
        `エンジンの読み込みに失敗しました: ${describe(error)}`,
      );
      return;
    }
    if (!Gecko) {
      this.setStatus("error", "エンジンのバンドルに Gecko クラスがありません");
      return;
    }

    this.patchBlitNotify();

    const env: Record<string, string> = {GECKO_COARSE_CLOCK: "1"};
    // `?env.FOO=bar` でエンジンの環境変数を渡せる（デバッグ用）
    for (const [key, value] of new URLSearchParams(location.search)) {
      if (key.startsWith("env.")) {
        env[key.slice(4)] = value;
      }
    }
    this.gpuMode = !!env.GECKO_GPU;

    const sizeMb = resolved.wasm.compressed ? "34MB" : "150MB";
    const startedAt = performance.now();
    this.progressTimer = window.setInterval(() => {
      const seconds = Math.round((performance.now() - startedAt) / 1000);
      this.setDetail(
        `エンジンを起動中… ${seconds} 秒（${sizeMb} の wasm を読み込んでいます）`,
      );
    }, PROGRESS_INTERVAL_MS);
    this.setStatus(
      "booting",
      `エンジンを起動中… 0 秒（${sizeMb} の wasm を読み込んでいます）`,
    );

    // 接続先（トークン付きの URL を含む）を決める。取れなければ WISP 無しで動かす
    this.wispUrl = await resolveWispUrl(
      this.wispOverride,
      fetch,
      this.wispPass,
    );
    const usesToken = this.wispOverride === undefined && !!this.wispUrl;
    // WISP への疎通確認を wasm の起動と並行して走らせる。死んでいると最初の読み込みが永久に待つため
    const wispCheck = this.wispUrl
      ? checkWisp(
          this.wispUrl,
          usesToken ? WISP_COLD_START_TIMEOUT_MS : WISP_TIMEOUT_MS,
        )
      : Promise.resolve(false);
    if (usesToken) {
      this.keepWispTokenFresh();
    }

    try {
      const engine = new Gecko({
        canvas: this.canvas,
        width: this.width,
        height: this.height,
        env,
        wasm: resolved.wasm,
        wispUrl: this.wispUrl,
        // エンジン自身のリスナーを生かし、合成 DOM イベントで叩く
        forwardInput: true,
        print: (line) => console.log("[gecko]", line),
        printErr: (line) => console.warn("[gecko]", line),
      });
      this.engine = engine;

      await engine.init();
      await engine.resize(this.width, this.height);
      this.stopProgress();

      const wispOk = await wispCheck;
      const wispState: WispState = !this.wispUrl
        ? "none"
        : wispOk
          ? "ok"
          : "unreachable";
      await engine.load(
        pageToDataUrl(searchStartPage(wispState, import.meta.env.DEV)),
      );

      this.ready = true;
      const versionTag = resolved.version ? ` v${resolved.version}` : "";
      const network = this.wispUrl
        ? wispOk
          ? `WISP 経由 ${describeWispHost(this.wispUrl)}`
          : `WISP プロキシ ${describeWispHost(this.wispUrl)} に接続できません`
        : "オフライン（検索結果は WISP が必要）";
      this.setStatus("ready", `Gecko エンジン${versionTag} · ${network}`);
    } catch (error) {
      // 起動し直すときに新しく作るので、途中まで起動したものは捨てる
      this.engine?.destroy();
      this.engine = null;
      this.stopTokenRefresh();
      this.setStatus(
        "error",
        `エンジンの起動に失敗しました: ${describe(error)}`,
      );
    } finally {
      this.stopProgress();
    }
  }

  private stopProgress(): void {
    if (this.progressTimer !== undefined) {
      window.clearInterval(this.progressTimer);
      this.progressTimer = undefined;
    }
  }

  /**
   * WISP のトークンを期限が切れる前に取り直し続ける。エンジンは最初の通信のときに初めて WISP へ繋ぐので、
   * 起動から時間が経っていても、そのとき有効なトークンで繋げるようにする
   */
  private keepWispTokenFresh(): void {
    setFreshWispUrl(this.wispUrl);
    this.stopTokenRefresh();
    this.tokenTimer = window.setInterval(() => {
      void resolveWispUrl(undefined, fetch, this.wispPass).then((url) => {
        if (url && this.tokenTimer !== undefined) {
          this.wispUrl = url;
          setFreshWispUrl(url);
        }
      });
    }, WISP_TOKEN_REFRESH_MS);
  }

  private stopTokenRefresh(): void {
    if (this.tokenTimer !== undefined) {
      window.clearInterval(this.tokenTimer);
      this.tokenTimer = undefined;
    }
  }

  /** 進みの表示だけを変える（状態は変えない） */
  private setDetail(detail: string): void {
    this.statusDetail = detail;
    this.paintNotice();
    this.markDirty();
  }

  /**
   * ソフトウェアモードでエンジンの putImageData を dirty 通知に繋ぐ。
   * 無いとアニメーションや動画の更新がテクスチャに載らない。
   */
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
    this.dispatchKey(event);
    this.markDirty();
  }

  /**
   * テキスト挿入（IME の確定、貼り付け）。エンジンはキーイベントの charCode から文字を入れるので、
   * コードポイントごとに keydown を 1 つ投げるのがそのまま期待される形になる。
   */
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

  /** アドレス欄からの移動。入力はそのまま URL として読み込む（正規化は呼び出し側） */
  navigate(url: string): void {
    if (!this.ready || !this.engine) {
      return;
    }
    this.engine.load(url).catch((error: unknown) => {
      console.warn("[gecko] 読み込みに失敗しました", describe(error));
    });
  }

  /**
   * 表示中のページで JS を評価し、文字列の結果を返す（location.href など）。
   * 準備中・失敗時は null。エンジンの content のグローバルで実行する
   */
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
    this.stopProgress();
    this.stopTokenRefresh();
    this.engine?.destroy();
    this.engine = null;
    super.dispose();
  }
}

/**
 * WISP の WebSocket への疎通（握手まで）。応答しない・拒否なら timeoutMs で諦めて false。
 * wisp プロトコル自体は検証しない（開いてすぐ閉じる）。
 */
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
        } catch {
          /* 閉じられなくても結果は変わらない */
        }
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

const describe = (error: unknown): string =>
  error instanceof Error ? `${error.name}: ${error.message}` : String(error);
