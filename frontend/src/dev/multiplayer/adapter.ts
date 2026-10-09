import type {Item, ItemManager} from "../../items";
import type {
  ServerMessageOf,
  SessionConnection,
  TransformSender,
} from "../../net";
import type {GameObject, ObjectManager} from "../../objects";
import type {PlayerManager, PlayerStatus, PlayerTransform} from "../../player";
import type {Vec3} from "../../props/types";
import {spawnPosition} from "./layout";

type NetPlayerStatus = ServerMessageOf<"player.updated">["player"];
type NetTransform =
  ServerMessageOf<"transforms">["players"][number]["transform"];
type NetGameObject = ServerMessageOf<"object.upsert">["object"];

// スキーマの型(生成物)を、フロントの型に写す。中身の形は同じで、JSON の自由な中身(data)と
// Vec3(生成物では number[])だけ型が広いので、ここで絞る。サーバーは 3 要素で送る。
// サーバーは位置を持たないので、オブジェクトの位置と、まだ動いていないプレイヤーの位置は layout.ts で決める
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
  objects: Pick<ObjectManager, "getState" | "apply">;
  items: Pick<ItemManager, "getHeld" | "apply">;
  players: Pick<PlayerManager, "apply" | "getState" | "getLocalTransform">;
  sender: Pick<TransformSender, "syncSeq">;
  /** その接続で最初の snapshot に、サーバーが持つ自分の位置と向き(まだ無ければ席の初期位置)を渡す(身体をそこへ移す用) */
  onFirstSnapshot?: (transform: PlayerTransform) => void;
};

/**
 * サーバーのメッセージを、各 Manager の通知に振り分ける(実サーバーとつなぐときの経路)。戻り値で解除する。
 *
 * - snapshot: オブジェクト・プレイヤーを丸ごと入れ替え、自分の手持ちを合わせる。送る側の seq をサーバーに合わせる
 * - object.*: objectManager へそのまま
 * - player.updated: playerManager へ。自分の手持ちの変化は itemManager の spawn / delete に直す
 * - transforms: playerManager へ(自分の分は playerManager が捨てる)
 */
export const connectManagers = ({
  connection,
  objects,
  items,
  players,
  sender,
  onFirstSnapshot,
}: AdapterDeps): (() => void) => {
  let firstSnapshot = true;

  /** 自分の手持ちを、サーバーの heldItem に合わせる */
  const syncHeld = (heldItem: Item | null) => {
    const held = items.getHeld();
    if (heldItem) {
      // 同じ id でも、中身(編集済みなど)が変わっていれば spawn で更新する
      if (JSON.stringify(held) !== JSON.stringify(heldItem)) {
        items.apply({type: "spawn", item: heldItem});
      }
    } else if (held) {
      items.apply({type: "delete", id: held.id});
    }
  };

  const isMe = (playerId: string) =>
    players.getState().localPlayerId === playerId;

  const offs = [
    connection.on("snapshot", ({session}) => {
      const next = session.objects.map(toObject);
      const ids = new Set(next.map((o) => o.id));
      for (const o of objects.getState().objects) {
        if (!ids.has(o.id)) {
          objects.apply({type: "remove", id: o.id});
        }
      }
      for (const object of next) {
        objects.apply({type: "upsert", object});
      }

      players.apply({
        type: "reset",
        players: session.players.map((p) => ({
          ...toStatus(p),
          transform: toInitialTransform(p.transform, p.seat),
        })),
      });
      const me = session.players.find((p) => isMe(p.playerId));
      syncHeld(me ? (me.heldItem as Item | null) : null);

      const local = players.getLocalTransform();
      if (local) {
        sender.syncSeq(local.seq);
        if (firstSnapshot) {
          onFirstSnapshot?.(local);
        }
      }
      firstSnapshot = false;
    }),
    connection.on("object.upsert", ({object}) =>
      objects.apply({type: "upsert", object: toObject(object)}),
    ),
    connection.on("object.remove", ({id}) =>
      objects.apply({type: "remove", id}),
    ),
    connection.on("object.interactRejected", ({objectId, reason}) =>
      objects.apply({type: "interactRejected", objectId, reason}),
    ),
    connection.on("player.updated", ({player}) => {
      const status = toStatus(player);
      players.apply({type: "upsert", player: status});
      if (isMe(status.playerId)) {
        syncHeld(status.heldItem);
      }
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
