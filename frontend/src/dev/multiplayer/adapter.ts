import {
  type ApplyDeps,
  applyMessage,
  applySnapshot,
} from "../../authority/apply";
import type {Item} from "../../items";
import type {
  ServerMessageOf,
  SessionConnection,
  TransformSender,
} from "../../net";
import type {GameObject} from "../../objects";
import type {PlayerManager, PlayerStatus, PlayerTransform} from "../../player";
import type {Vec3} from "../../props/types";
import {spawnPosition} from "./layout";

// サーバーの形(生成物)を、フロントの型に写す。中身の形は同じで、JSON の自由な中身(data)と
// Vec3(生成物では number[])だけ型が広いので、ここで絞る。サーバーは 3 要素で送る。
// サーバーは位置を持たないので、オブジェクトの位置と、まだ動いていないプレイヤーの位置は layout.ts で決める

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
/** snapshot の transform。サーバーがまだ受け取っていない(null)なら、席の初期位置に置く */
const toInitialTransform = (
  t: NetTransform | null,
  seat: number,
): PlayerTransform =>
  t
    ? toTransform(t)
    : {position: spawnPosition(seat), yaw: 0, pitch: 0, seq: 0};

export type AdapterDeps = {
  connection: Pick<SessionConnection, "on">;
  sender: Pick<TransformSender, "syncSeq">;
  objects: ApplyDeps["objects"];
  items: ApplyDeps["items"];
  players: Pick<PlayerManager, "apply" | "getState" | "getLocalTransform">;
  /** その接続で最初の snapshot に、サーバーが持つ自分の位置と向き(まだ無ければ席の初期位置)を渡す(身体をそこへ移す用) */
  onFirstSnapshot?: (transform: PlayerTransform) => void;
};

/**
 * サーバーのメッセージを、各 Manager の通知に振り分ける(実サーバーとつなぐときの経路)。戻り値で解除する。
 * オブジェクトと自分の手持ちの反映は、ローカルの規則と同じ authority/apply.ts の関数で行う。
 * ここは、プレイヤー(位置・席・接続)の写しと、接続の購読、snapshot 後の送る側の seq 合わせを持つ
 *
 * - snapshot: オブジェクトと手持ちを丸ごと入れ替え(applySnapshot)、プレイヤーを入れ替え、送る側の seq をサーバーに合わせる
 * - object.*: applyMessage(オブジェクトの通知)
 * - player.updated: プレイヤーの写し(playerManager)と、自分の手持ち(applyMessage)
 * - transforms: playerManager へ(自分の分は playerManager が捨てる)
 */
export const connectManagers = (deps: AdapterDeps): (() => void) => {
  const {connection, sender, players, onFirstSnapshot} = deps;
  let firstSnapshot = true;
  const applyDeps: ApplyDeps = {
    objects: deps.objects,
    items: deps.items,
    myPlayerId: () => players.getState().localPlayerId,
  };

  const offs = [
    connection.on("snapshot", ({session}) => {
      // 自分の手持ちは、プレイヤーを入れ替える前の自分の ID で決める
      const myId = players.getState().localPlayerId;
      const me = session.players.find((p) => p.playerId === myId);
      applySnapshot(applyDeps, {
        objects: session.objects.map(toObject),
        heldItem: me ? (me.heldItem as Item | null) : null,
      });
      players.apply({
        type: "reset",
        players: session.players.map((p) => ({
          ...toStatus(p),
          transform: toInitialTransform(p.transform, p.seat),
        })),
      });

      const local = players.getLocalTransform();
      if (local) {
        sender.syncSeq(local.seq);
        if (firstSnapshot) {
          onFirstSnapshot?.(local);
        }
      }
      firstSnapshot = false;
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
