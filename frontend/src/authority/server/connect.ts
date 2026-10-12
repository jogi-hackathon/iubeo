import type {GameStore} from "../../game/gameStore";
import type {Item} from "../../items";
import type {
  GameResult,
  ServerMessageOf,
  SessionConnection,
  TransformSender,
} from "../../net";
import type {GameObject} from "../../objects";
import type {
  PlayerId,
  PlayerManager,
  PlayerStatus,
  PlayerTransform,
} from "../../player";
import type {Vec3} from "../../props/types";
import type {Spawn} from "../../scenes/spawn";
import {type ApplyDeps, applyMessage, applySnapshot} from "../apply";

type NetPlayerStatus = ServerMessageOf<"player.updated">["player"];
type NetTransform =
  ServerMessageOf<"transforms">["players"][number]["transform"];
type NetGameObject = ServerMessageOf<"object.upsert">["object"];

const toVec3 = (v: readonly number[]): Vec3 => [
  v[0] ?? 0,
  v[1] ?? 0,
  v[2] ?? 0,
];
const toObject = (o: NetGameObject): GameObject => ({...o}) as GameObject;
const toStatus = (p: NetPlayerStatus): PlayerStatus => ({
  playerId: p.playerId,
  kind: p.kind,
  seat: p.seat,
  connection: p.connection,
  life: p.life,
  heldItem: p.heldItem as Item | null,
});
const toTransform = (t: NetTransform): PlayerTransform => ({
  ...t,
  position: toVec3(t.position),
});
const toInitialTransform = (
  t: NetTransform | null,
  spawn: Spawn,
): PlayerTransform =>
  t
    ? toTransform(t)
    : {position: [...spawn.position], yaw: spawn.yaw, pitch: 0, seq: 0};

export type FirstPlacement =
  | {kind: "resume"; transform: PlayerTransform}
  | {kind: "spawn"; spawn: Spawn};

export type ConnectDeps = {
  connection: Pick<SessionConnection, "on">;
  sender: Pick<TransformSender, "syncSeq">;
  objects: ApplyDeps["objects"];
  items: ApplyDeps["items"];
  team?: ApplyDeps["team"];
  game?: Pick<
    GameStore,
    | "applySnapshot"
    | "started"
    | "phaseStarted"
    | "phaseEnded"
    | "taskCompleted"
    | "finished"
  >;
  players: Pick<PlayerManager, "apply">;
  playerId: PlayerId;
  spawnOf: (seat: number) => Spawn;
  onFirstSnapshot?: (placement: FirstPlacement | null) => void;
  onFinished?: (result: GameResult) => void;
};

export const connectSession = (deps: ConnectDeps): (() => void) => {
  const {
    connection,
    sender,
    players,
    playerId,
    spawnOf,
    onFirstSnapshot,
    game,
  } = deps;
  let firstSnapshot = true;
  const applyDeps: ApplyDeps = {
    objects: deps.objects,
    items: deps.items,
    myPlayerId: () => playerId,
    team: deps.team,
  };

  const offs = [
    connection.on("snapshot", ({session}) => {
      const me = session.players.find((p) => p.playerId === playerId);
      applySnapshot(applyDeps, {
        objects: session.objects.map(toObject),
        heldItem: me ? (me.heldItem as Item | null) : null,
        team: session.game.team,
      });
      game?.applySnapshot({
        status: session.status,
        game: session.game,
        serverTime: session.serverTime,
      });
      players.apply({
        type: "reset",
        players: session.players.map((p) => ({
          ...toStatus(p),
          transform: toInitialTransform(p.transform, spawnOf(p.seat)),
        })),
      });

      if (me) {
        sender.syncSeq(me.transform?.seq ?? 0);
      }
      if (firstSnapshot) {
        firstSnapshot = false;
        onFirstSnapshot?.(
          !me
            ? null
            : me.transform
              ? {kind: "resume", transform: toTransform(me.transform)}
              : {kind: "spawn", spawn: spawnOf(me.seat)},
        );
      }
    }),
    connection.on("session.started", () => game?.started()),
    connection.on("phase.started", ({phase, serverTime}) =>
      game?.phaseStarted(phase, serverTime),
    ),
    connection.on("phase.ended", ({next}) => game?.phaseEnded(next)),
    connection.on("task.completed", ({taskId, completedAt}) =>
      game?.taskCompleted(taskId, completedAt),
    ),
    connection.on("session.finished", ({result}) => {
      game?.finished(result);
      deps.onFinished?.(result);
    }),
    connection.on("object.upsert", (m) =>
      applyMessage(applyDeps, {
        type: "object.upsert",
        object: toObject(m.object),
      }),
    ),
    connection.on("object.remove", (m) =>
      applyMessage(applyDeps, {type: "object.remove", id: m.id}),
    ),
    connection.on("object.interactRejected", (m) =>
      applyMessage(applyDeps, {
        type: "object.interactRejected",
        objectId: m.objectId,
        reason: m.reason,
      }),
    ),
    connection.on("player.updated", ({player}) => {
      players.apply({type: "upsert", player: toStatus(player)});
      applyMessage(applyDeps, {
        type: "player.updated",
        player: {
          playerId: player.playerId,
          heldItem: player.heldItem as Item | null,
        },
      });
    }),
    connection.on("team.updated", ({team}) =>
      applyMessage(applyDeps, {type: "team.updated", team}),
    ),
    connection.on("transforms", ({players: moved}) =>
      players.apply({
        type: "transforms",
        players: moved.map((p) => ({
          playerId: p.playerId,
          transform: toTransform(p.transform),
        })),
      }),
    ),
  ];

  return () => {
    for (const off of offs) {
      off();
    }
  };
};
