import {authorityRegistry} from "../../authority/registry";
import {itemManager} from "../../items";
import {
  ApiError,
  createApiClient,
  createSessionConnection,
  createTransformSender,
  type InteractMessage,
  type SessionConnection,
  type SocketStatus,
} from "../../net";
import {objectManager} from "../../objects";
import {localPlayer, playerManager} from "../../player";
import {connectManagers} from "./adapter";

/** 開発用ローカルマルチの進み具合(パネル表示用) */
export type DevMultiplayerStatus =
  | {phase: "idle"}
  | {phase: "joining"}
  | {
      phase: "queued";
      playerId: string;
      /** 待機を始めた時刻(サーバーの queuedAt) */
      queuedAt: string;
    }
  | {
      phase: "connected";
      playerId: string;
      sessionId: string;
      socket: SocketStatus;
    }
  | {phase: "error"; message: string};

let status: DevMultiplayerStatus = {phase: "idle"};
const listeners = new Set<() => void>();
const setStatus = (next: DevMultiplayerStatus) => {
  status = next;
  for (const l of Array.from(listeners)) {
    l();
  }
};

export const devMultiplayerStatus = {
  get: (): DevMultiplayerStatus => status,
  subscribe: (listener: () => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
};

/** マッチングの状況を見る間隔 */
const POLL_MS = 1000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * 開発用ローカルマルチを始める(MultiplayerTestScene に入ったとき)。戻り値で止める。
 * 実サーバーと同じ経路で動かす: プレイヤーを作り(Cookie)、参加中のセッションがあればそこへ、
 * 無ければ自動マッチングで待ち、WebSocket でつなぐ。つながったら、そのセッションを窓口(authorityRegistry)に登録する。
 * 手持ちは、前のシーンの LocalAuthority が片付けた後なので空で始まり、次のシーンの LocalAuthority が決める(退避も復元もしない)。止めたら窓口を外す。
 * 止めるのはシーンを離れたときで、そのときには新しいシーンの物が置いてあるので、入る前の物は戻さない
 * (オブジェクトは、今ある物を片付けるだけ。置き直しは次のシーンの LocalAuthority が行う)
 */
export const startDevMultiplayer = (): (() => void) => {
  const api = createApiClient();
  let stopped = false;
  let queued = false;
  let connection: SessionConnection | null = null;
  const offs: Array<() => void> = [];

  // 場を空ける
  const clearWorld = () => {
    for (const o of objectManager.getState().objects) {
      objectManager.apply({type: "remove", id: o.id});
    }
    const held = itemManager.getHeld();
    if (held) {
      itemManager.apply({type: "delete", id: held.id});
    }
  };
  clearWorld();
  // つながって窓口を登録するまでは、窓口が無いので要求は送られない(objectManager.interact は false)
  let offAuthority: (() => void) | undefined;

  const sender = createTransformSender({
    read: () => ({
      position: [
        localPlayer.position.x,
        localPlayer.position.y,
        localPlayer.position.z,
      ],
      yaw: localPlayer.yaw,
      pitch: localPlayer.pitch,
    }),
    send: (m) => connection?.send(m) ?? false,
  });

  const fail = (e: unknown) => {
    if (stopped) {
      return;
    }
    console.error("[dev multiplayer]", e);
    setStatus({
      phase: "error",
      message: e instanceof Error ? e.message : String(e),
    });
  };

  const run = async () => {
    setStatus({phase: "joining"});
    const me = await api.createPlayer();
    if (stopped) {
      return;
    }
    playerManager.setLocalPlayerId(me.playerId);

    let sessionId = me.sessionId;
    if (!sessionId) {
      // 既に待機列にいれば 409。そのままポーリングに進む
      await api.joinMatchmaking().catch((e: unknown) => {
        if (!(e instanceof ApiError && e.status === 409)) {
          throw e;
        }
      });
      queued = true;
      while (!stopped && !sessionId) {
        const mm = await api.getMatchmaking();
        sessionId = mm.status === "matched" ? (mm.sessionId ?? null) : null;
        if (!sessionId && !stopped) {
          setStatus({
            phase: "queued",
            playerId: me.playerId,
            queuedAt: mm.queuedAt,
          });
          await sleep(POLL_MS);
        }
      }
      queued = false;
    }
    if (stopped || !sessionId) {
      return;
    }

    const conn = createSessionConnection({sessionId});
    connection = conn;
    const id = sessionId;
    const show = () =>
      setStatus({
        phase: "connected",
        playerId: me.playerId,
        sessionId: id,
        socket: conn.getState().status,
      });
    show();
    offs.push(conn.subscribe(show));
    offs.push(
      connectManagers({
        connection: conn,
        objects: objectManager,
        items: itemManager,
        players: playerManager,
        sender,
        onFirstSnapshot: ({position, yaw, pitch}) => {
          localPlayer.position.set(...position);
          localPlayer.velocity.set(0, 0, 0);
          localPlayer.yaw = yaw;
          localPlayer.pitch = pitch;
        },
      }),
    );
    offAuthority = authorityRegistry.register({
      playerId: me.playerId,
      kind: "server",
      send: ({objectId, heldItem, target}) => {
        conn.send({
          type: "interact",
          objectId,
          // kind はフロントでは string。値の正しさはサーバーが検証する
          heldItem: heldItem as InteractMessage["heldItem"],
          ...(target !== undefined && {target}),
        });
      },
    });
    sender.start();
  };

  run().catch(fail);

  return () => {
    stopped = true;
    sender.stop();
    for (const off of offs.splice(0)) {
      off();
    }
    offAuthority?.();
    offAuthority = undefined;
    connection?.close();
    connection = null;
    if (queued) {
      api.leaveMatchmaking().catch(() => {});
    }
    clearWorld();
    playerManager.apply({type: "reset", players: []});
    playerManager.setLocalPlayerId(null);
    setStatus({phase: "idle"});
  };
};
