import {beforeEach, describe, expect, it, vi} from "vitest";

const currentSession = vi.hoisted(() => vi.fn());
vi.mock("../../flow/store", () => ({gameFlow: {currentSession}}));

import {readinessOf} from "../readiness";

describe("readinessOf", () => {
  beforeEach(() => {
    currentSession.mockReset();
  });

  it("room と test は、オーソリティが置いてから準備完了(authority)", () => {
    expect(readinessOf("room")).toBe("authority");
    expect(readinessOf("test")).toBe("authority");
  });

  it("sandbox は、セッションがあれば ServerAuthority の準備(authority)、無ければ建物だけなのでマウントで足りる(mount)", () => {
    currentSession.mockReturnValue({sessionId: "s1", playerId: "p1"});
    expect(readinessOf("sandbox")).toBe("authority");
    currentSession.mockReturnValue(null);
    expect(readinessOf("sandbox")).toBe("mount");
  });
});
