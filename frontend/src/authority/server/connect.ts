import type {Item} from "../../items";
import type {
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

/**
 * 最初の snapshot で決まる、自分の置き場所。
 * - resume: サーバーが自分の位置を持っている(再読み込み・再参加)ので、そこから再開する
 * - spawn: まだ持っていない(初参加)ので、自分の席のスポーン地点に置く
 */
export type FirstPlacement =
  | {kind: "resume"; transform: PlayerTransform}
  | {kind: "spawn"; spawn: Spawn};

export type ConnectDeps = {
  connection: Pick<SessionConnection, "on">;
  sender: Pick<TransformSender, "syncSeq">;
  objects: ApplyDeps["objects"];
  items: ApplyDeps["items"];
  players: Pick<PlayerManager, "apply">;
  /** 自分のプレイヤー ID(このセッションでの)。手持ちの反映と、自分の位置の取り出しに使う */
  playerId: PlayerId;
  /** 席のスポーン地点(シーンが決める。サーバーは最初の位置を配らない) */
  spawnOf: (seat: number) => Spawn;
  /**
   * その接続で最初の snapshot で、自分の置き場所を渡す(身体をそこへ移す用)。
   * 自分が snapshot に居なければ null(サーバーの不具合。置き場所は決められない)
   */
  onFirstSnapshot?: (placement: FirstPlacement | null) => void;
};

/**
 * サーバーのメッセージを、各 Manager の通知に振り分ける(ServerAuthority の経路)。戻り値で解除する。
 * オブジェクトと自分の手持ちの反映は、ローカルの規則と同じ authority/apply.ts の関数で行う。
 * ここは、プレイヤー(位置・席・接続)の写しと、接続の購読、snapshot 後の送る側の seq 合わせを持つ。
 * 自分のプレイヤー ID は playerId を使う(playerManager の持ち物ではない)
 *
 * - snapshot: オブジェクトと手持ちを丸ごと入れ替え(applySnapshot)、プレイヤーを入れ替え、送る側の seq をサーバーに合わせる。
 *   位置がまだ無いプレイヤーは席のスポーン地点に置く。自分の置き場所は、最初の snapshot でだけ渡す(2 回目以降は動かさない)
 * - object.*: applyMessage(オブジェクトの通知)
 * - player.updated: プレイヤーの写し(playerManager)と、自分の手持ち(applyMessage)
 * - transforms: playerManager へ(自分の分は playerManager が捨てる)
 */
export const connectSession = (deps: ConnectDeps): (() => void) => {
  const {connection, sender, players, playerId, spawnOf, onFirstSnapshot} =
    deps;
  let firstSnapshot = true;
  const applyDeps: ApplyDeps = {
    objects: deps.objects,
    items: deps.items,
    myPlayerId: () => playerId,
  };

  const offs = [
    connection.on("snapshot", ({session}) => {
      const me = session.players.find((p) => p.playerId === playerId);
      applySnapshot(applyDeps, {
        objects: session.objects.map(toObject),
        heldItem: me ? (me.heldItem as Item | null) : null,
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
