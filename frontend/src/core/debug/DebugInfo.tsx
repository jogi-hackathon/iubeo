import { addAfterEffect, useThree } from "@react-three/fiber";
import { useEffect } from "react";
import { useAppContext } from "../../boot/context";

const INTERVAL_MS = 500;

/** WebGLRenderer / WebGPURenderer の差を吸収して読む項目だけを型付けする */
interface RendererLike {
  isWebGLRenderer?: boolean;
  domElement: HTMLCanvasElement;
  getPixelRatio(): number;
  getContext?(): WebGLRenderingContext | WebGL2RenderingContext;
  resolveTimestampsAsync?(type?: string): Promise<number | undefined>;
  backend?: {
    isWebGPUBackend?: boolean;
    trackTimestamp?: boolean;
    gl?: WebGLRenderingContext | WebGL2RenderingContext;
  };
  info: {
    render: {
      calls: number;
      drawCalls?: number;
      triangles: number;
      lines: number;
      points: number;
    };
    memory: {
      geometries: number;
      textures: number;
      texturesSize?: number;
      total?: number;
    };
  };
}

interface GpuAdapterInfo {
  vendor?: string;
  architecture?: string;
  device?: string;
  description?: string;
}

const backendLabel = (r: RendererLike): string => {
  if (r.isWebGLRenderer) return "WebGL";
  return r.backend?.isWebGPUBackend ? "WebGPU" : "WebGL2 (fallback)";
};

const joinInfo = (parts: (string | undefined)[]): string =>
  parts.filter(Boolean).join(" ") || "-";

const readGpuName = async (r: RendererLike): Promise<string> => {
  try {
    if (r.backend?.isWebGPUBackend) {
      const gpu = (
        navigator as unknown as {
          gpu?: {
            requestAdapter(): Promise<{ info?: GpuAdapterInfo } | null>;
          };
        }
      ).gpu;
      const info = (await gpu?.requestAdapter())?.info;
      return info
        ? joinInfo([info.vendor, info.architecture, info.description])
        : "-";
    }
    const gl = r.getContext?.() ?? r.backend?.gl;
    const ext = gl?.getExtension("WEBGL_debug_renderer_info");
    if (!gl || !ext) return "-";
    return String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) || "-";
  } catch {
    return "-";
  }
};

const fmt = (n: number | undefined): string =>
  n === undefined ? "-" : n.toLocaleString("en-US");

const fmtMB = (bytes: number | undefined): string =>
  bytes === undefined ? "-" : `${(bytes / 1024 / 1024).toFixed(1)} MB`;

/** FPS・ドローコール・三角形数・GPU メモリ・GPU 処理時間などを 0.5 秒ごとに更新する DOM パネル */
export function DebugInfo() {
  const gl = useThree((s) => s.gl);
  const { settings } = useAppContext();

  useEffect(() => {
    const r = gl as unknown as RendererLike;
    const el = document.createElement("pre");
    Object.assign(el.style, {
      position: "fixed",
      top: "0",
      left: "0",
      margin: "0",
      padding: "4px 6px",
      font: "11px/1.4 ui-monospace, Menlo, monospace",
      color: "#fff",
      background: "rgba(0,0,0,0.6)",
      pointerEvents: "none",
      zIndex: "10000",
      whiteSpace: "pre",
    });
    document.body.appendChild(el);

    let disposed = false;
    let gpuName = "-";
    let gpuMs: string = "-";
    // WebGPURenderer は独自の rAF で毎回 info.reset() を呼ぶため、描画直後に統計を退避する
    let frames = 0;
    const snap = { drawCalls: 0, triangles: 0, lines: 0, points: 0 };
    const stopSnapshot = addAfterEffect(() => {
      const { render } = r.info;
      frames++;
      snap.drawCalls = render.drawCalls ?? render.calls;
      snap.triangles = render.triangles;
      snap.lines = render.lines;
      snap.points = render.points;
    });
    let gpuFrame = 0;
    let fpsFrame = 0;
    let fpsTime = performance.now();
    let resolving = false;

    void readGpuName(r).then((name) => {
      gpuName = name;
    });

    const resolveGpuTime = async () => {
      if (!r.backend?.trackTimestamp || !r.resolveTimestampsAsync) return;
      resolving = true;
      try {
        const upTo = frames;
        const total = await r.resolveTimestampsAsync("render");
        const elapsed = upTo - gpuFrame;
        gpuFrame = upTo;
        if (!disposed && total !== undefined && elapsed > 0) {
          gpuMs = `${(total / elapsed).toFixed(2)} ms/frame`;
        }
      } catch {
        gpuMs = "-";
      } finally {
        resolving = false;
      }
    };

    const update = () => {
      if (!resolving) void resolveGpuTime();
      const { memory } = r.info;
      const now = performance.now();
      const fps = ((frames - fpsFrame) * 1000) / (now - fpsTime);
      fpsFrame = frames;
      fpsTime = now;
      const { fpsLimit, resolutionScale } = settings;
      el.textContent = [
        `FPS      ${fps.toFixed(0)}`,
        `Backend  ${backendLabel(r)}`,
        `GPU      ${gpuName}`,
        `Res      ${r.domElement.width}x${r.domElement.height} (dpr ${r.getPixelRatio().toFixed(2)}, scale ${resolutionScale})`,
        `FPS cap  ${fpsLimit ?? "none"}`,
        `Draw     ${fmt(snap.drawCalls)}`,
        `Tris     ${fmt(snap.triangles)}  Lines ${fmt(snap.lines)}  Pts ${fmt(snap.points)}`,
        `Geom     ${fmt(memory.geometries)}  Tex ${fmt(memory.textures)}`,
        `GPU mem  ${fmtMB(memory.total)}  (tex ${fmtMB(memory.texturesSize)})`,
        `GPU time ${gpuMs}`,
      ].join("\n");
    };

    update();
    const id = window.setInterval(update, INTERVAL_MS);
    return () => {
      disposed = true;
      stopSnapshot();
      window.clearInterval(id);
      el.remove();
    };
  }, [gl, settings]);

  return null;
}
