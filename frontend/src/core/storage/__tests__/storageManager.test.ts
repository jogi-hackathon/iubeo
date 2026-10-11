import {describe, expect, it} from "vitest";

import {
  createStorageManager,
  type StorageBackend,
  type StoreSpec,
} from "../storageManager";

const createMemoryBackend = (
  initial: Record<string, string> = {},
): StorageBackend & {map: Map<string, string>} => {
  const map = new Map(Object.entries(initial));
  return {
    map,
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, value);
    },
    removeItem: (key) => {
      map.delete(key);
    },
  };
};

type Counter = {count: number};

const counterSpec: StoreSpec<Counter> = {
  key: "counter",
  defaults: {count: 0},
  parse: (raw) => {
    if (typeof raw !== "object" || raw === null) {
      return {count: 0};
    }
    const count = (raw as {count?: unknown}).count;
    return {count: typeof count === "number" ? Math.max(0, count) : 0};
  },
};

describe("createStorageManager", () => {
  it("未保存なら defaults が返る", () => {
    const store = createStorageManager(createMemoryBackend()).defineStore(
      counterSpec,
    );
    expect(store.get()).toEqual({count: 0});
  });

  it("ロードしても backend に書き込まない", () => {
    const backend = createMemoryBackend();
    const store = createStorageManager(backend).defineStore(counterSpec);
    store.getState();
    expect(backend.map.size).toBe(0);
  });

  it("set した値は、同じ backend を使う別のインスタンスから復元される", () => {
    const backend = createMemoryBackend();
    const first = createStorageManager(backend).defineStore(counterSpec);
    first.set({count: 3});
    const second = createStorageManager(backend).defineStore(counterSpec);
    expect(second.get()).toEqual({count: 3});
  });

  it("壊れた JSON なら defaults が返る", () => {
    const backend = createMemoryBackend({"iubeo:counter": "{not json"});
    const store = createStorageManager(backend).defineStore(counterSpec);
    expect(store.get()).toEqual({count: 0});
  });

  it("parse は保存された不正値を丸める", () => {
    const backend = createMemoryBackend({
      "iubeo:counter": JSON.stringify({count: -5}),
    });
    const store = createStorageManager(backend).defineStore(counterSpec);
    expect(store.get()).toEqual({count: 0});
  });

  it("parse が throw したら defaults が返る", () => {
    const backend = createMemoryBackend({"iubeo:counter": "{}"});
    const store = createStorageManager(backend).defineStore({
      ...counterSpec,
      parse: () => {
        throw new Error("parse failed");
      },
    });
    expect(store.get()).toEqual({count: 0});
  });

  it("getItem が throw したら defaults が返る", () => {
    const backend: StorageBackend = {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {},
      removeItem: () => {},
    };
    const store = createStorageManager(backend).defineStore(counterSpec);
    expect(store.get()).toEqual({count: 0});
  });

  it("setItem が throw してもメモリ上は更新される", () => {
    const backend: StorageBackend = {
      getItem: () => null,
      setItem: () => {
        throw new Error("quota");
      },
      removeItem: () => {},
    };
    const store = createStorageManager(backend).defineStore(counterSpec);
    store.set({count: 7});
    expect(store.get()).toEqual({count: 7});
  });

  it("reset で defaults に戻り、backend からも消える", () => {
    const backend = createMemoryBackend();
    const store = createStorageManager(backend).defineStore(counterSpec);
    store.set({count: 4});
    store.reset();
    expect(store.get()).toEqual({count: 0});
    expect(backend.map.has("iubeo:counter")).toBe(false);
  });

  it("subscribe のリスナーは set と reset で呼ばれ、解除後は呼ばれない", () => {
    const store = createStorageManager(createMemoryBackend()).defineStore(
      counterSpec,
    );
    let calls = 0;
    const unsubscribe = store.subscribe(() => {
      calls += 1;
    });
    store.set({count: 1});
    store.reset();
    expect(calls).toBe(2);
    unsubscribe();
    store.set({count: 2});
    expect(calls).toBe(2);
  });

  it("リスナーが throw しても他のリスナーは呼ばれる", () => {
    const store = createStorageManager(createMemoryBackend()).defineStore(
      counterSpec,
    );
    let called = false;
    store.subscribe(() => {
      throw new Error("listener failed");
    });
    store.subscribe(() => {
      called = true;
    });
    const original = console.error;
    console.error = () => {};
    try {
      store.set({count: 1});
    } finally {
      console.error = original;
    }
    expect(called).toBe(true);
  });

  it("キーに iubeo: の接頭辞が付く", () => {
    const backend = createMemoryBackend();
    const store = createStorageManager(backend).defineStore(counterSpec);
    store.set({count: 1});
    expect([...backend.map.keys()]).toEqual(["iubeo:counter"]);
    expect(backend.map.get("iubeo:counter")).toBe(JSON.stringify({count: 1}));
  });
});

describe("createStorageManager の init / isFirstRun", () => {
  const flagSpec: StoreSpec<{on: boolean}> = {
    key: "flag",
    defaults: {on: false},
    parse: (raw) => {
      const on = (raw as {on?: unknown}).on;
      return {on: on === true};
    },
  };

  it("初回 init で、登録済み全ストアの defaults とメタキーが書かれ、isFirstRun は true", () => {
    const backend = createMemoryBackend();
    const manager = createStorageManager(backend);
    manager.defineStore(counterSpec);
    manager.defineStore(flagSpec);
    expect(manager.init()).toBe(true);
    expect(backend.map.get("iubeo:counter")).toBe(JSON.stringify({count: 0}));
    expect(backend.map.get("iubeo:flag")).toBe(JSON.stringify({on: false}));
    expect(backend.map.get("iubeo:meta")).toBe(
      JSON.stringify({initialized: true}),
    );
    expect(manager.isFirstRun()).toBe(true);
  });

  it("2回目の init(別インスタンス・同じ backend)は isFirstRun が false で、既存の値を上書きしない", () => {
    const backend = createMemoryBackend();
    const first = createStorageManager(backend);
    first.defineStore(counterSpec).set({count: 9});
    first.init();

    const second = createStorageManager(backend);
    second.defineStore(counterSpec);
    expect(second.init()).toBe(false);
    expect(second.isFirstRun()).toBe(false);
    expect(backend.map.get("iubeo:counter")).toBe(JSON.stringify({count: 9}));
  });

  it("同一インスタンスで init を2回呼んでも結果は変わらず、値も上書きされない", () => {
    const backend = createMemoryBackend();
    const manager = createStorageManager(backend);
    const store = manager.defineStore(counterSpec);
    expect(manager.init()).toBe(true);
    store.set({count: 5});
    expect(manager.init()).toBe(true);
    expect(manager.isFirstRun()).toBe(true);
    expect(backend.map.get("iubeo:counter")).toBe(JSON.stringify({count: 5}));
  });

  it("メタキーはあるが、あるストアのキーが無ければそのストアだけ defaults が書き足される", () => {
    const backend = createMemoryBackend({
      "iubeo:meta": JSON.stringify({initialized: true}),
      "iubeo:counter": JSON.stringify({count: 3}),
    });
    const manager = createStorageManager(backend);
    manager.defineStore(counterSpec);
    manager.defineStore(flagSpec);
    expect(manager.init()).toBe(false);
    expect(backend.map.get("iubeo:flag")).toBe(JSON.stringify({on: false}));
    expect(backend.map.get("iubeo:counter")).toBe(JSON.stringify({count: 3}));
  });

  it("壊れた JSON が入っているキーは上書きされない", () => {
    const backend = createMemoryBackend({"iubeo:counter": "{not json"});
    const manager = createStorageManager(backend);
    manager.defineStore(counterSpec);
    manager.init();
    expect(backend.map.get("iubeo:counter")).toBe("{not json");
  });

  it("init 前の isFirstRun は false", () => {
    const manager = createStorageManager(createMemoryBackend());
    manager.defineStore(counterSpec);
    expect(manager.isFirstRun()).toBe(false);
  });

  it("getItem / setItem が throw しても init は throw せず、firstRun を返す", () => {
    const backend: StorageBackend = {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {
        throw new Error("quota");
      },
      removeItem: () => {},
    };
    const manager = createStorageManager(backend);
    manager.defineStore(counterSpec);
    const original = console.error;
    console.error = () => {};
    try {
      expect(manager.init()).toBe(true);
    } finally {
      console.error = original;
    }
    expect(manager.isFirstRun()).toBe(true);
  });

  it("init 後も get() は defaults を返し、init 自体ではリスナーは呼ばれない", () => {
    const backend = createMemoryBackend();
    const manager = createStorageManager(backend);
    const store = manager.defineStore(counterSpec);
    let calls = 0;
    store.subscribe(() => {
      calls += 1;
    });
    manager.init();
    expect(store.get()).toEqual({count: 0});
    expect(calls).toBe(0);
  });

  it("init 後に defineStore したストアは、次のページロードまで書き込まれない", () => {
    const backend = createMemoryBackend();
    const manager = createStorageManager(backend);
    manager.init();
    manager.defineStore(counterSpec);
    expect(backend.map.has("iubeo:counter")).toBe(false);
  });

  it("2回目の init() でも、init 後に defineStore したストアは書かれない", () => {
    const backend = createMemoryBackend();
    const manager = createStorageManager(backend);
    manager.init();
    manager.init();
    manager.defineStore(counterSpec);
    manager.init();
    expect(backend.map.has("iubeo:counter")).toBe(false);
  });

  it("同じ key を2回 defineStore しても、init の書き込みは1回だけ", () => {
    const backend = createMemoryBackend();
    let setCalls = 0;
    const countingBackend: StorageBackend = {
      getItem: (key) => backend.getItem(key),
      setItem: (key, value) => {
        setCalls += 1;
        backend.setItem(key, value);
      },
      removeItem: (key) => backend.removeItem(key),
    };
    const manager = createStorageManager(countingBackend);
    manager.defineStore(counterSpec);
    manager.defineStore(counterSpec);
    manager.init();
    expect(setCalls).toBe(2);
    expect(backend.map.get("iubeo:counter")).toBe(JSON.stringify({count: 0}));
  });
});

describe("createStorageManager のストア参照・parse・freeze", () => {
  type Num = {n: number};

  const clampSpec: StoreSpec<Num> = {
    key: "num",
    defaults: {n: 0},
    parse: (raw) => {
      const n = (raw as {n: unknown}).n;
      if (typeof n !== "number") {
        throw new Error("invalid");
      }
      return {n: Math.min(10, Math.max(0, n))};
    },
  };

  it("getState を複数回呼んでも参照は同一", () => {
    const store = createStorageManager(createMemoryBackend()).defineStore(
      counterSpec,
    );
    expect(store.getState()).toBe(store.getState());
    expect(store.get()).toBe(store.getState());
  });

  it("set 後は新しい参照になり、その後も参照は安定", () => {
    const store = createStorageManager(createMemoryBackend()).defineStore(
      counterSpec,
    );
    const before = store.getState();
    store.set({count: 2});
    const after = store.getState();
    expect(after).not.toBe(before);
    expect(store.getState()).toBe(after);
    expect(store.get()).toBe(after);
  });

  it("set は parse を通した値をメモリと backend に反映する", () => {
    const backend = createMemoryBackend();
    const store = createStorageManager(backend).defineStore(clampSpec);
    store.set({n: 99});
    expect(store.get()).toEqual({n: 10});
    expect(backend.map.get("iubeo:num")).toBe(JSON.stringify({n: 10}));
  });

  it("set に渡した値が parse で throw したら defaults が使われる", () => {
    const backend = createMemoryBackend();
    const store = createStorageManager(backend).defineStore(clampSpec);
    store.set({n: 5});
    store.set(undefined as never);
    expect(store.get()).toEqual({n: 0});
    expect(backend.map.get("iubeo:num")).toBe(JSON.stringify({n: 0}));
  });

  it("parse の結果が JSON にならない値なら setItem は呼ばれない", () => {
    const backend = createMemoryBackend();
    const store = createStorageManager(backend).defineStore<Num>({
      key: "num",
      defaults: {n: 0},
      parse: (raw) => raw as Num,
    });
    store.set(undefined as never);
    expect(backend.map.has("iubeo:num")).toBe(false);
    expect(backend.map.size).toBe(0);
  });

  it("defaults は freeze され、get() の戻りへの代入は TypeError になる", () => {
    const store = createStorageManager(createMemoryBackend()).defineStore(
      counterSpec,
    );
    expect(Object.isFrozen(counterSpec.defaults)).toBe(true);
    const value = store.get() as {count: number};
    expect(() => {
      value.count = 1;
    }).toThrow(TypeError);
  });

  it("init 前に set した値は、init で上書きされない", () => {
    const backend = createMemoryBackend();
    const manager = createStorageManager(backend);
    const store = manager.defineStore(counterSpec);
    store.set({count: 6});
    manager.init();
    expect(backend.map.get("iubeo:counter")).toBe(JSON.stringify({count: 6}));
    expect(store.get()).toEqual({count: 6});
  });

  it("reset 後に新しい manager で init すると defaults が書き足される", () => {
    const backend = createMemoryBackend();
    const first = createStorageManager(backend).defineStore(counterSpec);
    first.set({count: 4});
    first.reset();
    const manager = createStorageManager(backend);
    manager.defineStore(counterSpec);
    manager.init();
    expect(backend.map.get("iubeo:counter")).toBe(JSON.stringify({count: 0}));
  });
});
