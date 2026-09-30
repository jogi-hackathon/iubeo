interface ImportMetaEnv {
  readonly VITE_ENABLE_DEBUG?: string;
  /** webgl にすると WebGL2 バックエンドを強制する。非対応なので起動エラー画面になる(その確認用) */
  readonly VITE_RENDERER?: "webgpu" | "webgl";
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
