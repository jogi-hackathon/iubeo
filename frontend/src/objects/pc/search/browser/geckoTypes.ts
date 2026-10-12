export interface FsStat {
  size: number;
  isDir: boolean;
  mtime?: number;
}

export interface FsProvider {
  stat(path: string): Promise<FsStat | null>;
  readdir(path: string): Promise<string[]>;
  readFile(path: string): Promise<Uint8Array>;
}

export interface GeckoOptions {
  canvas: HTMLCanvasElement;
  width?: number;
  height?: number;
  env?: Record<string, string>;
  wispUrl?: string;
  fs?: FsProvider | string;
  wasm: {url: string; compressed?: boolean};
  locateFile?: (file: string) => string;
  print?: (s: string) => void;
  printErr?: (s: string) => void;
  forwardInput?: boolean;
}

export interface GeckoInstance {
  init(): Promise<void>;
  load(url: string): Promise<void>;
  resize(width: number, height: number): Promise<void>;
  destroy(): void;
}

export interface GeckoConstructor {
  new (options: GeckoOptions): GeckoInstance;
}

export interface GeckoModule {
  Gecko?: GeckoConstructor;
  default?: GeckoConstructor;
}
