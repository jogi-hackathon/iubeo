interface ImportMetaEnv {
  readonly VITE_ENABLE_DEBUG?: string;
  readonly VITE_RENDERER?: "webgpu" | "webgl";
  readonly VITE_WISP_URL?: string;
  readonly VITE_ENGINE_BASE_URL?: string;
  readonly VITE_JUDGE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
