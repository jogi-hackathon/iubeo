export interface StorageBackend {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface StoreSpec<T> {
  key: string;
  defaults: T;
  parse: (raw: unknown) => T;
}

export interface StorageStore<T> {
  getState(): Readonly<T>;
  get(): Readonly<T>;
  set(next: T): void;
  reset(): void;
  subscribe(listener: () => void): () => void;
}

export interface StorageManager {
  defineStore<T>(spec: StoreSpec<T>): StorageStore<T>;
  init(): boolean;
  isFirstRun(): boolean;
}

const PREFIX = "iubeo:";
const META_KEY = `${PREFIX}meta`;

export const createStorageManager = (
  backend: StorageBackend,
): StorageManager => {
  const registry = new Map<string, unknown>();
  let initDone = false;
  let firstRun = false;

  const isMetaInitialized = (): boolean => {
    try {
      const raw = backend.getItem(META_KEY);
      if (raw === null) {
        return false;
      }
      const meta: unknown = JSON.parse(raw);
      return (
        typeof meta === "object" &&
        meta !== null &&
        (meta as {initialized?: unknown}).initialized === true
      );
    } catch {
      return false;
    }
  };

  return {
    defineStore<T>(spec: StoreSpec<T>): StorageStore<T> {
      const key = `${PREFIX}${spec.key}`;
      const defaults: T = spec.defaults;
      if (typeof defaults === "object" && defaults !== null) {
        Object.freeze(defaults);
      }
      registry.set(key, defaults);
      const listeners = new Set<() => void>();
      let state: T = defaults;
      let loaded = false;

      const sanitize = (raw: unknown): T => {
        try {
          return spec.parse(raw);
        } catch {
          return defaults;
        }
      };

      const notify = () => {
        for (const l of Array.from(listeners)) {
          try {
            l();
          } catch (e) {
            console.error(e);
          }
        }
      };

      const load = (): T => {
        try {
          const raw = backend.getItem(key);
          if (raw === null) {
            return defaults;
          }
          return sanitize(JSON.parse(raw));
        } catch {
          return defaults;
        }
      };

      const getState = (): T => {
        if (!loaded) {
          state = load();
          loaded = true;
        }
        return state;
      };

      return {
        getState,
        get: getState,
        set: (next: T) => {
          const parsed = sanitize(next);
          state = parsed;
          loaded = true;
          try {
            const json = JSON.stringify(parsed);
            if (typeof json === "string") {
              backend.setItem(key, json);
            }
          } catch (e) {
            console.error(e);
          }
          notify();
        },
        reset: () => {
          state = defaults;
          loaded = true;
          try {
            backend.removeItem(key);
          } catch (e) {
            console.error(e);
          }
          notify();
        },
        subscribe: (listener: () => void) => {
          listeners.add(listener);
          return () => {
            listeners.delete(listener);
          };
        },
      };
    },

    init(): boolean {
      if (initDone) {
        return firstRun;
      }
      initDone = true;
      firstRun = !isMetaInitialized();

      for (const [fullKey, defaults] of registry) {
        try {
          if (backend.getItem(fullKey) === null) {
            backend.setItem(fullKey, JSON.stringify(defaults));
          }
        } catch (e) {
          console.error(e);
        }
      }

      if (firstRun) {
        try {
          backend.setItem(META_KEY, JSON.stringify({initialized: true}));
        } catch (e) {
          console.error(e);
        }
      }
      return firstRun;
    },

    isFirstRun(): boolean {
      return firstRun;
    },
  };
};

const localStorageBackend: StorageBackend = {
  getItem: (key) => localStorage.getItem(key),
  setItem: (key, value) => localStorage.setItem(key, value),
  removeItem: (key) => localStorage.removeItem(key),
};

export const storageManager = createStorageManager(localStorageBackend);
