import {describe, expect, it, vi} from "vitest";

import {applyMessage} from "../../authority/apply";
import {createLocalRules} from "../../authority/local/rules";
import {isPlayerControlLocked} from "../../core/playerControl";
import {createItemManager} from "../../items/itemManager";
import {CANVAS_KIND} from "../canvas/data";
import {controlLockEffect, isWorkingAt} from "../controlLock";
import {createObjectManager} from "../objectManager";
import type {GameObject, ObjectAvailability} from "../types";
import {WORKSPACE_KIND} from "../workspace/data";

const setup = () => {
  const items = createItemManager();
  const timers: Array<() => void> = [];
  const objects = createObjectManager({
    getHeldItem: () => {
      const held = items.getHeld();
      return held && {id: held.id, kind: held.kind};
    },
    getAuthority: () => ({
      playerId: "me",
      kind: "local",
      send: (r) => rules.handle(r),
    }),
  });
  const rules = createLocalRules({
    playerId: "me",
    objects,
    deliver: (message) =>
      applyMessage({objects, items, myPlayerId: () => "me"}, message),
    schedule: (fn) => {
      timers.push(fn);
      return () => {};
    },
  });
  const put = (object: GameObject): string => {
    rules.dev.deliver({type: "object.upsert", object});
    return object.id;
  };
  const spawn = (id: string, kind: string): string =>
    put({
      id,
      kind,
      scope: "personal",
      owner: "me",
      users: [],
      availability: "available",
      data: null,
    });
  const authority = {
    ...rules,
    spawnWorkspace: (id: string): string => spawn(id, WORKSPACE_KIND),
    spawnCanvas: (id: string): string => spawn(id, CANVAS_KIND),
    setAvailability: (id: string, availability: ObjectAvailability): void => {
      const object = objects.getObject(id);
      if (object) {
        put({...object, availability});
      }
    },
    deleteHeldItem: (): void => rules.dev.setHeldItem(null),
    removeObject: (id: string): void => {
      rules.dev.deliver({type: "object.remove", id});
    },
  };
  const working = (id: string) => {
    const object = objects.getObject(id);
    return object !== undefined && isWorkingAt(object, "me");
  };
  return {
    objects,
    items,
    authority,
    working,
    finish: () => timers.splice(0).forEach((f) => f()),
  };
};

describe("isWorkingAt(objectManager とローカルの窓口につないだ導出)", () => {
  it("自分が users に入っている間だけ true", () => {
    const {objects, authority, working, finish} = setup();
    const id = authority.spawnWorkspace("workspace-1");
    expect(working(id)).toBe(false);

    objects.interact(id);
    expect(working(id)).toBe(true);

    finish();
    expect(working(id)).toBe(false);
  });

  it("キャンバスも、自分が users に入っている間は true", () => {
    const {objects, authority, working, finish} = setup();
    const id = authority.spawnCanvas("canvas-1");
    expect(working(id)).toBe(false);

    objects.interact(id);
    expect(working(id)).toBe(true);

    finish();
    expect(working(id)).toBe(false);
  });

  it("他のプレイヤーが作業中の間は、自分は作業中にならない", () => {
    const {objects, authority, working} = setup();
    const ws = authority.spawnWorkspace("workspace-1");
    objects.apply({
      type: "upsert",
      object: {...objects.getObject(ws)!, users: ["other"]},
    });
    expect(working(ws)).toBe(false);
  });

  it("拒否されたとき(missing_item・unavailable)は、users に入らないので true にならない", () => {
    const {objects, authority, working} = setup();
    const onRejected = vi.fn();
    objects.on("interactRejected", onRejected);
    const id = authority.spawnWorkspace("workspace-1");
    authority.dev.setHeldItem({id: "l", kind: "lighter", data: null});

    objects.interact(id);

    expect(onRejected).toHaveBeenCalledWith({
      objectId: id,
      reason: "missing_item",
    });
    expect(working(id)).toBe(false);

    authority.setAvailability(id, "unavailable");
    authority.deleteHeldItem();
    objects.interact(id);
    expect(onRejected).toHaveBeenLastCalledWith({
      objectId: id,
      reason: "unavailable",
    });
    expect(working(id)).toBe(false);
  });

  it("作業中にワークスペースが remove されたら、作業中のオブジェクトは無くなる", () => {
    const {objects, authority, working} = setup();
    const id = authority.spawnWorkspace("workspace-1");
    objects.interact(id);
    expect(working(id)).toBe(true);

    authority.removeObject(id);

    expect(working(id)).toBe(false);
  });
});

describe("controlLockEffect", () => {
  it("作業中は移動・視点とカメラを預かり、後始末(アンマウント・作業の終わり)で返す", () => {
    expect(isPlayerControlLocked()).toBe(false);

    const cleanup = controlLockEffect(true);
    expect(isPlayerControlLocked()).toBe(true);

    cleanup?.();
    expect(isPlayerControlLocked()).toBe(false);
  });

  it("作業中でなければ預からない", () => {
    expect(controlLockEffect(false)).toBeUndefined();
    expect(isPlayerControlLocked()).toBe(false);
  });

  it("後始末を二重に呼んでも、他の預かり(俯瞰など)を外さない", () => {
    const other = controlLockEffect(true);
    const cleanup = controlLockEffect(true);

    cleanup?.();
    cleanup?.();

    expect(isPlayerControlLocked()).toBe(true);
    other?.();
    expect(isPlayerControlLocked()).toBe(false);
  });

  it("二つのオブジェクトが同時に作業中でも、片方が終わっても預かりは残り、両方終わると外れる", () => {
    const workspace = controlLockEffect(true);
    const canvas = controlLockEffect(true);

    workspace?.();
    expect(isPlayerControlLocked()).toBe(true);

    canvas?.();
    expect(isPlayerControlLocked()).toBe(false);
  });
});
