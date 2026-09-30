/** WebGPU が使えない理由。unsupported=API 自体が無い / no-adapter=adapter を取れない / init-failed=レンダラー初期化で WebGL2 に落ちた */
export type WebGPUUnavailableReason =
  | "unsupported"
  | "no-adapter"
  | "init-failed";

const REASON_TEXT: Record<WebGPUUnavailableReason, string> = {
  unsupported: "このブラウザは WebGPU に対応していません",
  "no-adapter": "WebGPU のアダプタ(GPU)を取得できませんでした",
  "init-failed":
    "WebGPU の初期化に失敗しました(WebGL2 へのフォールバックは対応していません)",
};

/** WebGPU のみサポートする。WebGL / WebGL2 フォールバックでは起動しない */
export class WebGPUUnavailableError extends Error {
  readonly reason: WebGPUUnavailableReason;

  constructor(reason: WebGPUUnavailableReason, options?: ErrorOptions) {
    super(
      `このブラウザ・環境では WebGPU が使えないため起動できません。WebGPU に対応したブラウザ(最新の Chrome / Edge / Safari など)でお試しください。\n理由: ${REASON_TEXT[reason]}`,
      options,
    );
    this.name = "WebGPUUnavailableError";
    this.reason = reason;
  }
}

interface GpuLike {
  requestAdapter(options?: object): Promise<unknown>;
}

/** three の WebGPUBackend.init と同じ条件で adapter を取る(core 相当だと compat 専用端末で WebGPU を取りこぼす) */
export const ADAPTER_OPTIONS = {
  featureLevel: "compatibility",
  powerPreference: "high-performance",
};

/** WebGPU が使えなければ WebGPUUnavailableError を投げる */
export const assertWebGPUAvailable = async (): Promise<void> => {
  const gpu = (globalThis.navigator as {gpu?: GpuLike} | undefined)?.gpu;
  if (!gpu) {
    throw new WebGPUUnavailableError("unsupported");
  }
  let adapter: unknown;
  try {
    adapter = await gpu.requestAdapter(ADAPTER_OPTIONS);
  } catch (cause) {
    throw new WebGPUUnavailableError("no-adapter", {cause});
  }
  if (adapter === null || adapter === undefined) {
    throw new WebGPUUnavailableError("no-adapter");
  }
};

/**
 * WebGPURenderer は WebGPU の初期化に失敗すると黙って WebGL2 バックエンドに差し替える
 * (WebGPURenderer のコンストラクタが getFallback を上書きするため、オプションでは止められない)。
 * init 後にバックエンドを見て、WebGPU でなければ投げる
 */
export const assertWebGPUBackend = (renderer: object): void => {
  const backend = (renderer as {backend?: {isWebGPUBackend?: boolean}}).backend;
  if (backend?.isWebGPUBackend !== true) {
    throw new WebGPUUnavailableError("init-failed");
  }
};
