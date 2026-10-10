import {Vector3} from "three";
import {describe, expect, it} from "vitest";

import {
  buildMountain,
  isVisibleFromAbove,
  LOOSE_COUNT,
  MOUNTAIN_HEIGHT_MAX,
  MOUNTAIN_REACH,
  MOUNTAIN_SIZES,
  mountainHeightMax,
  mountainReach,
  mountainViewHeight,
  OUTPUT_MAX,
  PAPERS,
  VIEW_HEIGHT,
} from "../mountain";

const SEEDS = ["a", "b", "directory-1", "directory-2", "x".repeat(20)];

const corners = (s: {
  position: [number, number, number];
  yaw: number;
  size: [number, number, number];
}) =>
  [-1, 1].flatMap((x) =>
    [-1, 1].map((z) => {
      const lx = (x * s.size[0]) / 2;
      const lz = (z * s.size[2]) / 2;
      return {
        x: s.position[0] + lx * Math.cos(s.yaw) + lz * Math.sin(s.yaw),
        z: s.position[2] - lx * Math.sin(s.yaw) + lz * Math.cos(s.yaw),
      };
    }),
  );

describe("buildMountain", () => {
  it("同じ seed なら毎回同じ形、違えば変わる", () => {
    expect(buildMountain("directory-1")).toEqual(buildMountain("directory-1"));
    expect(buildMountain("directory-1")).not.toEqual(
      buildMountain("directory-2"),
    );
  });

  it("段は 6〜8 段で、上の段ほど狭く、高さは 4.6〜5.4m", () => {
    for (const seed of SEEDS) {
      const m = buildMountain(seed);
      expect(m.tierRadii.length).toBeGreaterThanOrEqual(6);
      expect(m.tierRadii.length).toBeLessThanOrEqual(8);
      for (let t = 1; t < m.tierRadii.length; t++) {
        expect(m.tierRadii[t]).toBeLessThan(m.tierRadii[t - 1] as number);
      }
      expect(m.height).toBeGreaterThanOrEqual(4.6);
      expect(m.height).toBeLessThanOrEqual(MOUNTAIN_HEIGHT_MAX);
      expect(m.tierHeight * m.tierRadii.length).toBeCloseTo(m.height);
    }
  });

  it("全体で 10,000 三角形以内(板・はみ出し紙は箱 12 三角形、芯は段々の円柱)", () => {
    for (const seed of SEEDS) {
      const m = buildMountain(seed);
      const tris =
        (m.sheets.length + m.looseSheets.length + m.outputSheets.length) * 12 +
        m.core.indices.length / 3;
      expect(tris).toBeLessThanOrEqual(10000);
      expect(tris).toBeGreaterThan(4000);
    }
  });

  it("束の板は、頂上の高さの近くまで積まれる", () => {
    for (const seed of SEEDS) {
      const m = buildMountain(seed);
      const top = Math.max(
        ...m.sheets.map((s) => s.position[1] + s.size[1] / 2),
      );
      expect(top).toBeGreaterThan(m.height - 0.05);
      expect(top).toBeLessThan(m.height + 0.05);
    }
  });

  it("芯の面は、側面は外向き・上面は上向きで、一番下は地面より下に潜る", () => {
    for (const seed of SEEDS) {
      const {core} = buildMountain(seed);
      const v = (i: number) =>
        new Vector3(
          core.positions[i * 3],
          core.positions[i * 3 + 1],
          core.positions[i * 3 + 2],
        );
      let minY = Infinity;
      for (let i = 0; i < core.indices.length; i += 3) {
        const a = v(core.indices[i] as number);
        const b = v(core.indices[i + 1] as number);
        const c = v(core.indices[i + 2] as number);
        const n = b.clone().sub(a).cross(c.clone().sub(a));
        const centroid = a.clone().add(b).add(c).divideScalar(3);
        const up = n.y > 1e-9;
        const outward = n.x * centroid.x + n.z * centroid.z > 0;
        expect(up || outward).toBe(true);
        minY = Math.min(minY, a.y, b.y, c.y);
      }
      expect(minY).toBeLessThan(0);
    }
  });

  it("芯と束の全体が、山の半径(MOUNTAIN_REACH)に収まる", () => {
    for (const seed of SEEDS) {
      const m = buildMountain(seed);
      for (let i = 0; i < m.core.positions.length; i += 3) {
        expect(
          Math.hypot(
            m.core.positions[i] as number,
            m.core.positions[i + 2] as number,
          ),
        ).toBeLessThanOrEqual(MOUNTAIN_REACH);
      }
      for (const s of [...m.sheets, ...m.outputSheets]) {
        for (const c of corners(s)) {
          expect(Math.hypot(c.x, c.z)).toBeLessThanOrEqual(MOUNTAIN_REACH);
        }
      }
    }
  });

  it("束は、厚みの違う本を 4〜6 冊積み、隙間なく段の高さまで重なる", () => {
    for (const seed of SEEDS) {
      const m = buildMountain(seed);
      const bundles: (typeof m.sheets)[] = [];
      for (const s of m.sheets) {
        const bottom = s.position[1] - s.size[1] / 2;
        const onTier =
          Math.abs(bottom / m.tierHeight - Math.round(bottom / m.tierHeight)) <
          1e-6;
        if (onTier) {
          bundles.push([]);
        }
        bundles.at(-1)?.push(s);
      }
      const thicknesses = new Set<string>();
      for (const b of bundles) {
        expect(b.length).toBeGreaterThanOrEqual(4);
        expect(b.length).toBeLessThanOrEqual(6);
        for (let j = 1; j < b.length; j++) {
          const lower = b[j - 1] as (typeof b)[number];
          const upper = b[j] as (typeof b)[number];
          expect(upper.position[1] - upper.size[1] / 2).toBeCloseTo(
            lower.position[1] + lower.size[1] / 2,
          );
        }
        expect(b.reduce((sum, s) => sum + s.size[1], 0)).toBeCloseTo(
          m.tierHeight,
        );
        for (const s of b) {
          expect(s.size[1]).toBeGreaterThan(0.04);
          thicknesses.add(s.size[1].toFixed(3));
        }
      }
      expect(thicknesses.size).toBeGreaterThan(20);
    }
  });

  describe("はみ出す紙", () => {
    const PAPER: readonly string[] = PAPERS;

    it("薄い紙(数 mm〜1cm)が、64 枚ほど、斜めに傾いてはみ出す。傾きは垂れ下がりと立てかかりの両方", () => {
      const m = buildMountain("directory-1");
      expect(m.looseSheets).toHaveLength(LOOSE_COUNT);
      for (const l of m.looseSheets) {
        expect(l.size[1]).toBeGreaterThanOrEqual(0.004);
        expect(l.size[1]).toBeLessThanOrEqual(0.01);
      }
      const tilts = m.looseSheets.map((l) => l.rotation[0]);
      expect(tilts.some((t) => t < -0.2)).toBe(true);
      expect(tilts.some((t) => t > 0.7)).toBe(true);
    });

    it("差し色は、はみ出し紙のごく少数だけ。束(箱)は全て紙の白", () => {
      for (const seed of SEEDS) {
        const m = buildMountain(seed);
        for (const s of [...m.sheets, ...m.outputSheets]) {
          expect(PAPER).toContain(s.color);
        }
        const accents = m.looseSheets.filter((l) => !PAPER.includes(l.color));
        expect(accents.length).toBeLessThanOrEqual(m.looseSheets.length * 0.3);
      }
    });

    it("山の半径に収まり、頂上より大きく上へは出ない", () => {
      for (const seed of SEEDS) {
        const m = buildMountain(seed);
        for (const l of m.looseSheets) {
          const half = Math.hypot(l.size[0], l.size[2]) / 2;
          expect(
            Math.hypot(l.position[0], l.position[2]) + half,
          ).toBeLessThanOrEqual(MOUNTAIN_REACH);
          expect(l.position[1]).toBeLessThan(m.height + 0.6);
          expect(l.position[1]).toBeGreaterThan(-0.2);
        }
      }
    });
  });

  describe("在庫ファイルの候補", () => {
    it("6 個の在庫に対して、3 倍以上ある", () => {
      for (const seed of SEEDS) {
        expect(buildMountain(seed).candidates.length).toBeGreaterThanOrEqual(
          18,
        );
      }
    });

    it("下の方の段にあり、上の段の範囲の外(真上から見える帯)にある", () => {
      for (const seed of SEEDS) {
        const m = buildMountain(seed);
        for (const c of m.candidates) {
          const tier = Math.round(c.topY / m.tierHeight) - 1;
          expect(tier).toBeLessThan(4);
          const r = Math.hypot(c.x, c.z);
          expect(r).toBeGreaterThan((m.tierRadii[tier + 1] ?? 0) + 0.1);
          expect(r).toBeLessThan((m.tierRadii[tier] as number) + 0.1);
        }
      }
    });

    it("真上のカメラから、面の中心が上の段の縁に隠れずに見える", () => {
      for (const seed of SEEDS) {
        const m = buildMountain(seed);
        for (const c of m.candidates) {
          expect(
            isVisibleFromAbove(c, m.tierRadii, m.tierHeight, VIEW_HEIGHT),
          ).toBe(true);
        }
      }
    });

    it("面は束の上面の大きさで、向きが付く", () => {
      const m = buildMountain("directory-1");
      for (const c of m.candidates) {
        expect(c.width).toBeGreaterThan(0.4);
        expect(c.width).toBeLessThan(0.9);
        expect(c.depth).toBeGreaterThan(0.3);
        expect(c.depth).toBeLessThan(0.6);
      }
      expect(new Set(m.candidates.map((c) => c.yaw)).size).toBe(
        m.candidates.length,
      );
    });
  });

  describe("成果物の板", () => {
    it("成果物の上限と同じ数だけ用意され、在庫ファイルの候補の束とは別の束に載る", () => {
      const m = buildMountain("directory-1");
      expect(m.outputSheets).toHaveLength(OUTPUT_MAX);
      for (const o of m.outputSheets) {
        for (const c of m.candidates) {
          expect(
            Math.hypot(o.position[0] - c.x, o.position[2] - c.z),
          ).toBeGreaterThan(0.3);
        }
      }
    });

    it("下の方の段(下から 4 段)の束の上にある", () => {
      const m = buildMountain("directory-1");
      for (const o of m.outputSheets) {
        expect(o.position[1]).toBeLessThan(4 * m.tierHeight + 0.1);
      }
    });
  });
});

describe("山の大きさ", () => {
  it("large は既定の大きさで、後方互換の定数と同じ値", () => {
    expect(MOUNTAIN_SIZES.large).toEqual({
      tiers: 7,
      radiusBottom: 3.6,
      radiusTop: 0.6,
      heightMin: 4.6,
      heightMax: 5.4,
    });
    expect(mountainReach("large")).toBe(MOUNTAIN_REACH);
    expect(mountainHeightMax("large")).toBe(MOUNTAIN_HEIGHT_MAX);
    expect(mountainViewHeight("large")).toBe(VIEW_HEIGHT);
    for (const seed of SEEDS) {
      expect(buildMountain(seed, "large")).toEqual(buildMountain(seed));
    }
  });

  it("small は large より小さい(半径・高さ・俯瞰に要る高さ)", () => {
    expect(mountainReach("small")).toBeLessThan(mountainReach("large"));
    expect(mountainHeightMax("small")).toBeLessThan(mountainHeightMax("large"));
    expect(mountainViewHeight("small")).toBe(mountainHeightMax("small") * 2);
    expect(buildMountain("directory-1", "small")).not.toEqual(
      buildMountain("directory-1"),
    );
  });
});

describe("buildMountain(small)", () => {
  const MANY = Array.from({length: 200}, (_, i) => `seed-${i}`);
  const reach = mountainReach("small");

  it("同じ seed なら毎回同じ形", () => {
    expect(buildMountain("directory-1", "small")).toEqual(
      buildMountain("directory-1", "small"),
    );
  });

  it("段は 3 段で、上の段ほど狭く、高さは 1.9〜2.2m", () => {
    for (const seed of MANY) {
      const m = buildMountain(seed, "small");
      expect(m.tierRadii).toHaveLength(3);
      expect(m.tierRadii[0]).toBeCloseTo(1.6);
      expect(m.tierRadii[2]).toBeCloseTo(0.6);
      for (let t = 1; t < m.tierRadii.length; t++) {
        expect(m.tierRadii[t]).toBeLessThan(m.tierRadii[t - 1] as number);
      }
      expect(m.height).toBeGreaterThanOrEqual(1.9);
      expect(m.height).toBeLessThanOrEqual(mountainHeightMax("small"));
      expect(m.tierHeight * m.tierRadii.length).toBeCloseTo(m.height);
    }
  });

  it("芯・束・成果物の板・はみ出す紙の全体が、山の半径(mountainReach)に収まる", () => {
    for (const seed of MANY) {
      const m = buildMountain(seed, "small");
      for (let i = 0; i < m.core.positions.length; i += 3) {
        expect(
          Math.hypot(
            m.core.positions[i] as number,
            m.core.positions[i + 2] as number,
          ),
        ).toBeLessThanOrEqual(reach);
      }
      for (const s of [...m.sheets, ...m.outputSheets]) {
        for (const c of corners(s)) {
          expect(Math.hypot(c.x, c.z)).toBeLessThanOrEqual(reach);
        }
      }
      for (const l of m.looseSheets) {
        const half = Math.hypot(l.size[0], l.size[2]) / 2;
        expect(
          Math.hypot(l.position[0], l.position[2]) + half,
        ).toBeLessThanOrEqual(reach);
        expect(l.position[1]).toBeLessThan(m.height + 0.6);
        expect(l.position[1]).toBeGreaterThan(-0.2);
      }
    }
  });

  it("束の板は頂上の高さの近くまで積まれ、はみ出す紙の枚数は large と同じ", () => {
    for (const seed of SEEDS) {
      const m = buildMountain(seed, "small");
      const top = Math.max(
        ...m.sheets.map((s) => s.position[1] + s.size[1] / 2),
      );
      expect(top).toBeGreaterThan(m.height - 0.05);
      expect(top).toBeLessThan(m.height + 0.05);
      expect(m.looseSheets).toHaveLength(LOOSE_COUNT);
    }
  });

  describe("在庫ファイルの候補", () => {
    it("どの seed でも 2 個以上あり、room に置く id(directory-1)は在庫 6 個以上ある", () => {
      for (const seed of MANY) {
        expect(
          buildMountain(seed, "small").candidates.length,
        ).toBeGreaterThanOrEqual(2);
      }
      expect(
        buildMountain("directory-1", "small").candidates.length,
      ).toBeGreaterThanOrEqual(6);
    });

    it("真上のカメラ(mountainViewHeight)から、面の中心が上の段の縁に隠れずに見える", () => {
      for (const seed of MANY) {
        const m = buildMountain(seed, "small");
        for (const c of m.candidates) {
          expect(
            isVisibleFromAbove(
              c,
              m.tierRadii,
              m.tierHeight,
              mountainViewHeight("small"),
            ),
          ).toBe(true);
        }
      }
    });
  });

  it("成果物の板は、置き場の数(large の上限より少ない)だけ用意される", () => {
    for (const seed of SEEDS) {
      const m = buildMountain(seed, "small");
      expect(m.outputSheets.length).toBeGreaterThan(0);
      expect(m.outputSheets.length).toBeLessThanOrEqual(OUTPUT_MAX);
    }
  });
});

describe("isVisibleFromAbove", () => {
  const radii = [3.6, 3.1, 2.6];

  it("上の段の縁が視線を遮るなら見えない。カメラを高くすれば見える", () => {
    const face = {x: 3.5, z: 0, topY: 0.7};
    expect(isVisibleFromAbove(face, radii, 0.7, 4)).toBe(false);
    expect(isVisibleFromAbove(face, radii, 0.7, 30)).toBe(true);
  });

  it("一番上の段の面は、上に遮る段が無いので、カメラが上にあれば見える", () => {
    expect(isVisibleFromAbove({x: 0.3, z: 0, topY: 2.1}, radii, 0.7, 3)).toBe(
      true,
    );
    expect(isVisibleFromAbove({x: 0.3, z: 0, topY: 2.1}, radii, 0.7, 2)).toBe(
      false,
    );
  });
});
