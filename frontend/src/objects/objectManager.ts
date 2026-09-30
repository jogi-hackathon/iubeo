import type {PlayerId} from "../player/types";
import type {
  GameObject,
  HeldItemRef,
  InteractOptions,
  InteractRequest,
  ObjectEvents,
  ObjectManagerState,
  ObjectMessage,
} from "./types";

export type ObjectManagerOptions = {
  localPlayerId: PlayerId;
  /** インタラクトの条件になる、今の手持ち */
  getHeldItem: () => HeldItemRef;
  /** サーバーへの要求の送り先。開発時はダミーのサーバー役(dev/authority.ts)につなぐ */
  send: (request: InteractRequest) => void;
};

/**
 * ワールドのオブジェクトの写し。状態の正はサーバーで、ここはサーバーの通知(apply)を反映し、
 * 操作(interact)は要求として送るだけ。要求が通るかどうかはサーバーが決める
 */
export const createObjectManager = ({
  localPlayerId,
  getHeldItem,
  send,
}: ObjectManagerOptions) => {
  // state は変更のたびに新しいオブジェクトにする(useSyncExternalStore の参照同一性のため)
  let state: ObjectManagerState = {objects: []};
  const listeners = new Set<() => void>();
  const handlers: {
    [K in keyof ObjectEvents]: Set<(e: ObjectEvents[K]) => void>;
  } = {
    interactRejected: new Set(),
  };

  // コールバックの例外が他のコールバック・状態更新に影響しないようにする
  const set = (objects: readonly GameObject[]) => {
    state = {objects};
    for (const l of Array.from(listeners)) {
      try {
        l();
      } catch (e) {
        console.error(e);
      }
    }
  };

  const emit = <K extends keyof ObjectEvents>(
    event: K,
    payload: ObjectEvents[K],
  ) => {
    // 通知中に追加されたコールバックは、今回のイベントでは呼ばない
    for (const cb of Array.from(handlers[event])) {
      try {
        cb(payload);
      } catch (e) {
        console.error(e);
      }
    }
  };

  const find = (id: string): GameObject | undefined =>
    state.objects.find((o) => o.id === id);

  return {
    getState: (): ObjectManagerState => state,
    getObject: (id: string): GameObject | undefined => find(id),
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    on: <K extends keyof ObjectEvents>(
      event: K,
      callback: (e: ObjectEvents[K]) => void,
    ) => {
      handlers[event].add(callback);
      return () => {
        handlers[event].delete(callback);
      };
    },
    /** サーバーの通知を反映する。存在しない id の remove は無視する */
    apply: (message: ObjectMessage): void => {
      switch (message.type) {
        case "upsert": {
          const {object} = message;
          set(
            find(object.id)
              ? state.objects.map((o) => (o.id === object.id ? object : o))
              : [...state.objects, object],
          );
          return;
        }
        case "remove":
          if (find(message.id)) {
            set(state.objects.filter((o) => o.id !== message.id));
          }
          return;
        case "interactRejected":
          emit("interactRejected", {
            objectId: message.objectId,
            reason: message.reason,
          });
          return;
      }
    },
    /**
     * インタラクトの要求を送る。手持ちも一緒に渡す(インタラクトの条件になるため)。
     * 手元に無いオブジェクトは送らず false を返す。要求が通るかは、サーバーが検証して決める。
     * options.target は、対象の中から 1 つ選ぶ物(ディレクトリのファイルなど)で使う
     */
    interact: (objectId: string, options: InteractOptions = {}): boolean => {
      if (!find(objectId)) {
        return false;
      }
      send({
        type: "interact",
        objectId,
        by: localPlayerId,
        heldItem: getHeldItem(),
        ...(options.target !== undefined && {target: options.target}),
      });
      return true;
    },
  };
};

export type ObjectManager = ReturnType<typeof createObjectManager>;
