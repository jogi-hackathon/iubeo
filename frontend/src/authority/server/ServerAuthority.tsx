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
  scene: SceneName;
  sessionId: string;
  playerId: PlayerId;
  spawnOf: (seat: number) => Spawn;
  onReady?: () => void;
  onFinished?: () => void;
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
