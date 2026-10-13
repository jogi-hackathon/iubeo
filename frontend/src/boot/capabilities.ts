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

export const ADAPTER_OPTIONS = {
  featureLevel: "compatibility",
  powerPreference: "high-performance",
};

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
 */
export const assertWebGPUBackend = (renderer: object): void => {
  const backend = (renderer as {backend?: {isWebGPUBackend?: boolean}}).backend;
  if (backend?.isWebGPUBackend !== true) {
    throw new WebGPUUnavailableError("init-failed");
  }
};
