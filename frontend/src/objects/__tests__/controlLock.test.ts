import {describe, expect, it, vi} from "vitest";

import {isPlayerControlLocked} from "../../core/playerControl";
import {createDummyAuthority} from "../../dev/dummyAuthority";
import {createItemManager} from "../../items/itemManager";
import {controlLockEffect, isWorkingAt} from "../controlLock";
import {createObjectManager} from "../objectManager";

// useControlLockWhileWorking と同じ導出(状態 → 作業中か → 預かり)を、objectManager とつないで確かめる。
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
  // 作業中か(オブジェクトが無くなれば false)
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

describe("isWorkingAt(objectManager とダミーのサーバー役につないだ導出)", () => {
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
    const {objects, items, authority, working} = setup();
    const onRejected = vi.fn();
    objects.on("interactRejected", onRejected);
    const id = authority.spawnWorkspace("workspace-1");
    items.apply({type: "spawn", item: {id: "l", kind: "lighter", data: null}});

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

  // remove されるとコンポーネントがアンマウントされ、ロックはその後始末で外れる(ここではオブジェクトが無くなることだけを見る)
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
