import {describe, expect, it, vi} from "vitest";

import {isPlayerControlLocked} from "../../core/playerControl";
import {createDummyAuthority} from "../../dev/dummyAuthority";
import {createItemManager} from "../../items/itemManager";
import {controlLockEffect, isWorkingAtObject} from "../controlLock";
import {createObjectManager} from "../objectManager";

// useObjectControlLock と同じ導出(状態 → 作業中か → 預かり)を、objectManager とつないで確かめる。
// 預かり自体は実物(core/playerControl)で数える
const setup = () => {
  const items = createItemManager();
  const timers: Array<() => void> = [];
  let handle: Parameters<typeof createObjectManager>[0]["send"] = () => {};
  const objects = createObjectManager({
    localPlayerId: "me",
    getHeldItem: () => {
      const held = items.getHeld();
      return held && {id: held.id, kind: held.kind};
    },
    send: (r) => handle(r),
  });
  const authority = createDummyAuthority({
    localPlayerId: "me",
    objects,
    items,
    schedule: (fn) => {
      timers.push(fn);
    },
  });
  handle = authority.handle;
  const working = () => isWorkingAtObject(objects.getState().objects, "me");
  return {
    objects,
    items,
    authority,
    working,
    finish: () => timers.splice(0).forEach((f) => f()),
  };
};

describe("isWorkingAtObject", () => {
  it("ワークスペースの users に自分が入っている間だけ true", () => {
    const {objects, authority, working, finish} = setup();
    const id = authority.spawnWorkspace([0, 0, -3]);
    expect(working()).toBe(false);

    objects.interact(id);
    expect(working()).toBe(true);

    finish();
    expect(working()).toBe(false);
  });

  it("キャンバスの users に自分が入っている間も true", () => {
    const {objects, authority, working, finish} = setup();
    const id = authority.spawnCanvas([0, 0, -3]);
    expect(working()).toBe(false);

    objects.interact(id);
    expect(working()).toBe(true);

    finish();
    expect(working()).toBe(false);
  });

  it("ワークスペース・キャンバス以外のオブジェクトの users や、他のプレイヤーの作業では true にならない", () => {
    const {objects, authority, working} = setup();
    const dummy = authority.spawnObject([0, 1, -3], "personal");
    objects.interact(dummy);
    expect(working()).toBe(false);

    const ws = authority.spawnWorkspace([0, 0, -3]);
    objects.apply({
      type: "upsert",
      object: {...objects.getObject(ws)!, users: ["other"]},
    });
    expect(working()).toBe(false);
  });

  it("拒否されたとき(missing_item・unavailable)は、users に入らないので true にならない", () => {
    const {objects, items, authority, working} = setup();
    const onRejected = vi.fn();
    objects.on("interactRejected", onRejected);
    const id = authority.spawnWorkspace([0, 0, -3]);
    items.apply({type: "spawn", item: {id: "l", kind: "lighter", data: null}});

    objects.interact(id);

    expect(onRejected).toHaveBeenCalledWith({
      objectId: id,
      reason: "missing_item",
    });
    expect(working()).toBe(false);

    authority.setAvailability(id, "unavailable");
    authority.deleteHeldItem();
    objects.interact(id);
    expect(onRejected).toHaveBeenLastCalledWith({
      objectId: id,
      reason: "unavailable",
    });
    expect(working()).toBe(false);
  });

  it("作業中にワークスペースが remove されたら false に戻る", () => {
    const {objects, authority, working} = setup();
    const id = authority.spawnWorkspace([0, 0, -3]);
    objects.interact(id);
    expect(working()).toBe(true);

    authority.removeObject(id);

    expect(working()).toBe(false);
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
});
