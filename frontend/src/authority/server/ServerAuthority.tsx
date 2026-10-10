import {useEffect, useRef} from "react";

import {resetSpectate} from "../../core/spectate";
import {gameStore} from "../../game/gameStore";
import {itemManager} from "../../items";
import {
  createSessionConnection,
  createTransformSender,
  type InteractMessage,
} from "../../net";
import {objectManager} from "../../objects";
import {localPlayer, type PlayerId, playerManager} from "../../player";
import type {SceneName} from "../../scenes";
import {markSceneReady} from "../../scenes/sceneReady";
import {applySpawn, type Spawn} from "../../scenes/spawn";
import {authorityRegistry} from "../registry";
import {teamStore} from "../team";
import {connectSession} from "./connect";

export type ServerAuthorityProps = {
  /** このオーソリティを置いたシーン(準備完了の報告先) */
  scene: SceneName;
  sessionId: string;
  /** 自分のプレイヤー ID(サーバーが発行した物。POST /api/v1/players) */
  playerId: PlayerId;
  /** 席のスポーン地点(シーンが決める。サーバーは最初の位置を配らない) */
  spawnOf: (seat: number) => Spawn;
  /** 最初の snapshot を受け取って、自分を置いた後(= シーンの準備完了の後)に呼ぶ */
  onReady?: () => void;
  /** 決着の通知(session.finished)を受けたときに呼ぶ(結果は gameStore に入っている) */
  onFinished?: () => void;
  /**
   * 接続が終わった(再接続を諦めた、またはセッション終了 4000 / 置き換え 4001)ときに呼ぶ。
   * reason はサーバーが close に付けた理由(finished / dissolved / abandoned / replaced など)。アンマウントでは呼ばない
   */
  onClosed?: (code: number, reason: string) => void;
};

const clearWorld = () => {
  for (const o of objectManager.getState().objects) {
    objectManager.apply({type: "remove", id: o.id});
  }
  const held = itemManager.getHeld();
  if (held) {
    itemManager.apply({type: "delete", id: held.id});
  }
  teamStore.reset();
  gameStore.reset();
  resetSpectate();
};

/**
 * サーバー(Go)のセッションにつなぐオーソリティ。シーンの中に置くと、マウントでつなぎ、アンマウントで片付ける。
 * シーンの中で sessionId / playerId が変わることは想定しない(変われば作り直す)。
 *
 * - マウント: 場を空け、セッションの WebSocket を作り、メッセージを各 Manager へ流し(connectSession)、
 *   窓口として登録し(要求は interact を WebSocket で送る)、自分の位置の送信(TransformSender)を持つ。
 * - 最初の snapshot(準備完了): サーバーが自分の位置を持っていれば(再読み込み・再参加)そこへ、無ければ席のスポーン地点へ置く。
 *   送る側の seq を合わせて送信を始め、markSceneReady(scene) して onReady を呼ぶ。
 *   snapshot は、全員がそろうのを待っている間にも届く(ゲームの開始は session.started で別)。
 * - 接続が終わったら onClosed(code)。最初の snapshot の前に終わったときも、覆いが外れなくならないよう先に markSceneReady する。
 * - error メッセージはログに出すだけ。
 * - アンマウント: 送信を止め、購読を解き、窓口を外し、WebSocket を閉じ、物と手持ちを空け、プレイヤーを空にする(onClosed は呼ばない)
 */
export function ServerAuthority({
  scene,
  sessionId,
  playerId,
  spawnOf,
  onReady,
  onFinished,
  onClosed,
}: ServerAuthorityProps) {
  const latest = useRef({spawnOf, onReady, onFinished, onClosed});
  latest.current = {spawnOf, onReady, onFinished, onClosed};

  useEffect(() => {
    let disposed = false;
    let ready = false;
    clearWorld();

    const connection = createSessionConnection({sessionId});
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
      send: (m) => connection.send(m),
    });

    const offConnect = connectSession({
      connection,
      sender,
      objects: objectManager,
      items: itemManager,
      team: teamStore,
      game: gameStore,
      players: playerManager,
      playerId,
      spawnOf: (seat) => latest.current.spawnOf(seat),
      onFirstSnapshot: (placement) => {
        if (placement?.kind === "resume") {
          const {position, yaw, pitch} = placement.transform;
          applySpawn(localPlayer, {position, yaw});
          localPlayer.pitch = pitch;
        } else if (placement?.kind === "spawn") {
          applySpawn(localPlayer, placement.spawn);
        } else {
          console.warn(
            "[ServerAuthority] snapshot に自分が居ないので、置き場所を決められない",
          );
        }
        sender.start();
        ready = true;
        markSceneReady(scene);
        latest.current.onReady?.();
      },
      onFinished: () => latest.current.onFinished?.(),
    });
    const offError = connection.on("error", (m) => {
      console.error("[ServerAuthority] サーバーのエラー", m);
    });
    const offAuthority = authorityRegistry.register({
      playerId,
      kind: "server",
      send: ({objectId, heldItem, target}) => {
        connection.send({
          type: "interact",
          objectId,
          heldItem: heldItem as InteractMessage["heldItem"],
          ...(target !== undefined && {target}),
        });
      },
    });
    const offState = connection.subscribe(() => {
      const state = connection.getState();
      if (disposed || state.status !== "closed") {
        return;
      }
      sender.stop();
      if (!ready) {
        markSceneReady(scene);
      }
      latest.current.onClosed?.(state.closeCode ?? 0, state.closeReason ?? "");
    });

    return () => {
      disposed = true;
      offState();
      sender.stop();
      offConnect();
      offError();
      offAuthority();
      connection.close();
      clearWorld();
      playerManager.apply({type: "reset", players: []});
    };
  }, [scene, sessionId, playerId]);

  return null;
}
