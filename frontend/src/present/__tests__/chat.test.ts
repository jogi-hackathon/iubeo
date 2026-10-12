import {describe, expect, it} from "vitest";

import {
  CHAT_SCRIPT,
  inputAt,
  isDrained,
  MAIN_PROMPT,
  DRAIN_AT_MS,
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
    expect(flood.every((m) => m.from === "ai" && m.instant)).toBe(true);
    const gap = (i: number) => flood[i + 1]!.at - flood[i]!.at;
    expect(gap(flood.length - 2)).toBeLessThan(gap(0));
  });
});
