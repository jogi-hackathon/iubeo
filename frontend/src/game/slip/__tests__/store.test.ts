import {Matrix4} from "three";
import {describe, expect, it} from "vitest";

import type {GamePhase, GameTask} from "../../../net";
import type {GameObject} from "../../../objects/types";
import {SAMPLE_SLIP, type SlipContent} from "../content";
import {createOrderSlipStore, myWorkspaceId, slipForPhase} from "../store";

const another: SlipContent = {...SAMPLE_SLIP, number: "4-TASK41", phase: 4};

const setup = (busy = false) => {
  let now = 1000;
  const flags = {busy};
  const store = createOrderSlipStore({
    now: () => now,
    isBusy: () => flags.busy,
  });
  return {store, flags, tick: (ms: number) => (now += ms)};
};

describe("orderSlip store", () => {
  it("操作が空いていれば届いた伝票をすぐ再生し、終えると空になる", () => {
    const {store} = setup();
    store.deliver(SAMPLE_SLIP);
    expect(store.getState().playing?.content).toBe(SAMPLE_SLIP);
    expect(store.getState().playing?.startedAt).toBe(1000);
    store.finish();
    expect(store.getState()).toMatchObject({playing: null, pending: null});
  });

  it("他の操作に預けている間に届いたら待ち、空いたら始める", () => {
    const {store, flags} = setup(true);
    store.deliver(SAMPLE_SLIP);
    expect(store.getState().playing).toBeNull();
    expect(store.getState().pending).toBe(SAMPLE_SLIP);
    store.resume();
    expect(store.getState().playing).toBeNull();
    flags.busy = false;
    store.resume();
    expect(store.getState().playing?.content).toBe(SAMPLE_SLIP);
    expect(store.getState().pending).toBeNull();
  });

  it("再生中に届いた分は、終えてから続けて出す(最後の 1 枚だけ)", () => {
    const {store, tick} = setup();
    store.deliver(SAMPLE_SLIP);
    tick(500);
    store.deliver(another);
    store.deliver({...another, number: "LAST"});
    expect(store.getState().playing?.content).toBe(SAMPLE_SLIP);
    tick(500);
    store.finish();
    expect(store.getState().playing?.content.number).toBe("LAST");
    expect(store.getState().playing?.startedAt).toBe(2000);
  });

  it("終えた時点でまだ預かりが残っていれば待ちのままにし、空いたときに始める", () => {
    const {store, flags} = setup();
    store.deliver(SAMPLE_SLIP);
    store.deliver(another);
    flags.busy = true;
    store.finish();
    expect(store.getState().playing).toBeNull();
    expect(store.getState().pending).toBe(another);
    flags.busy = false;
    store.resume();
    expect(store.getState().playing?.content).toBe(another);
  });

  it("reset は再生も待ちも捨てる", () => {
    const {store} = setup();
    store.deliver(SAMPLE_SLIP);
    store.deliver(another);
    store.reset();
    expect(store.getState()).toMatchObject({playing: null, pending: null});
    store.finish();
    expect(store.getState()).toMatchObject({playing: null, pending: null});
  });
});

const task = (over: Partial<GameTask>): GameTask => ({
  taskId: "task-2-1",
  type: "write",
  assigneePlayerId: "me",
  targetFileId: null,
  status: "pending",
  completedAt: null,
  ...over,
});

const phase = (over: Partial<GamePhase> = {}): GamePhase => ({
  number: 2,
  status: "active",
  startedAt: "2026-10-12T03:00:00Z",
  deadlineAt: "2026-10-12T03:02:00Z",
  tasks: [
    task({taskId: "task-2-1"}),
    task({taskId: "task-2-2", type: "web_search", topic: "Vite"}),
    task({taskId: "task-2-3", assigneePlayerId: "other"}),
  ],
  ...over,
});

describe("slipForPhase", () => {
  it("始まったフェーズの自分のタスクだけを伝票にする", () => {
    const content = slipForPhase(phase(), "me", new Set());
    expect(content?.phase).toBe(2);
    expect(content?.items.map((item) => item.detail)).toEqual([null, "Vite"]);
    expect(content?.number).toBe("2-TASK21");
  });

  it("フェーズが無い・自分が分からない・自分のタスクが無いときは null", () => {
    expect(slipForPhase(null, "me", new Set())).toBeNull();
    expect(slipForPhase(phase(), null, new Set())).toBeNull();
    expect(slipForPhase(phase(), "nobody", new Set())).toBeNull();
  });

  it("始まっていない(インターミッション・完了)フェーズと、出し終えたフェーズは出さない", () => {
    expect(slipForPhase(phase({status: "intermission"}), "me", new Set())).toBe(
      null,
    );
    expect(slipForPhase(phase({status: "completed"}), "me", new Set())).toBe(
      null,
    );
    expect(slipForPhase(phase(), "me", new Set([2]))).toBeNull();
    expect(slipForPhase(phase(), "me", new Set([1]))).not.toBeNull();
  });
});

describe("飛ぶ伝票とメモ置き", () => {
  const matrix = () => {
    const m = new Matrix4();
    m.setPosition(1, 2, 3);
    return m;
  };
  const withMemos = (busy = false) => {
    const placed: Array<[string, SlipContent]> = [];
    let now = 1000;
    const store = createOrderSlipStore({
      now: () => now,
      isBusy: () => busy,
      memos: {place: (id, content) => placed.push([id, content])},
    });
    return {store, placed, tick: (ms: number) => (now += ms)};
  };

  it("飛ぶ先があれば、手を離れた伝票は世界座標とともに飛び、着いたらメモ置きに残る", () => {
    const {store, placed, tick} = withMemos();
    store.setTarget("workspace-1");
    store.deliver(SAMPLE_SLIP);
    tick(4000);
    store.launch(matrix());
    const {flight} = store.getState();
    expect(flight?.workspaceId).toBe("workspace-1");
    expect(flight?.content).toBe(SAMPLE_SLIP);
    expect(flight?.startedAt).toBe(5000);
    expect(flight?.from.slice(12, 15)).toEqual([1, 2, 3]);
    store.launch(matrix());
    expect(store.getState().flight).toBe(flight);
    store.land();
    expect(store.getState().flight).toBeNull();
    expect(placed).toEqual([["workspace-1", SAMPLE_SLIP]]);
    store.finish();
    expect(placed).toHaveLength(1);
  });

  it("着く前に終えたら、その時点でメモ置きに残す", () => {
    const {store, placed} = withMemos();
    store.setTarget("workspace-1");
    store.deliver(SAMPLE_SLIP);
    store.launch(matrix());
    store.finish();
    expect(placed).toEqual([["workspace-1", SAMPLE_SLIP]]);
    expect(store.getState().flight).toBeNull();
  });

  it("飛ぶ先が無ければ飛ばず、再生していないときの launch も無視する", () => {
    const {store, placed} = withMemos();
    store.launch(matrix());
    store.deliver(SAMPLE_SLIP);
    store.launch(matrix());
    expect(store.getState().flight).toBeNull();
    store.finish();
    expect(placed).toEqual([]);
  });

  it("reset は飛んでいる伝票も捨てるが、飛ぶ先は保つ", () => {
    const {store} = withMemos();
    store.setTarget("workspace-1");
    store.deliver(SAMPLE_SLIP);
    store.launch(matrix());
    store.reset();
    expect(store.getState().flight).toBeNull();
    expect(store.getState().target).toBe("workspace-1");
  });
});

describe("myWorkspaceId", () => {
  const object = (over: Partial<GameObject>): GameObject => ({
    id: "workspace-1",
    kind: "workspace",
    scope: "personal",
    users: [],
    availability: "available",
    data: null,
    ...over,
  });

  it("自分が owner のワークスペースを選ぶ", () => {
    expect(
      myWorkspaceId(
        [
          object({id: "workspace-1", owner: "other"}),
          object({id: "workspace-2", owner: "me"}),
        ],
        "me",
      ),
    ).toBe("workspace-2");
  });

  it("owner が無い場でワークスペースが 1 つだけなら、それ。他は null", () => {
    expect(myWorkspaceId([object({})], "me")).toBe("workspace-1");
    expect(myWorkspaceId([object({}), object({id: "workspace-2"})], "me")).toBe(
      null,
    );
    expect(myWorkspaceId([object({owner: "other"})], "me")).toBeNull();
    expect(myWorkspaceId([object({kind: "pc"})], "me")).toBeNull();
  });
});
