import type { WebGPURenderer } from "three/webgpu";
import { EMBEDDED } from "./params";

// renderer.backend.device は three の型に無いので、使う分だけ狭める
type GpuDeviceLike = {
  addEventListener(
    type: "uncapturederror",
    listener: (e: { error?: { message?: string } }) => void,
  ): void;
  pushErrorScope(filter: "validation" | "out-of-memory"): void;
  popErrorScope(): Promise<{ message: string } | null>;
};

// GPU のバリデーションエラー(バインドグループ不正、パイプライン作成失敗など)を確実に検知する。
// three は Uncaptured エラーを console に出すだけで例外にしないため、device のエラーイベントと
// pushErrorScope の両方で拾い、run() の結果と一緒に例外として投げる
export class GpuErrorWatch {
  private readonly device: GpuDeviceLike;
  private readonly errors: string[] = [];

  constructor(renderer: WebGPURenderer) {
    const backend = renderer.backend as unknown as { device?: GpuDeviceLike };
    if (!backend.device) {
      throw new Error(
        "[bake] WebGPU デバイスが取得できません(renderer.init() 済みか確認)",
      );
    }
    this.device = backend.device;
    this.device.addEventListener("uncapturederror", (e) =>
      this.errors.push(e.error?.message ?? String(e.error)),
    );
  }

  async run<T>(fn: () => Promise<T>): Promise<T> {
    const { device } = this;
    device.pushErrorScope("validation");
    device.pushErrorScope("out-of-memory");
    let result: T | undefined;
    let thrown: unknown = null;
    try {
      result = await fn();
    } catch (e) {
      thrown = e;
    }
    const oom = await device.popErrorScope();
    const validation = await device.popErrorScope();
    const messages = [...this.errors];
    this.errors.length = 0;
    if (validation) messages.push(validation.message);
    if (oom) messages.push(`out-of-memory: ${oom.message}`);
    if (messages.length) {
      throw new Error(
        `WebGPU エラー: ${messages[0]}${messages.length > 1 ? ` (ほか ${messages.length - 1} 件)` : ""}`,
      );
    }
    if (thrown) throw thrown;
    return result as T;
  }
}

// 最初のチャンクの結果が明らかに異常(全部 0 / 全部 EMBEDDED)なら止める。
// 実行に失敗したカーネルは読み戻しが全 0 になるため、その見逃しを防ぐ
export const checkFirstChunk = (
  label: string,
  values: ArrayLike<number>,
  n: number,
): void => {
  if (n < 64) return;
  const first = values[0];
  if (first !== 0 && first !== EMBEDDED) return;
  for (let i = 1; i < n; i++) if (values[i] !== first) return;
  throw new Error(
    `GPU の出力が異常です(${label} の先頭チャンク ${n} 件がすべて ${first === EMBEDDED ? "EMBEDDED" : first})`,
  );
};
