import {describe, expect, it} from "vitest";

import {DECK_IDS, lastStepOf} from "../script";
import {createPresentStore} from "../store";

describe.each(DECK_IDS)("presentStore(%s)", (deck) => {
  const last = lastStepOf(deck);

  it("最後の手順までは進めるが、そこからは進めも戻しもしない", () => {
    const store = createPresentStore(() => 0);
    store.start(deck, last - 1);
    store.next();
    store.next();
    expect(store.getState()).toMatchObject({active: true, deck, step: last});
    store.prev();
    expect(store.getState()).toMatchObject({step: last});
    store.exit();
    expect(store.getState().active).toBe(false);
  });

  it("最初の手順より前には戻らない", () => {
    const store = createPresentStore(() => 0);
    store.start(deck);
    store.prev();
    expect(store.getState()).toMatchObject({step: 0});
  });
});
