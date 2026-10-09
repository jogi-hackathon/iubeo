interface ImportMetaEnv {
  readonly VITE_ENABLE_DEBUG?: string;
  /** webgl にすると WebGL2 バックエンドを強制する。非対応なので起動エラー画面になる(その確認用) */
  readonly VITE_RENDERER?: "webgpu" | "webgl";
  /** PC の画面から実サイトへ出るための WISP プロキシ（例: ws://127.0.0.1:5001/）。?wisp= で上書きできる */
  readonly VITE_WISP_URL?: string;
  /** Gecko エンジンの配信元（例: https://pub-xxxx.r2.dev）。空なら同じオリジンの /engine/（開発時の既定） */
  readonly VITE_ENGINE_BASE_URL?: string;
  /** Web Search の判定（Clef）のエンドポイント。既定は同じオリジンの /judge（本番は Worker、開発は Vite） */
  readonly VITE_JUDGE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
