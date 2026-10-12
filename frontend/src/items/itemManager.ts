import type {Item, ItemEvents, ItemMessage, ItemState} from "./types";

export const createItemManager = () => {
  let state: ItemState = {held: null};
  const listeners = new Set<() => void>();
  const handlers: {[K in keyof ItemEvents]: Set<(e: ItemEvents[K]) => void>} = {
    spawn: new Set(),
    delete: new Set(),
  };

  const set = (next: ItemState) => {
    state = next;
    for (const l of Array.from(listeners)) {
      try {
        l();
      } catch (e) {
        console.error(e);
      }
    }
  };

  const emit = <K extends keyof ItemEvents>(
    event: K,
    payload: ItemEvents[K],
  ) => {
    for (const cb of Array.from(handlers[event])) {
      try {
        cb(payload);
      } catch (e) {
        console.error(e);
      }
    }
  };

  return {
    getState: (): ItemState => state,
    getHeld: (): Item | null => state.held,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    on: <K extends keyof ItemEvents>(
      event: K,
      callback: (e: ItemEvents[K]) => void,
    ) => {
      handlers[event].add(callback);
      return () => {
        handlers[event].delete(callback);
      };
    },
    apply: (message: ItemMessage): void => {
      if (message.type === "spawn") {
        const replaced = state.held;
        set({held: message.item});
        if (replaced && replaced.id !== message.item.id) {
          emit("delete", {item: replaced});
        }
        emit("spawn", {item: message.item});
        return;
      }
      const held = state.held;
      if (!held || held.id !== message.id) {
        return;
      }
      set({held: null});
      emit("delete", {item: held});
    },
  };
};

export type ItemManager = ReturnType<typeof createItemManager>;
