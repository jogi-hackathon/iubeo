interface ImportMetaEnv {
  readonly VITE_ENABLE_DEBUG?: string;
  /** webgl にすると WebGL2 バックエンドを強制する。非対応なので起動エラー画面になる(その確認用) */
  readonly VITE_RENDERER?: "webgpu" | "webgl";
  readonly VITE_WISP_URL?: string;
  readonly VITE_ENGINE_BASE_URL?: string;
  readonly VITE_JUDGE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
