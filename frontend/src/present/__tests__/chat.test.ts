import {describe, expect, it} from "vitest";

import {
  CHAT_SCRIPT,
  BLACKOUT_AT_MS,
  DRAIN_AT_MS,
  isBlackedOut,
  rushGlitchAt,
  inputAt,
  bubbleKindOf,
  isDrained,
  isSwapped,
  revealAt,
  MAIN_PROMPT,
  sideOf,
  spinnerFrame,
  SWAP_END_MS,
  typingSpeaker,
  visibleMessages,
} from "../chat";
import {stepIndexOf} from "../script";

const ASK = stepIndexOf("intro", "ask");
const PROMPTS = stepIndexOf("intro", "prompts");
const STALL = stepIndexOf("intro", "stall");
const SWAP = stepIndexOf("intro", "swap");

describe("チャットの台本", () => {
  it("メッセージの id は重ならない", () => {
    const ids = CHAT_SCRIPT.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("手順 ask では、入力欄に打ち込んでから送り、AI が答える", () => {
    expect(visibleMessages(ASK, 0)).toEqual([]);
    expect(inputAt(ASK, 1500).text).not.toBe("");
    const later = visibleMessages(ASK, 10_000);
    expect(later.map((v) => v.message.from)).toEqual(["human", "ai"]);
    expect(later[0]!.text).toBe(MAIN_PROMPT);
    expect(inputAt(ASK, 10_000).text).toBe("");
  });

  it("先の手順から見ると、前の手順のメッセージは全部出きっている", () => {
    const all = visibleMessages(STALL, 0);
    expect(all.length).toBeGreaterThan(2);
    expect(all.every((v) => v.done)).toBe(true);
  });

  it("手順 prompts の AI は答えるだけで、手順 stall で初めて AI から頼んでくる", () => {
    const prompts = CHAT_SCRIPT.filter((m) => m.step === PROMPTS);
    expect(prompts[0]!.from).toBe("human");
    const stall = CHAT_SCRIPT.filter((m) => m.step === STALL);
    expect(stall.every((m) => m.from === "ai")).toBe(true);
    expect(typingSpeaker(STALL, stall[0]!.typingFrom!)).toBe("ai");
  });

  it("色が抜けるのは手順 swap に入って少しあと(グリッチの途中)", () => {
    expect(isDrained(STALL, 100_000)).toBe(false);
    expect(isDrained(SWAP, 0)).toBe(false);
    expect(isDrained(SWAP, DRAIN_AT_MS)).toBe(true);
    expect(inputAt(SWAP, 0).placeholder).toBe("命令を待っています");
  });

  it("「このファイルを編集してください」にはファイルが添付されている", () => {
    const edit = CHAT_SCRIPT.find(
      (m) => m.step === STALL && m.text === "このファイルを編集してください",
    );
    expect(edit?.attachment?.kind).toBe("file");
  });

  it("入れかわったあとは AI から大量の命令が、だんだん速く届く", () => {
    const flood = CHAT_SCRIPT.filter((m) => m.step === SWAP);
    expect(flood.length).toBeGreaterThanOrEqual(100);
    expect(flood.every((m) => m.from === "ai" && m.instant && m.command)).toBe(
      true,
    );
    const gap = (i: number) => flood[i + 1]!.at - flood[i]!.at;
    expect(gap(flood.length - 2)).toBeLessThan(gap(0));
  });

  it("人間に向けた Tool Call の形の命令と、素の催促が混ざる", () => {
    const flood = CHAT_SCRIPT.filter((m) => m.step === SWAP);
    expect(flood.some((m) => m.text.startsWith("human."))).toBe(true);
    expect(flood.some((m) => !m.text.startsWith("human."))).toBe(true);
  });
});

describe("Tool Call", () => {
  const askReply = CHAT_SCRIPT.find((m) => m.id === "ask:reply")!;

  it("手順 ask の返事は 2 つの Tool Call が順に走り、終わってから本文を流す", () => {
    const calls = askReply.toolCalls!;
    expect(calls).toHaveLength(2);
    expect(calls[1]!.startAt).toBe(calls[0]!.doneAt);
    expect(askReply.at).toBe(calls[0]!.startAt);
    expect(askReply.textAt).toBe(calls[1]!.doneAt);
  });

  it("手順 prompts の返事は 1 つずつ Tool Call を持ち、本文はそのあとに流れる", () => {
    const replies = CHAT_SCRIPT.filter(
      (m) => m.step === PROMPTS && m.from === "ai",
    );
    expect(replies.length).toBeGreaterThan(0);
    for (const m of replies) {
      expect(m.toolCalls).toHaveLength(1);
      expect(m.textAt).toBe(m.toolCalls![0]!.doneAt);
      expect(m.toolCalls![0]!.doneAt).toBeGreaterThan(m.toolCalls![0]!.startAt);
    }
  });

  it("間隔が詰まった後ろの返事は、届いた時点で Tool Call が完了している", () => {
    const replies = CHAT_SCRIPT.filter(
      (m) => m.step === PROMPTS && m.from === "ai",
    );
    const first = replies[0]!;
    const last = replies[replies.length - 1]!;
    expect(first.toolCalls![0]!.doneAt).toBeGreaterThan(first.at);
    expect(last.toolCalls![0]!.doneAt).toBeLessThanOrEqual(last.at);
  });

  it("実行中はスピナーと日本語の実行中の文、終われば ✓ と完了の文が出る", () => {
    const [first] = askReply.toolCalls!;
    const running = visibleMessages(ASK, first!.startAt + 400).find(
      (v) => v.message.id === "ask:reply",
    )!;
    expect(running.tools).toHaveLength(1);
    expect(running.tools[0]!.done).toBe(false);
    expect(running.tools[0]!.status).toBe(`${spinnerFrame(400)} Webを検索中`);
    expect(running.text).toBe("");
    const done = visibleMessages(ASK, first!.doneAt + 1).find(
      (v) => v.message.id === "ask:reply",
    )!;
    expect(done.tools[0]!.status).toBe("✓ Webを検索しました");
    expect(done.tools).toHaveLength(2);
    const [, second] = askReply.toolCalls!;
    const all = visibleMessages(ASK, second!.doneAt).find(
      (v) => v.message.id === "ask:reply",
    )!;
    expect(all.tools[1]!.status).toBe("✓ ページを読みました");
  });

  it("先の手順から見ると Tool Call は全部完了済み", () => {
    const later = visibleMessages(STALL, 0);
    const replies = later.filter((v) => v.message.toolCalls);
    expect(replies.length).toBeGreaterThan(2);
    expect(replies.every((v) => v.tools.every((t) => t.done))).toBe(true);
    expect(
      replies.every((v) => v.tools.length === v.message.toolCalls!.length),
    ).toBe(true);
  });

  it("スピナーは時間で決まる", () => {
    expect(spinnerFrame(0)).toBe(spinnerFrame(79));
    expect(spinnerFrame(0)).not.toBe(spinnerFrame(80));
    expect(spinnerFrame(0)).toBe(spinnerFrame(800));
  });
});

describe("立場の入れかわり", () => {
  it("DRAIN_AT_MS 以降に役割が入れかわる", () => {
    expect(isSwapped(STALL, 100_000)).toBe(false);
    expect(isSwapped(SWAP, DRAIN_AT_MS - 1)).toBe(false);
    expect(isSwapped(SWAP, DRAIN_AT_MS)).toBe(true);
    expect(isSwapped(SWAP + 1, 0)).toBe(true);
  });

  it("左右は入れかわらず、人間が右・AI が左のまま", () => {
    expect(sideOf("human")).toBe("right");
    expect(sideOf("ai")).toBe("left");
  });

  it("stall の頼みごとは、入れかわる前は素の文字で、入れかわったあとは命令と同じ赤いボックスになる", () => {
    const request = CHAT_SCRIPT.find((m) => m.step === STALL)!;
    const command = CHAT_SCRIPT.find((m) => m.step === SWAP)!;
    expect(bubbleKindOf(request, false)).toBe("agent");
    expect(bubbleKindOf(request, true)).toBe("command");
    expect(bubbleKindOf(command, false)).toBe("command");
  });

  it("人間のメッセージは入れかわる前後とも枠線だけで、AI の過去の Tool Call は素のまま", () => {
    const human = CHAT_SCRIPT.find((m) => m.id === "ask")!;
    const reply = CHAT_SCRIPT.find((m) => m.id === "ask:reply")!;
    expect(bubbleKindOf(human, false)).toBe("outline");
    expect(bubbleKindOf(human, true)).toBe("outline");
    expect(bubbleKindOf(reply, true)).toBe("agent");
  });
});

describe("命令の洪水の終わり", () => {
  const flood = CHAT_SCRIPT.filter((m) => m.step === SWAP);

  it("届く間隔はだんだん詰まる", () => {
    const gaps = flood.slice(1).map((m, i) => m.at - flood[i]!.at);
    expect(gaps.every((g, i) => i === 0 || g <= gaps[i - 1]!)).toBe(true);
    expect(gaps.at(-1)!).toBeLessThan(gaps[0]!);
  });

  it("流れきった少しあとに暗転し、その 1 秒後にロゴへ進む", () => {
    const last = flood.at(-1)!.at;
    expect(BLACKOUT_AT_MS).toBeGreaterThanOrEqual(last);
    expect(BLACKOUT_AT_MS - last).toBeLessThanOrEqual(200);
    expect(isBlackedOut(SWAP, BLACKOUT_AT_MS - 1)).toBe(false);
    expect(isBlackedOut(SWAP, BLACKOUT_AT_MS)).toBe(true);
    expect(isBlackedOut(SWAP + 1, 0)).toBe(false);
    expect(SWAP_END_MS).toBe(BLACKOUT_AT_MS + 1000);
  });

  it("加速の終盤にアーティファクトがだんだん強くなる", () => {
    const last = flood.at(-1)!.at;
    expect(rushGlitchAt(SWAP, 0)).toBe(0);
    expect(rushGlitchAt(SWAP, last - 1000)).toBeGreaterThan(0);
    expect(rushGlitchAt(SWAP, last)).toBeGreaterThan(
      rushGlitchAt(SWAP, last - 1000),
    );
    expect(rushGlitchAt(SWAP, last)).toBe(1);
    expect(rushGlitchAt(SWAP + 1, 0)).toBe(0);
  });
});

describe("入れかわりの広がり", () => {
  it("色が抜ける瞬間から中央で広がり始め、広がりきったら終わる", () => {
    expect(revealAt(SWAP, DRAIN_AT_MS - 1)).toBeNull();
    expect(revealAt(SWAP, DRAIN_AT_MS)).toBe(0);
    const mid = revealAt(SWAP, DRAIN_AT_MS + 200)!;
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(1);
    expect(revealAt(SWAP, DRAIN_AT_MS + 10_000)).toBeNull();
    expect(revealAt(SWAP - 1, DRAIN_AT_MS)).toBeNull();
  });
});
