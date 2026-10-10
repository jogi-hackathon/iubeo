import {describe, expect, it, vi} from "vitest";

import {createGameStore} from "../../../game/gameStore";
import {createItemManager} from "../../../items/itemManager";
import type {
  GamePhase,
  ServerMessage,
  ServerMessageOf,
  ServerMessageType,
  SessionSnapshot,
} from "../../../net";
import {createObjectManager} from "../../../objects/objectManager";
import type {GameObject} from "../../../objects/types";
import {createPlayerManager} from "../../../player/playerManager";
import {createPlayerState} from "../../../player/state";
import {createTeamStore} from "../../team";
import {connectSession} from "../connect";

type Player = SessionSnapshot["players"][number];

const player = (
  playerId: string,
  seat: number,
  overrides: Partial<Player> = {},
): Player => ({
  playerId,
  kind: "human",
  seat,
  connection: "connected",
  life: "alive",
  heldItem: null,
  transform: {position: [seat, 2, 0], yaw: 0, pitch: 0, seq: 10 * seat},
  ...overrides,
});

const object = (
  id: string,
  overrides: Partial<GameObject> = {},
): GameObject => ({
  id,
  kind: "directory",
  scope: "shared",
  users: [],
  availability: "available",
  data: {stock: [], outputs: 0},
  ...overrides,
});

const NO_TEAM = {bypassPermission: false, fireStarted: false};

const gamePhase = (overrides: Partial<GamePhase> = {}): GamePhase => ({
  number: 1,
  status: "active",
  startedAt: "2026-10-01T00:00:00Z",
  deadlineAt: "2026-10-01T00:00:30Z",
  tasks: [
    {
      taskId: "task-1-1",
      type: "read_edit",
      assigneePlayerId: "me",
      targetFileId: "f1",
      status: "pending",
      completedAt: null,
    },
  ],
  ...overrides,
});

const snapshot = (
  players: Player[],
  objects: GameObject[] = [],
  team = NO_TEAM,
  game: {phase: GamePhase | null; result: SessionSnapshot["game"]["result"]} = {
    phase: null,
    result: null,
  },
): ServerMessageOf<"snapshot"> => ({
  type: "snapshot",
  session: {
    seq: 1,
    status: "playing",
    serverTime: "2026-10-01T00:00:00Z",
    players,
    objects,
    game: {phase: game.phase, team, result: game.result},
  } as unknown as SessionSnapshot,
});

const file = {id: "f1", kind: "file" as const, data: {status: "unedited"}};

const spawnOf = (seat: number) => ({
  position: [10 * seat, 0.5, 3] as [number, number, number],
  yaw: seat / 10,
});

const setup = (playerId = "me") => {
  const handlers = new Map<ServerMessageType, (m: ServerMessage) => void>();
  const connection = {
    on: (type: ServerMessageType, cb: (m: never) => void) => {
      handlers.set(type, cb as (m: ServerMessage) => void);
      return () => handlers.delete(type);
    },
  };
  const objects = createObjectManager({
    getHeldItem: () => null,
    getAuthority: () => null,
  });
  const items = createItemManager();
  const players = createPlayerManager({
    now: () => 0,
    myPlayerId: () => playerId,
  });
  const sender = {syncSeq: vi.fn()};
  const team = createTeamStore();
  const game = createGameStore({now: () => 0});
  const onFirstSnapshot = vi.fn();
  const onFinished = vi.fn();
  const off = connectSession({
    connection: connection as never,
    objects,
    items,
    team,
    game,
    players,
    sender,
    playerId,
    spawnOf,
    onFirstSnapshot,
    onFinished,
  });
  const receive = (m: ServerMessage) => handlers.get(m.type)?.(m);
  return {
    objects,
    items,
    team,
    game,
    players,
    sender,
    onFirstSnapshot,
    onFinished,
    receive,
    off,
    handlers,
  };
};

describe("connectSession", () => {
  it("勝利フラグは、snapshot の game.team で入れ替え、team.updated で書き換える", () => {
    const t = setup();
    t.receive(
      snapshot([player("me", 1)], [], {
        bypassPermission: true,
        fireStarted: false,
      }),
    );
    expect(t.team.get()).toEqual({bypassPermission: true, fireStarted: false});

    t.receive({
      type: "team.updated",
      seq: 2,
      team: {bypassPermission: true, fireStarted: true},
    });
    expect(t.team.get()).toEqual({bypassPermission: true, fireStarted: true});
  });

  it("snapshot でオブジェクトを入れ替え(無い物は消す)、プレイヤーと自分の手持ちを合わせる", () => {
    const t = setup();
    t.objects.apply({
      type: "upsert",
      object: object("dummy-1", {kind: "dummy"}),
    });
    t.receive(
      snapshot(
        [player("me", 1, {heldItem: file}), player("other", 2)],
        [object("directory-1")],
      ),
    );
    expect(t.objects.getState().objects.map((o) => o.id)).toEqual([
      "directory-1",
    ]);
    expect(t.players.getState().players.map((p) => p.playerId)).toEqual([
      "me",
      "other",
    ]);
    expect(t.items.getHeld()).toEqual(file);
  });

  it("snapshot で送る側の seq を合わせ、最初の snapshot でだけ自分の置き場所を渡す(位置があれば再開)", () => {
    const t = setup();
    t.receive(snapshot([player("me", 1)]));
    t.receive(
      snapshot([
        player("me", 1, {
          transform: {position: [9, 9, 9], yaw: 0, pitch: 0, seq: 30},
        }),
      ]),
    );
    expect(t.sender.syncSeq.mock.calls).toEqual([[10], [30]]);
    expect(t.onFirstSnapshot).toHaveBeenCalledTimes(1);
    expect(t.onFirstSnapshot.mock.calls[0]![0]).toEqual({
      kind: "resume",
      transform: {position: [1, 2, 0], yaw: 0, pitch: 0, seq: 10},
    });
  });

  it("transform が null(サーバーがまだ受け取っていない)なら、席のスポーン地点に置く(自分も他人も)", () => {
    const t = setup();
    t.receive(
      snapshot([
        player("me", 1, {transform: null}),
        player("other", 2, {transform: null}),
      ]),
    );
    expect(t.onFirstSnapshot).toHaveBeenCalledWith({
      kind: "spawn",
      spawn: spawnOf(1),
    });
    expect(t.sender.syncSeq.mock.calls).toEqual([[0]]);
    const out = createPlayerState(0, 0, 0);
    expect(t.players.sample("other", 10_000, out)).toBe(true);
    expect(out.position.toArray()).toEqual([20, 0.5, 3]);
    expect(out.yaw).toBeCloseTo(0.2);
  });

  it("再読み込み・再参加(自分の位置がある)は、その位置で再開する。席のスポーン地点にしない", () => {
    const t = setup();
    t.receive(
      snapshot([
        player("me", 2, {
          transform: {position: [7, 0, 8], yaw: 1, pitch: 0.2, seq: 55},
        }),
      ]),
    );
    expect(t.onFirstSnapshot).toHaveBeenCalledWith({
      kind: "resume",
      transform: {position: [7, 0, 8], yaw: 1, pitch: 0.2, seq: 55},
    });
    expect(t.sender.syncSeq).toHaveBeenCalledWith(55);
  });

  it("自分が snapshot に居なければ、置き場所は null(seq も合わせない)", () => {
    const t = setup();
    t.receive(snapshot([player("other", 2)]));
    expect(t.onFirstSnapshot).toHaveBeenCalledWith(null);
    expect(t.sender.syncSeq).not.toHaveBeenCalled();
  });

  it("2 回目の snapshot(再接続)では置き場所を渡さない。オブジェクトは入れ替える", () => {
    const t = setup();
    t.receive(snapshot([player("me", 1)], [object("directory-1")]));
    t.receive(
      snapshot(
        [player("me", 1, {transform: null})],
        [object("directory-1"), object("workspace-1", {kind: "workspace"})],
      ),
    );
    expect(t.onFirstSnapshot).toHaveBeenCalledTimes(1);
    expect(t.objects.getState().objects.map((o) => o.id)).toEqual([
      "directory-1",
      "workspace-1",
    ]);
  });

  it("player.updated の自分の手持ちを、spawn / delete に直す。他人の手持ちは触らない", () => {
    const t = setup();
    t.receive(snapshot([player("me", 1), player("other", 2)]));
    t.receive({
      type: "player.updated",
      seq: 2,
      player: {...player("other", 2), heldItem: file},
    });
    expect(t.items.getHeld()).toBeNull();
    t.receive({
      type: "player.updated",
      seq: 3,
      player: {...player("me", 1), heldItem: file},
    });
    expect(t.items.getHeld()).toEqual(file);
    expect(t.players.getPlayer("me")?.heldItem).toEqual(file);
    t.receive({
      type: "player.updated",
      seq: 4,
      player: {...player("me", 1), heldItem: null},
    });
    expect(t.items.getHeld()).toBeNull();
  });

  it("同じ id でも中身が変われば spawn で更新し、同じなら何もしない", () => {
    const t = setup();
    t.receive(snapshot([player("me", 1, {heldItem: file})]));
    const spawn = vi.fn();
    t.items.on("spawn", spawn);
    t.receive({
      type: "player.updated",
      seq: 2,
      player: {...player("me", 1), heldItem: file},
    });
    expect(spawn).not.toHaveBeenCalled();
    const edited = {...file, data: {status: "edited"}};
    t.receive({
      type: "player.updated",
      seq: 3,
      player: {...player("me", 1), heldItem: edited},
    });
    expect(t.items.getHeld()).toEqual(edited);
  });

  it("object.* を objectManager に流す", () => {
    const t = setup();
    const rejected = vi.fn();
    t.objects.on("interactRejected", rejected);
    t.receive({
      type: "object.upsert",
      seq: 2,
      object: object("directory-1") as never,
    });
    expect(t.objects.getObject("directory-1")).toBeDefined();
    t.receive({
      type: "object.interactRejected",
      objectId: "directory-1",
      reason: "not_found",
    });
    expect(rejected).toHaveBeenCalledWith({
      objectId: "directory-1",
      reason: "not_found",
    });
    t.receive({type: "object.remove", seq: 3, id: "directory-1"});
    expect(t.objects.getObject("directory-1")).toBeUndefined();
  });

  it("transforms を playerManager に流す", () => {
    const t = setup();
    t.receive(snapshot([player("me", 1), player("other", 2)]));
    t.receive({
      type: "transforms",
      serverTime: "2026-10-01T00:00:00Z",
      players: [
        {
          playerId: "other",
          transform: {position: [5, 0, 0], yaw: 0, pitch: 0, seq: 99},
        },
        {
          playerId: "me",
          transform: {position: [6, 0, 0], yaw: 0, pitch: 0, seq: 100},
        },
      ],
    });
    const out = createPlayerState(0, 0, 0);
    expect(t.players.sample("other", 10_000, out)).toBe(true);
    expect(out.position.x).toBe(5);
    expect(t.players.sample("me", 10_000, out)).toBe(false);
  });

  it("snapshot の game(フェーズ・結果)と serverTime を game に流す", () => {
    const t = setup();
    t.receive(
      snapshot([player("me", 1)], [], NO_TEAM, {
        phase: gamePhase(),
        result: null,
      }),
    );
    expect(t.game.getState().sessionStatus).toBe("playing");
    expect(t.game.getState().phase?.number).toBe(1);
    // now は 0 固定なので、ずれは serverTime そのもの
    expect(t.game.getState().serverOffsetMs).toBe(
      Date.parse("2026-10-01T00:00:00Z"),
    );
  });

  it("phase.started / task.completed / phase.ended を game に流す", () => {
    const t = setup();
    t.receive({
      type: "phase.started",
      seq: 2,
      serverTime: "2026-10-01T00:00:10Z",
      phase: gamePhase(),
    });
    expect(t.game.getState().phase?.number).toBe(1);
    expect(t.game.getState().sessionStatus).toBe("playing");

    t.receive({
      type: "task.completed",
      seq: 3,
      taskId: "task-1-1",
      completedAt: "2026-10-01T00:00:11Z",
    });
    expect(t.game.getState().phase?.tasks[0]?.status).toBe("completed");

    t.receive({
      type: "phase.ended",
      seq: 4,
      phaseNumber: 1,
      eliminatedPlayerIds: [],
      next: "intermission",
    });
    expect(t.game.getState().intermission).toBe(true);
    expect(t.game.getState().phase?.status).toBe("intermission");
  });

  it("session.finished は結果を入れて onFinished を呼ぶ", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const t = setup();
    const result = {
      outcome: "victory" as const,
      decidedAt: "2026-10-01T00:01:00Z",
    };
    t.receive({type: "session.finished", seq: 5, result});
    expect(t.game.getState().result).toEqual(result);
    expect(t.onFinished).toHaveBeenCalledWith(result);
    log.mockRestore();
  });

  it("解除したら、何も流さない", () => {
    const t = setup();
    t.off();
    expect(t.handlers.size).toBe(0);
  });
});
