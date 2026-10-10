import type {Item, ItemEvents, ItemMessage, ItemState} from "./types";

/**
 * 手に持つアイテムの写し。状態の正はサーバーで、ここはサーバーの通知(apply)を反映するだけ。
 * アイテムに「使う」操作はなく、働きはオブジェクトへのインタラクトの条件(手持ち)になること
 */
export const createItemManager = () => {
  // state は変更のたびに新しいオブジェクトにする(useSyncExternalStore の参照同一性のため)
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
