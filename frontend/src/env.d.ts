interface ImportMetaEnv {
  readonly VITE_ENABLE_DEBUG?: string;
  readonly VITE_RENDERER?: "webgpu" | "webgl";
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
