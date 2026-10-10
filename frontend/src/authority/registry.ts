import type {Item} from "../items/types";
import type {Team} from "../net/types";
import type {GameObject, InteractRequest} from "../objects/types";
import type {PlayerId} from "../player/types";
import type {AuthorityMessage} from "./apply";

/**
 * 開発用の窓口(ローカルのオーソリティが持つ、状態を読む・書く入口)。開発の操作(dev/localDevOps.ts)だけが使う。
 * 本番の経路(objectManager の要求、apply)は使わない。サーバーの窓口には無い
 * - deliver: サーバーと同じ形の通知を出す(反映は apply.ts の applyMessage と同じ)
 * - getObject / getObjects: オブジェクトを読む
 * - getHeldItem / setHeldItem: 手持ちを読む・置き換える(置き換えは player.updated で通知する)
 * - getAchieved: 達成の数(サーバーが数える物。デバッグパネル用)
 * - getTeam / setTeam: 勝利フラグ(ローカルでは規則が持ち、変わると team.updated で通知する)を読む・書き換える。
 *   画面は、通知を反映した teamStore(authority/team)を読む
 */
export type AuthorityDev = {
  deliver: (message: AuthorityMessage) => void;
  getObject: (id: string) => GameObject | undefined;
  getObjects: () => readonly GameObject[];
  getHeldItem: () => Item | null;
  setHeldItem: (item: Item | null) => void;
  getAchieved: () => number;
  getTeam: () => Team;
  setTeam: (patch: Partial<Team>) => void;
};

/**
 * オーソリティ(状態の正を持つ側。ローカルのルール、またはサーバー)の窓口。
 * playerId は、このオーソリティから見た自分の ID で、要求の by になる(LOCAL_PLAYER_ID のような固定値は持たない)。
 * send は、オブジェクトの要求を受け取る。kind は、今どちらの窓口か(デバッグパネルの表示用)。
 * dev は、開発用の入口(ローカルのオーソリティだけが持つ。無ければ開発の操作は使えない)
 */
export type AuthorityHandle = {
  playerId: PlayerId;
  kind: "local" | "server";
  send: (request: InteractRequest) => void;
  dev?: AuthorityDev;
};

export type AuthorityRegistry = {
  /** オーソリティを登録する。後から登録したものが今の窓口になる。戻り値で外す(外すと、その前の窓口に戻る) */
  register: (handle: AuthorityHandle) => () => void;
  /** 今の窓口。登録が無ければ null */
  current: () => AuthorityHandle | null;
  /** 今の窓口が変わったら呼ばれる(useSyncExternalStore 用) */
  subscribe: (listener: () => void) => () => void;
};

/**
 * 登録の積み重ね。最後に登録した物が窓口になり、外すと、その下にあった物が戻る。
 * 同じ登録を 2 回外しても、何もしない
 */
export const createAuthorityRegistry = (): AuthorityRegistry => {
  // 登録の順(古い → 新しい)。窓口は末尾
  let stack: AuthorityHandle[] = [];
  const listeners = new Set<() => void>();

  const notify = () => {
    for (const l of Array.from(listeners)) {
      try {
        l();
      } catch (e) {
        console.error(e);
      }
    }
  };

  return {
    register: (handle) => {
      // 同じ参照を 2 回登録しても、外すのは片方ずつになるように、登録ごとに別の箱に包む
      const entry: AuthorityHandle = {...handle};
      stack = [...stack, entry];
      notify();
      return () => {
        if (!stack.includes(entry)) {
          return;
        }
        stack = stack.filter((h) => h !== entry);
        notify();
      };
    },
    current: () => stack[stack.length - 1] ?? null,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
};

/** アプリ全体で 1 つの窓口(objectManager・controlLock・シーンのオーソリティが使う) */
export const authorityRegistry = createAuthorityRegistry();
