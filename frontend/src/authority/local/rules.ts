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
