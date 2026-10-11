import type {MeshSignature} from "./meshes";

export interface ChartRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface BakedAOLayout {
  atlasW: number;
  atlasH: number;
  meshes: MeshSignature[];
  rects: ChartRect[];
}

const MAGIC = "IAO1";
const HEADER_BYTES = 16;
const MESH_BYTES = 20;
const RECT_BYTES = 8;

/**
 * レイアウト(リトルエンディアン):
 * [MAGIC 4B][u16 atlasW][u16 atlasH][u32 meshCount][u32 chartCount]
 * + mesh ごとに [u32 vertexCount][u32 chartCount][f32 cx][f32 cy][f32 cz]
 * + チャートごとに [u16 x][u16 y][u16 w][u16 h]
 */
export const serializeLayout = (
  layout: BakedAOLayout,
): Uint8Array<ArrayBuffer> => {
  const {atlasW, atlasH, meshes, rects} = layout;
  const buf = new Uint8Array(
    HEADER_BYTES + meshes.length * MESH_BYTES + rects.length * RECT_BYTES,
  );
  const dv = new DataView(buf.buffer);
  for (let i = 0; i < MAGIC.length; i++) {
    buf[i] = MAGIC.charCodeAt(i);
  }
  dv.setUint16(4, atlasW, true);
  dv.setUint16(6, atlasH, true);
  dv.setUint32(8, meshes.length, true);
  dv.setUint32(12, rects.length, true);
  let o = HEADER_BYTES;
  for (const m of meshes) {
    dv.setUint32(o, m.vertexCount, true);
    dv.setUint32(o + 4, m.chartCount, true);
    dv.setFloat32(o + 8, m.center[0], true);
    dv.setFloat32(o + 12, m.center[1], true);
    dv.setFloat32(o + 16, m.center[2], true);
    o += MESH_BYTES;
  }
  for (const r of rects) {
    dv.setUint16(o, r.x, true);
    dv.setUint16(o + 2, r.y, true);
    dv.setUint16(o + 4, r.w, true);
    dv.setUint16(o + 6, r.h, true);
    o += RECT_BYTES;
  }
  return buf;
};

export const parseLayout = (buffer: ArrayBuffer): BakedAOLayout => {
  const bytes = new Uint8Array(buffer);
  const magic = String.fromCharCode(...bytes.subarray(0, MAGIC.length));
  if (magic !== MAGIC) {
    throw new Error(`[bake] 形式が違います(${magic})`);
  }
  const dv = new DataView(buffer);
  const atlasW = dv.getUint16(4, true);
  const atlasH = dv.getUint16(6, true);
  const meshCount = dv.getUint32(8, true);
  const chartCount = dv.getUint32(12, true);
  const expected =
    HEADER_BYTES + meshCount * MESH_BYTES + chartCount * RECT_BYTES;
  if (buffer.byteLength !== expected) {
    throw new Error(
      `[bake] サイズが一致しません(${buffer.byteLength} != ${expected})`,
    );
  }
  let o = HEADER_BYTES;
  const meshes: MeshSignature[] = [];
  for (let i = 0; i < meshCount; i++) {
    meshes.push({
      vertexCount: dv.getUint32(o, true),
      chartCount: dv.getUint32(o + 4, true),
      center: [
        dv.getFloat32(o + 8, true),
        dv.getFloat32(o + 12, true),
        dv.getFloat32(o + 16, true),
      ],
    });
    o += MESH_BYTES;
  }
  const rects: ChartRect[] = [];
  for (let i = 0; i < chartCount; i++) {
    rects.push({
      x: dv.getUint16(o, true),
      y: dv.getUint16(o + 2, true),
      w: dv.getUint16(o + 4, true),
      h: dv.getUint16(o + 6, true),
    });
    o += RECT_BYTES;
  }
  return {atlasW, atlasH, meshes, rects};
};

const CENTER_EPS = 1e-3;

export const findLayoutMismatch = (
  layout: BakedAOLayout,
  current: readonly MeshSignature[],
): string | null => {
  if (layout.meshes.length !== current.length) {
    return `mesh 数が違います(ベイク ${layout.meshes.length} / 現在 ${current.length})`;
  }
  for (let i = 0; i < current.length; i++) {
    const a = layout.meshes[i] as MeshSignature;
    const b = current[i] as MeshSignature;
    if (a.vertexCount !== b.vertexCount || a.chartCount !== b.chartCount) {
      return `mesh ${i} の形が違います(頂点 ${a.vertexCount}→${b.vertexCount}, チャート ${a.chartCount}→${b.chartCount})`;
    }
    if (
      a.center.some(
        (v, k) => Math.abs(v - (b.center[k] as number)) > CENTER_EPS,
      )
    ) {
      return `mesh ${i} の位置が違います`;
    }
  }
  return null;
};

export const atlasUV = (
  uv: ArrayLike<number>,
  chart: ArrayLike<number>,
  chartOffset: number,
  layout: Pick<BakedAOLayout, "atlasW" | "atlasH" | "rects">,
): Float32Array => {
  const count = chart.length;
  const out = new Float32Array(count * 2);
  for (let i = 0; i < count; i++) {
    const rect = layout.rects[chartOffset + (chart[i] as number)];
    if (!rect) {
      throw new Error(
        `[bake] チャート ${chartOffset + (chart[i] as number)} がありません`,
      );
    }
    const u = uv[i * 2] as number;
    const v = uv[i * 2 + 1] as number;
    out[i * 2] = (rect.x + 0.5 + u * (rect.w - 1)) / layout.atlasW;
    out[i * 2 + 1] = (rect.y + 0.5 + v * (rect.h - 1)) / layout.atlasH;
  }
  return out;
};
