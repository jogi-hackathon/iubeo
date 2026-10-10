import type {Vec3} from "../../props/types";
import {createRandom, hashString} from "./random";

/** 書類の板 1 枚。size は (幅, 厚み, 奥行き)、position は山の足元中心からの相対。向きは Y 軸まわりの yaw だけ */
export type Sheet = {
  position: Vec3;
  yaw: number;
  size: Vec3;
  color: string;
};

/**
 * 束からはみ出す、薄い紙(厚さ数 mm〜1cm)。rotation は Euler(順序 YXZ)で (傾き, yaw, ひねり)。
 * 傾きは、幅の軸(周方向)まわり。負で段の縁から外へ垂れ下がり、正で外側の端が持ち上がって斜めに立てかかる
 */
export type LooseSheet = {
  position: Vec3;
  rotation: Vec3;
  size: Vec3;
  color: string;
};

/**
 * 芯の三角形メッシュ(足元中心が原点。y が上)。uvs は AO のベイク用で、チャート(段ごとの側面・上面)ごとに [0,1]²。
 * groups は、チャートごとの indices の範囲(頂点はチャートをまたいで共有しない)
 */
export type CoreMesh = {
  positions: number[];
  uvs: number[];
  indices: number[];
  groups: Array<{start: number; count: number}>;
};

/**
 * 在庫ファイルを割り当てられる束。真上から見える束の上面で、
 * x・z は上面の中心、topY は上面の高さ、yaw・width・depth は上面の向きと大きさ(足元中心からの相対)
 */
export type Candidate = {
  x: number;
  z: number;
  topY: number;
  yaw: number;
  width: number;
  depth: number;
};

export type Mountain = {
  height: number;
  /** 段の外側の半径(下の段から順に)。上の段ほど狭い */
  tierRadii: number[];
  /** 段ごとの高さ(m) */
  tierHeight: number;
  core: CoreMesh;
  /** 山を構成する束の板 */
  sheets: Sheet[];
  /** 束や段の縁からはみ出す、薄い紙(差し色は、この一部にだけ、ごく少数) */
  looseSheets: LooseSheet[];
  /** 成果物の板(下の方の段の束の上)。先頭から、成果物の数だけ見せる */
  outputSheets: Sheet[];
  /** 在庫ファイルを割り当てられる束(下の方の段の、上の段に隠れずに見える束) */
  candidates: Candidate[];
};

/**
 * 山の大きさを決める値。段数・段の外側の半径(下の段と上の段。間の段は、同じ幅ずつ狭くなる)・高さの範囲(m)。
 * 束の大きさ・本の積み方・はみ出す紙などは、大きさによらず共通
 */
export type MountainSize = {
  tiers: number;
  radiusBottom: number;
  radiusTop: number;
  heightMin: number;
  heightMax: number;
};

export type MountainSizeName = "large" | "small";

/** large は既定(test など)。small は room のような狭い部屋用 */
export const MOUNTAIN_SIZES: Record<MountainSizeName, MountainSize> = {
  large: {
    tiers: 7,
    radiusBottom: 3.6,
    radiusTop: 0.6,
    heightMin: 4.6,
    heightMax: 5.4,
  },
  small: {
    tiers: 3,
    radiusBottom: 1.6,
    radiusTop: 0.6,
    heightMin: 1.9,
    heightMax: 2.2,
  },
};

const REACH_MARGIN = 0.8;

/** 山(芯と、束の端まで)が収まる、足元中心からの半径(m) */
export const mountainReach = (size: MountainSizeName): number =>
  MOUNTAIN_SIZES[size].radiusBottom + REACH_MARGIN;

/** 山の高さの上限(m) */
export const mountainHeightMax = (size: MountainSizeName): number =>
  MOUNTAIN_SIZES[size].heightMax;

/**
 * 俯瞰のカメラの、地面からの高さの下限(m)。真上からは、上の段が下の段の縁を隠すので、
 * 山の高さの約 2 倍から見て、下の段の上面を見えるようにする
 */
export const mountainViewHeight = (size: MountainSizeName): number =>
  mountainHeightMax(size) * 2;

/** large の値(後方互換) */
export const MOUNTAIN_HEIGHT_MAX = mountainHeightMax("large");
export const MOUNTAIN_REACH = mountainReach("large");
export const VIEW_HEIGHT = mountainViewHeight("large");

const BOOKS_PER_BUNDLE: [number, number] = [4, 6];
const ASKEW_RATE = 0.15;
const BUNDLE_WIDTH: [number, number] = [0.55, 0.75];
const BUNDLE_DEPTH: [number, number] = [0.36, 0.44];
const BUNDLE_PITCH = 0.66;
/** はみ出す紙の枚数 */
export const LOOSE_COUNT = 64;
const CANDIDATE_TIERS = 4;
/** 成果物として増やして見せる板の上限 */
export const OUTPUT_MAX = 24;
const CORE_SEGMENTS = 16;
const CORE_INSET = 0.1;
const CORE_DROP = 0.05;
const CORE_SKIRT = 0.3;

// 束は紙の白だけ(少し揺らす)。差し色は、薄いはみ出し紙の、ごく少数にだけ使う(大きな箱には使わない)
export const PAPERS = ["#ffffff", "#fafaf8", "#f5f5f2", "#fcfcfb"] as const;
const ACCENTS = ["#c9a46a", "#8fa7a0", "#b98277", "#7f94b3"] as const;
const ACCENT_RATE = 0.12;

const pick = <T>(list: readonly T[], r: number): T =>
  list[Math.floor(r * list.length)] as T;

const buildCore = (radii: number[], tierHeight: number): CoreMesh => {
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const groups: CoreMesh["groups"] = [];
  radii.forEach((outer, t) => {
    const r = outer - CORE_INSET;
    const y0 = t === 0 ? -CORE_SKIRT : t * tierHeight;
    const y1 = (t + 1) * tierHeight - CORE_DROP;
    const bottom = positions.length / 3;
    [y0, y1].forEach((y, v) => {
      for (let j = 0; j <= CORE_SEGMENTS; j++) {
        const a = (j / CORE_SEGMENTS) * Math.PI * 2;
        positions.push(Math.cos(a) * r, y, Math.sin(a) * r);
        uvs.push(j / CORE_SEGMENTS, v);
      }
    });
    const top = bottom + CORE_SEGMENTS + 1;
    const sideStart = indices.length;
    for (let j = 0; j < CORE_SEGMENTS; j++) {
      indices.push(bottom + j, top + j + 1, bottom + j + 1);
      indices.push(bottom + j, top + j, top + j + 1);
    }
    groups.push({start: sideStart, count: indices.length - sideStart});
    const ring = positions.length / 3;
    for (let j = 0; j < CORE_SEGMENTS; j++) {
      const a = (j / CORE_SEGMENTS) * Math.PI * 2;
      positions.push(Math.cos(a) * r, y1, Math.sin(a) * r);
      uvs.push(0.5 + Math.cos(a) / 2, 0.5 + Math.sin(a) / 2);
    }
    const center = positions.length / 3;
    positions.push(0, y1, 0);
    uvs.push(0.5, 0.5);
    const topStart = indices.length;
    for (let j = 0; j < CORE_SEGMENTS; j++) {
      indices.push(center, ring + ((j + 1) % CORE_SEGMENTS), ring + j);
    }
    groups.push({start: topStart, count: indices.length - topStart});
  });
  return {positions, uvs, indices, groups};
};

/** ディレクトリの山の seed。山の形はこの値と大きさだけで決まる(id やシーンには依らない) */
export const DIRECTORY_MOUNTAIN_SEED = "directory-1";

/**
 * 段(テラス)を上へ行くほど狭く積んだ、書類の山(手続き生成)。seed から決まる(ディレクトリは固定の seed を使う)。
 * 各段は、上の段に覆われない外周の帯(幅 0.5m ほど)に、束(厚みの違う白い本を 4〜6 冊重ねた小さな山積み)を並べる。
 * 束は、ずれ・回転・はみ出しを付けて不規則に崩す。段の内側は、見えない芯(段々の円柱)で埋める。
 * 段数・半径・高さは sizeName(MOUNTAIN_SIZES)で決まる(既定の large)
 */
export const buildMountain = (
  seed: string,
  sizeName: MountainSizeName = "large",
): Mountain => {
  const size = MOUNTAIN_SIZES[sizeName];
  const {tiers, radiusBottom, radiusTop} = size;
  const random = createRandom(hashString(`mountain:${seed}`));
  const range = ([a, b]: [number, number]) => a + random() * (b - a);
  const height = size.heightMin + random() * (size.heightMax - size.heightMin);
  const tierHeight = height / tiers;
  const step = (radiusBottom - radiusTop) / (tiers - 1);
  const tierRadii = Array.from(
    {length: tiers},
    (_, t) => radiusBottom - t * step,
  );

  const sheets: Sheet[] = [];
  const candidates: Candidate[] = [];
  const outputSlots: Candidate[] = [];
  const looseSlots: Array<Candidate & {drop: number}> = [];

  for (let t = 0; t < tiers; t++) {
    const outer = tierRadii[t] as number;
    const inner = tierRadii[t + 1] ?? 0;
    const band = outer - inner;
    const mid = (outer + inner) / 2;
    const count = Math.max(3, Math.round((2 * Math.PI * mid) / BUNDLE_PITCH));
    const phase = random() * Math.PI * 2;
    for (let i = 0; i < count; i++) {
      const theta =
        phase + ((i + (random() - 0.5) * 0.3) / count) * Math.PI * 2;
      const r = mid + (random() - 0.5) * 0.14;
      const depth = Math.min(range(BUNDLE_DEPTH), band - 0.04);
      const width = range(BUNDLE_WIDTH);
      const yaw =
        Math.atan2(-Math.cos(theta), -Math.sin(theta)) + (random() - 0.5) * 0.8;
      const cx = Math.cos(theta) * r;
      const cz = Math.sin(theta) * r;
      const books =
        BOOKS_PER_BUNDLE[0] +
        Math.floor(random() * (BOOKS_PER_BUNDLE[1] - BOOKS_PER_BUNDLE[0] + 1));
      const weights = Array.from({length: books}, () => 0.5 + random());
      const total = weights.reduce((a, b) => a + b, 0);
      let y = t * tierHeight;
      let top: Sheet | undefined;
      for (let j = 0; j < books; j++) {
        const thickness = ((weights[j] as number) / total) * tierHeight;
        const isTop = j === books - 1;
        const askew = !isTop && random() < ASKEW_RATE;
        const w =
          width * (isTop ? 0.94 + random() * 0.12 : 0.8 + random() * 0.26);
        const d =
          depth * (isTop ? 0.94 + random() * 0.12 : 0.84 + random() * 0.22);
        top = {
          position: [
            cx + (random() - 0.5) * 0.12,
            y + thickness / 2,
            cz + (random() - 0.5) * 0.12,
          ],
          yaw: yaw + (random() - 0.5) * (askew ? 1.3 : 0.4),
          size: [w, thickness, d],
          color: pick(PAPERS, random()),
        };
        y += thickness;
        sheets.push(top);
      }
      const sheetHeight = top ? top.size[1] : 0;
      if (t < CANDIDATE_TIERS && top) {
        const face: Candidate = {
          x: top.position[0],
          z: top.position[2],
          topY: top.position[1] + sheetHeight / 2,
          yaw: top.yaw,
          width: top.size[0],
          depth: top.size[2],
        };
        (i % 2 === 0 ? candidates : outputSlots).push(face);
        if (i % 2 !== 0) {
          looseSlots.push({...face, drop: tierHeight});
        }
      } else if (top) {
        looseSlots.push({
          x: top.position[0],
          z: top.position[2],
          topY: top.position[1] + sheetHeight / 2,
          yaw: top.yaw,
          width: top.size[0],
          depth: top.size[2],
          drop: tierHeight,
        });
      }
    }
  }

  const outputSheets = outputSlots
    .map((slot) => ({slot, order: random()}))
    .sort((a, b) => a.order - b.order)
    .slice(0, OUTPUT_MAX)
    .map(({slot}): Sheet => {
      const thickness = 0.04;
      return {
        position: [slot.x, slot.topY + thickness / 2, slot.z],
        yaw: slot.yaw + (random() - 0.5) * 0.6,
        size: [0.5, thickness, 0.36],
        color: pick(PAPERS, random()),
      };
    });

  const looseSheets = Array.from({length: LOOSE_COUNT}, (): LooseSheet => {
    const slot = looseSlots[
      Math.floor(random() * looseSlots.length)
    ] as Candidate & {drop: number};
    const theta = Math.atan2(slot.z, slot.x);
    const out = {x: Math.cos(theta), z: Math.sin(theta)};
    const yaw =
      Math.atan2(-Math.cos(theta), -Math.sin(theta)) + (random() - 0.5) * 0.6;
    const width = range([0.35, 0.65]);
    const thickness = range([0.004, 0.01]);
    const depth = range([0.3, 0.5]);
    const mode = random();
    let tilt: number;
    let inner = {
      x: slot.x + out.x * (slot.depth / 2),
      z: slot.z + out.z * (slot.depth / 2),
    };
    let y = slot.topY;
    if (mode < 0.4) {
      tilt = -(0.25 + random() * 0.65);
    } else if (mode < 0.7) {
      tilt = 0.8 + random() * 0.5;
    } else {
      tilt = (random() - 0.5) * 0.3;
      inner = {x: inner.x - out.x * 0.12, z: inner.z - out.z * 0.12};
      y = slot.topY - random() * slot.drop * 0.3;
    }
    const cosT = Math.cos(tilt);
    const sinT = Math.sin(tilt);
    const accent = random() < ACCENT_RATE;
    return {
      position: [
        inner.x + out.x * (depth / 2) * cosT,
        y + (depth / 2) * sinT,
        inner.z + out.z * (depth / 2) * cosT,
      ],
      rotation: [tilt, yaw, (random() - 0.5) * 0.3],
      size: [width, thickness, depth],
      color: accent ? pick(ACCENTS, random()) : pick(PAPERS, random()),
    };
  });

  return {
    height,
    tierRadii,
    tierHeight,
    core: buildCore(tierRadii, tierHeight),
    sheets,
    looseSheets,
    outputSheets,
    candidates: candidates.filter((c) =>
      isVisibleFromAbove(
        c,
        tierRadii,
        tierHeight,
        mountainViewHeight(sizeName),
      ),
    ),
  };
};

/** 真上のカメラ(足元中心の真上、地面から cameraHeight)から、面の中心が、上の段の縁に隠れずに見えるか */
export const isVisibleFromAbove = (
  face: Pick<Candidate, "x" | "z" | "topY">,
  tierRadii: readonly number[],
  tierHeight: number,
  cameraHeight: number,
  clearance = 0.08,
): boolean => {
  const r = Math.hypot(face.x, face.z);
  const rise = cameraHeight - face.topY;
  if (rise <= 0) {
    return false;
  }
  for (let u = 0; u < tierRadii.length; u++) {
    const cornerR = tierRadii[u] as number;
    const cornerY = (u + 1) * tierHeight;
    if (cornerY <= face.topY + 1e-9 || cornerR >= r) {
      continue;
    }
    const lineY = cameraHeight - rise * (cornerR / r);
    if (lineY < cornerY + clearance) {
      return false;
    }
  }
  return true;
};
