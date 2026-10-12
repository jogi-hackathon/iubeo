/**
 * ウォームアップの後に新しい描画パイプラインが作られたら、開発時だけ警告を出す(見本帳の登録漏れに気づく用)。
 * three の内部(Backend.createRenderPipeline と RenderObject の形)を覗くので、three を上げたときは名前が変わっていないか確かめる。
 * - armPipelineWatch: ウォームアップが終わったら呼ぶ。以後に作られたパイプラインを警告する
 * - disarmPipelineWatch: ウォームアップのやり直し、ポストプロセスの構成の変更(全マテリアルが作り直される)で呼ぶ
 */

type RenderObjectLike = {
  material: {type: string; name: string};
  object: {type: string; name: string; count?: number};
  geometry: {attributes: Record<string, unknown>};
  context: {
    renderTarget: {texture?: {name?: string}} | null;
    sampleCount: number;
  };
};

type BackendLike = {
  createRenderPipeline(renderObject: RenderObjectLike, promises: unknown): void;
};

const PATCHED = Symbol("pipelineWatch");

let armed = false;
let pending: string[] = [];
let flushScheduled = false;
const created: string[] = [];

/** 警告に出す、パイプラインの元になった描画の説明(マテリアル・物・ジオメトリの属性・描画先) */
export const describeRenderObject = (ro: RenderObjectLike): string => {
  const material = ro.material.name
    ? `${ro.material.type}(${ro.material.name})`
    : ro.material.type;
  const object = ro.object.name
    ? `${ro.object.type}(${ro.object.name})`
    : ro.object.type;
  const instances =
    ro.object.count !== undefined && ro.object.count > 1
      ? ` x${ro.object.count}`
      : "";
  const attributes = Object.keys(ro.geometry.attributes).sort().join("/");
  const target = ro.context.renderTarget
    ? (ro.context.renderTarget.texture?.name ?? "renderTarget")
    : "canvas";
  return `${material} on ${object}${instances} [${attributes}] -> ${target} (samples ${ro.context.sampleCount})`;
};

const flush = (): void => {
  flushScheduled = false;
  const list = pending;
  pending = [];
  console.warn(
    `[ShaderWarmup] ウォームアップの後に描画パイプラインが ${list.length} 件作られました。` +
      "操作して初めて現れる物なら、core/shaderSwatches の見本帳に登録してください\n" +
      list.map((s) => `  - ${s}`).join("\n"),
  );
};

const note = (ro: RenderObjectLike): void => {
  const description = describeRenderObject(ro);
  created.push(description);
  pending.push(description);
  if (!flushScheduled) {
    flushScheduled = true;
    setTimeout(flush, 0);
  }
};

export const installPipelineWatch = (renderer: {backend: object}): void => {
  const backend = renderer.backend as BackendLike & {[PATCHED]?: true};
  if (backend[PATCHED]) {
    return;
  }
  backend[PATCHED] = true;
  const original = backend.createRenderPipeline;
  backend.createRenderPipeline = function (this: BackendLike, ro, promises) {
    if (armed) {
      note(ro);
    }
    return original.call(this, ro, promises);
  };
};

export const armPipelineWatch = (): void => {
  armed = true;
};

export const disarmPipelineWatch = (): void => {
  armed = false;
};

/** 監視中に作られたパイプラインの説明の一覧(起動後に 0 件が理想) */
export const pipelinesCreatedAfterWarmup = (): readonly string[] => created;
