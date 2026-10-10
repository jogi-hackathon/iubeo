import {describe, expect, it, vi} from "vitest";

import {createTeamStore, INITIAL_TEAM} from "../team";

describe("teamStore", () => {
  it("最初はどちらも立っておらず、書き換えると通知し、reset で戻る", () => {
    const store = createTeamStore();
    const listener = vi.fn();
    store.subscribe(listener);
    expect(store.get()).toEqual(INITIAL_TEAM);

    store.set({bypassPermission: true, fireStarted: false});
    expect(store.get()).toEqual({bypassPermission: true, fireStarted: false});
    expect(listener).toHaveBeenCalledTimes(1);

    store.reset();
    expect(store.get()).toEqual(INITIAL_TEAM);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("値が同じなら、参照も変えず、通知もしない", () => {
    const store = createTeamStore();
    const before = store.get();
    const listener = vi.fn();
    store.subscribe(listener);

    store.set({bypassPermission: false, fireStarted: false});

    expect(store.get()).toBe(before);
    expect(listener).not.toHaveBeenCalled();
  });
});
