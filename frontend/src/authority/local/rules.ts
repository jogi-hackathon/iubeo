import {
  type CreatedStatus,
  FILE_KIND,
  type Item,
  isCreatedStatus,
  LIGHTER_KIND,
  parseFileData,
} from "../../items";
import type {Team} from "../../net/types";
import type {
  GameObject,
  HeldItemRef,
  InteractRequest,
  ObjectManager,
  RejectReason,
} from "../../objects";
import {CANVAS_ACTION_MS, CANVAS_KIND} from "../../objects/canvas/data";
import {
  DIRECTORY_KIND,
  type DirectoryData,
  type StockFile,
  parseDirectoryData,
} from "../../objects/directory/data";
import {
  LIGHTER_STAND_KIND,
  lighterIdOf,
  parseLighterStandData,
} from "../../objects/lighter_stand/data";
import {PC_ACTION_MS, PC_KIND} from "../../objects/pc/data";
import {
  WORKSPACE_ACTION_MS,
  WORKSPACE_KIND,
} from "../../objects/workspace/data";
import type {PlayerId} from "../../player/types";
import type {AuthorityMessage} from "../apply";
import type {AuthorityDev} from "../registry";

export const DUMMY_OBJECT_KIND = "dummy";
export const DUMMY_ITEM_KIND = "dummy_item";

type Deps = {
  playerId: PlayerId;
  objects: Pick<ObjectManager, "getObject" | "getState">;
  deliver: (message: AuthorityMessage) => void;
  schedule?: (fn: () => void, ms: number) => () => void;
  newId?: () => string;
};

const defaultSchedule = (fn: () => void, ms: number): (() => void) => {
  const id = setTimeout(fn, ms);
  return () => clearTimeout(id);
};

/**
 * ローカルのオーソリティの規則(実サーバーができるまでの窓口)。要求を受けて状態を決め、その結果を
 * サーバーと同じ形の通知(deliver)で出す。手持ちは規則が持つ(変わるたびに player.updated で通知する)。
 * 実サーバーの挙動の写しではなく、クライアントの管理を動かすための最小限の規則。
 * 開発用の操作(ダミーの箱を置く・借りる・手持ちを作る など)は、dev/localDevOps.ts が dev の入口を借りて行う
 *
 * - interact: 存在しなければ not_found、personal を owner 以外が触れば not_owner、使用不可なら
 *   unavailable で拒否。通れば、そのプレイヤーを users に出し入れする(personal は本人だけ、shared は複数人)
 * - ディレクトリ(kind "directory")の interact は、users の出し入れはせず、手持ちで決める:
 *   - 手ぶら + target: 在庫にあれば取り除き、そのファイルを手に持たせる(先着。無ければ not_found)。target が無ければ missing_item
 *   - ファイルを持って: 手持ちを消して、status で行き先を決める
 *     edited → 在庫に戻り達成 +1(同じファイルは 1 回だけ。取り出して入れ直しても増えない)、unedited → 在庫に戻るだけ、作成系(file_created / search_created / image_created)→ 成果物 +1
 *   - ライターを持って: 勝利フラグの fireStarted を立てる(火をつける)。bypassPermission が立つ前は missing_item、もう火がついていれば unavailable
 *     (実サーバーと同じ意味。燃やすのは演出なので、ファイルは消さず、ライターも持ったまま。ローカルにはセッションが無いので、決着はつけない)
 *   - それ以外を持って: missing_item
 * - キャンバス(kind "canvas")の interact は、アニメーション(CANVAS_ACTION_MS)を待って結果を返す
 *   (実サーバーの interact.go のキャンバスの規則と同じ意味。docs/backend/state-schema.md §5.4.1):
 *   - 作業中(users に誰かいる)なら unavailable
 *   - 手ぶら: 受理して users に入り、終わったら新しいファイル(status "image_created"、色なし)を手に持たせて users から出る
 *   - 何かを持って: missing_item(アニメーションは始めない)
 *   - 終わる時点で手を塞がれていたら、結果は適用せず users から出るだけ。作業中にキャンバスが消えたら、結果は適用しない
 * - PC(kind "pc")の interact は、キャンバスと同じ形で、アニメーション(PC_ACTION_MS)を待って結果を返す
 *   (実サーバーの interact.go の PC の規則と同じ意味。docs/backend/state-schema.md §5.4.2):
 *   - 作業中なら unavailable、何かを持って: missing_item、手ぶら: 終わったら新しいファイル(status "search_created"、色なし)を手に持たせる
 *   - 検索の成否(お題に合っているか)はクライアントが判定し、通ったときだけ interact が届く
 * - ワークスペース(kind "workspace")の interact は、アニメーション(WORKSPACE_ACTION_MS)を待って結果を返す:
 *   - 作業中(users に誰かいる)なら unavailable
 *   - ディレクトリから取り出した編集前のファイル(status "unedited")を持って: 受理して users に入り、終わったら同じ id・同じ color で status を "edited" にして users から出る
 *   - 手ぶら: 受理して users に入り、終わったら新しいファイル(status "file_created"、色なし)を手に持たせて users から出る
 *   - 編集済みのファイル / 作成したファイル(作成系。作成したファイルは編集しない) / ファイル以外を持って: missing_item(アニメーションは始めない)
 *   - 終わる時点で手持ちが変わって条件を外れていたら、結果は適用せず users から出るだけ。作業中にワークスペースが消えたら、結果は適用しない
 * - ライターの置き場(kind "lighter_stand")の interact(実サーバーの interact.go の置き場の規則と同じ意味。docs/backend/state-schema.md §5.5):
 *   - 手ぶら: 置き場にライターがあれば、それ(id は lighterIdOf(置き場))を手に持つ。無ければ not_found
 *   - その置き場のライターを持って: 置き場に戻す
 *   - それ以外を持って、または要求の手持ちの主張が実際と食い違えば: missing_item
 *   - 使えるのは勝利フラグの bypassPermission が立っている間だけ(置き場の availability。立つまでは共通の検証で unavailable)
 *
 * 勝利フラグ(team): サーバーではフェーズを生き残ると bypassPermission が、火をつけると fireStarted が立つ。
 * ローカルにはフェーズが無いので、どちらも開発用の操作(dev.setTeam)で切り替える(火をつけたときは fireStarted も規則が立てる)。
 * bypassPermission を切り替えると、置き場の availability が連動する
 *
 * 置いた物の追跡: deliver で、まだ無かった物を upsert した id を覚えておき、release で、その物だけを片付ける(外から置かれた物には触れない)
 */
export const createLocalRules = ({
  playerId,
  objects,
  deliver: deliverRaw,
  schedule = defaultSchedule,
  newId = () => crypto.randomUUID(),
}: Deps) => {
  const known = new Set<string>();
  let held: Item | null = null;
  const pending = new Set<() => void>();
  const later = (fn: () => void, ms: number): void => {
    let done = false;
    let cancel: (() => void) | null = null;
    cancel = schedule(() => {
      if (done) {
        return;
      }
      done = true;
      if (cancel) {
        pending.delete(cancel);
      }
      fn();
    }, ms);
    if (!done) {
      pending.add(cancel);
    }
  };
  const achievedIds = new Set<string>();
  let team: Team = {bypassPermission: false, fireStarted: false};

  const deliver = (message: AuthorityMessage): void => {
    if (message.type === "object.upsert") {
      if (!objects.getObject(message.object.id)) {
        known.add(message.object.id);
      }
    } else if (message.type === "object.remove") {
      known.delete(message.id);
    }
    deliverRaw(message);
  };
  const setHeld = (next: Item | null): void => {
    held = next;
    deliver({type: "player.updated", player: {playerId, heldItem: next}});
  };

  const reject = (objectId: string, reason: RejectReason) =>
    deliver({type: "object.interactRejected", objectId, reason});

  const setTeam = (patch: Partial<Team>): void => {
    const next = {...team, ...patch};
    if (
      next.bypassPermission === team.bypassPermission &&
      next.fireStarted === team.fireStarted
    ) {
      return;
    }
    const bypassChanged = next.bypassPermission !== team.bypassPermission;
    team = next;
    if (bypassChanged) {
      const returning =
        !next.bypassPermission && held?.kind === LIGHTER_KIND ? held.id : null;
      for (const o of objects.getState().objects) {
        if (o.kind === LIGHTER_STAND_KIND) {
          deliver({
            type: "object.upsert",
            object: {
              ...o,
              availability: next.bypassPermission ? "available" : "unavailable",
              ...(lighterIdOf(o.id) === returning && {
                data: {hasLighter: true},
              }),
            },
          });
        }
      }
      if (returning !== null) {
        setHeld(null);
      }
    }
    deliver({type: "team.updated", team});
  };

  const setDirectory = (object: GameObject, data: DirectoryData) =>
    deliver({type: "object.upsert", object: {...object, data}});

  const handleDirectory = (
    object: GameObject,
    heldRef: HeldItemRef,
    target: string | undefined,
  ) => {
    const data = parseDirectoryData(object.data);

    if (!heldRef) {
      if (target === undefined) {
        reject(object.id, "missing_item");
        return;
      }
      const file = data.stock.find((f) => f.id === target);
      if (!file) {
        reject(object.id, "not_found");
        return;
      }
      setDirectory(object, {
        ...data,
        stock: data.stock.filter((f) => f.id !== file.id),
      });
      setHeld({
        id: file.id,
        kind: FILE_KIND,
        data: {status: file.status, color: file.color},
      });
      return;
    }

    if (held && held.id === heldRef.id && held.kind === LIGHTER_KIND) {
      if (!team.bypassPermission) {
        reject(object.id, "missing_item");
      } else if (team.fireStarted) {
        reject(object.id, "unavailable");
      } else {
        setTeam({fireStarted: true});
      }
      return;
    }

    const file =
      held && held.id === heldRef.id && held.kind === FILE_KIND
        ? parseFileData(held.data)
        : null;
    if (!held || !file) {
      reject(object.id, "missing_item");
      return;
    }
    if (isCreatedStatus(file.status)) {
      setDirectory(object, {...data, outputs: data.outputs + 1});
    } else {
      const back: StockFile = {
        id: held.id,
        color: file.color ?? "#ffffff",
        status: file.status,
      };
      if (file.status === "edited") {
        achievedIds.add(held.id);
      }
      setDirectory(object, {...data, stock: [...data.stock, back]});
    }
    setHeld(null);
  };

  const spawnNew = (status: CreatedStatus): string => {
    const id = newId();
    setHeld({id, kind: FILE_KIND, data: {status}});
    return id;
  };

  const setUsers = (id: string, users: readonly PlayerId[]) => {
    const object = objects.getObject(id);
    if (object) {
      deliver({type: "object.upsert", object: {...object, users}});
    }
  };

  const heldUnedited = (id: string) => {
    const file =
      held && held.id === id && held.kind === FILE_KIND
        ? parseFileData(held.data)
        : null;
    return held && file && file.status === "unedited" ? {held, file} : null;
  };

  const handleWorkspace = (object: GameObject, request: InteractRequest) => {
    if (object.users.length > 0) {
      reject(object.id, "unavailable");
      return;
    }
    if ((request.heldItem?.id ?? null) !== (held?.id ?? null)) {
      reject(object.id, "missing_item");
      return;
    }
    if (held && !heldUnedited(held.id)) {
      reject(object.id, "missing_item");
      return;
    }
    const editingId = held?.id ?? null;

    setUsers(object.id, [request.by]);
    later(() => {
      if (!objects.getObject(object.id)) {
        return;
      }
      if (editingId === null) {
        if (held === null) {
          spawnNew("file_created");
        }
      } else {
        const current = heldUnedited(editingId);
        if (current) {
          setHeld({...current.held, data: {...current.file, status: "edited"}});
        }
      }
      setUsers(object.id, []);
    }, WORKSPACE_ACTION_MS);
  };

  const handleCanvas = (object: GameObject, request: InteractRequest) => {
    if (object.users.length > 0) {
      reject(object.id, "unavailable");
      return;
    }
    if (held || request.heldItem !== null) {
      reject(object.id, "missing_item");
      return;
    }

    setUsers(object.id, [request.by]);
    later(() => {
      if (!objects.getObject(object.id)) {
        return;
      }
      if (held === null) {
        spawnNew("image_created");
      }
      setUsers(object.id, []);
    }, CANVAS_ACTION_MS);
  };

  const handlePC = (object: GameObject, request: InteractRequest) => {
    if (object.users.length > 0) {
      reject(object.id, "unavailable");
      return;
    }
    if (held || request.heldItem !== null) {
      reject(object.id, "missing_item");
      return;
    }

    setUsers(object.id, [request.by]);
    later(() => {
      if (!objects.getObject(object.id)) {
        return;
      }
      if (held === null) {
        spawnNew("search_created");
      }
      setUsers(object.id, []);
    }, PC_ACTION_MS);
  };

  const handleLighterStand = (object: GameObject, request: InteractRequest) => {
    if ((request.heldItem?.id ?? null) !== (held?.id ?? null)) {
      reject(object.id, "missing_item");
      return;
    }
    const {hasLighter} = parseLighterStandData(object.data);
    const lighterId = lighterIdOf(object.id);
    if (!held) {
      if (!hasLighter) {
        reject(object.id, "not_found");
        return;
      }
      deliver({
        type: "object.upsert",
        object: {...object, data: {hasLighter: false}},
      });
      setHeld({id: lighterId, kind: LIGHTER_KIND, data: null});
      return;
    }
    if (held.kind === LIGHTER_KIND && held.id === lighterId) {
      deliver({
        type: "object.upsert",
        object: {...object, data: {hasLighter: true}},
      });
      setHeld(null);
      return;
    }
    reject(object.id, "missing_item");
  };

  const release = (): void => {
    for (const id of Array.from(known)) {
      if (objects.getObject(id)) {
        deliver({type: "object.remove", id});
      }
    }
    known.clear();
    setHeld(null);
  };

  const dev: AuthorityDev = {
    deliver,
    getObject: (id) => objects.getObject(id),
    getObjects: () => objects.getState().objects,
    getHeldItem: () => held,
    setHeldItem: (item) => setHeld(item),
    getAchieved: () => achievedIds.size,
    getTeam: () => team,
    setTeam,
  };

  return {
    handle: (request: InteractRequest): void => {
      const object = objects.getObject(request.objectId);
      if (!object) {
        reject(request.objectId, "not_found");
        return;
      }
      if (object.scope === "personal" && object.owner !== request.by) {
        reject(object.id, "not_owner");
        return;
      }
      if (object.availability === "unavailable") {
        reject(object.id, "unavailable");
        return;
      }
      if (object.kind === DIRECTORY_KIND) {
        handleDirectory(object, request.heldItem, request.target);
        return;
      }
      if (object.kind === WORKSPACE_KIND) {
        handleWorkspace(object, request);
        return;
      }
      if (object.kind === CANVAS_KIND) {
        handleCanvas(object, request);
        return;
      }
      if (object.kind === PC_KIND) {
        handlePC(object, request);
        return;
      }
      if (object.kind === LIGHTER_STAND_KIND) {
        handleLighterStand(object, request);
        return;
      }
      const using = object.users.includes(request.by);
      const users = using
        ? object.users.filter((u) => u !== request.by)
        : [...object.users, request.by];
      deliver({type: "object.upsert", object: {...object, users}});
    },

    dispose: (): void => {
      for (const cancel of Array.from(pending)) {
        cancel();
      }
      pending.clear();
    },
    release,
    dev,
  };
};

export type LocalRules = ReturnType<typeof createLocalRules>;
