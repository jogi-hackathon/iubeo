import {describe, expect, it, vi} from "vitest";

import type {GameObject} from "../../types";
import {dispatchInteraction, registerInteractionHandler} from "../handlers";

const object = (id: string): GameObject => ({
  id,
  kind: "any",
  scope: "shared",
  position: [0, 0, 0],
  users: [],
  availability: "available",
  data: null,
});

describe("dispatchInteraction", () => {
  it("登録が無いオブジェクトは、既定の処理(要求を送る)に進む", () => {
    const send = vi.fn();
    dispatchInteraction(object("plain"), send);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("処理済み(true)を返したオブジェクトは、要求を送らない", () => {
    const send = vi.fn();
    const handler = vi.fn(() => true);
    const off = registerInteractionHandler("handled", handler);

    dispatchInteraction(object("handled"), send);

    expect(handler).toHaveBeenCalledWith(object("handled"));
    expect(send).not.toHaveBeenCalled();
    off();
  });

  it("false を返したオブジェクトは、既定の処理に進む", () => {
    const send = vi.fn();
    const off = registerInteractionHandler("passthrough", () => false);
    dispatchInteraction(object("passthrough"), send);
    expect(send).toHaveBeenCalledTimes(1);
    off();
  });

  it("他のオブジェクトの処理には影響されない。同じ種類でも id で分かれる", () => {
    const send = vi.fn();
    const off = registerInteractionHandler("only-this", () => true);
    dispatchInteraction(object("other"), send);
    expect(send).toHaveBeenCalledTimes(1);
    off();
  });

  it("解除関数で外せる。入れ替わった後の古い解除関数は、新しい処理を外さない", () => {
    const send = vi.fn();
    const offOld = registerInteractionHandler("swap", () => true);
    const offNew = registerInteractionHandler("swap", () => true);

    offOld();
    dispatchInteraction(object("swap"), send);
    expect(send).not.toHaveBeenCalled();

    offNew();
    dispatchInteraction(object("swap"), send);
    expect(send).toHaveBeenCalledTimes(1);
  });
});
