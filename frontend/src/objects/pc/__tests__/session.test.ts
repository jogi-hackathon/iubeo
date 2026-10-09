import {describe, expect, it, vi} from "vitest";

import {createPcSession} from "../session";

const make = () => {
  const release = vi.fn();
  const releaseSuppress = vi.fn();
  const lock = vi.fn(() => release);
  const suppressPointerLock = vi.fn(() => releaseSuppress);
  const exitPointerLock = vi.fn();
  const session = createPcSession({lock, suppressPointerLock, exitPointerLock});
  return {
    session,
    lock,
    release,
    suppressPointerLock,
    releaseSuppress,
    exitPointerLock,
  };
};

describe("createPcSession", () => {
  it("初期状態は一人称(idle)で、PC は使われていない", () => {
    expect(make().session.getState()).toEqual({phase: "idle", objectId: null});
  });

  it("enter で使い始め、プレイヤーを預かり、pointer lock を解き、クリックで lock を取らせない", () => {
    const {session, lock, suppressPointerLock, exitPointerLock} = make();
    expect(session.enter("pc-1")).toBe(true);
    expect(session.getState()).toEqual({phase: "active", objectId: "pc-1"});
    expect(lock).toHaveBeenCalledTimes(1);
    expect(suppressPointerLock).toHaveBeenCalledTimes(1);
    expect(exitPointerLock).toHaveBeenCalledTimes(1);
  });

  it("使っている間の enter は無視する（別の PC でも入り直さない）", () => {
    const {session, lock} = make();
    session.enter("pc-1");
    expect(session.enter("pc-2")).toBe(false);
    expect(session.getState().objectId).toBe("pc-1");
    expect(lock).toHaveBeenCalledTimes(1);
  });

  it("leave は離れ始めるだけで、補間が終わる finish まで預かりを続ける", () => {
    const {session, release, releaseSuppress} = make();
    session.enter("pc-1");
    session.leave();
    expect(session.getState()).toEqual({phase: "leaving", objectId: "pc-1"});
    expect(release).not.toHaveBeenCalled();
    expect(releaseSuppress).not.toHaveBeenCalled();

    session.finish();
    expect(session.getState()).toEqual({phase: "idle", objectId: null});
    expect(release).toHaveBeenCalledTimes(1);
    expect(releaseSuppress).toHaveBeenCalledTimes(1);
  });

  it("使っていないときの leave と、離れ終わっていないときの finish は無視する", () => {
    const {session, release} = make();
    session.leave();
    session.finish();
    expect(session.getState().phase).toBe("idle");
    session.enter("pc-1");
    session.finish();
    expect(session.getState().phase).toBe("active");
    expect(release).not.toHaveBeenCalled();
  });

  it("離れ始めている間は、新しく使い始められない", () => {
    const {session} = make();
    session.enter("pc-1");
    session.leave();
    expect(session.enter("pc-2")).toBe(false);
  });

  it("reset は補間を待たず、預かりと抑止を解いて一人称へ戻す", () => {
    const {session, release, releaseSuppress} = make();
    session.enter("pc-1");
    session.reset();
    expect(session.getState()).toEqual({phase: "idle", objectId: null});
    expect(release).toHaveBeenCalledTimes(1);
    expect(releaseSuppress).toHaveBeenCalledTimes(1);
  });

  it("購読者には状態が変わるたびに通知し、解除後は通知しない", () => {
    const {session} = make();
    const listener = vi.fn();
    const off = session.subscribe(listener);
    session.enter("pc-1");
    expect(listener).toHaveBeenCalledTimes(1);
    off();
    session.leave();
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
