import source from "./kodawari.md?raw";
import {parseKodawari} from "./kodawariMarkdown";

/**
 * 技術パートの「6 つのこだわり」の中身。kodawari.md から読み、台本(script.ts)と画面(Kodawari.tsx)の両方で使う。
 * こだわりごとに、箇条書きの 1 項目(と、その下の補足)を 1 手順で 1 つずつ出す
 */

/** 世界観のこだわりで、項目ごとに右側へ実物を描くもの(WorldShowcase.tsx) */
export type WorldScene = "light" | "pc" | "canvas" | "ragdoll" | "directory";

export interface KodawariPoint {
  text: string;
  sub?: readonly string[];
  /** この項目を出している間、右側に描く実物(世界観の項目はゲームの流れの順に並べる) */
  scene?: WorldScene;
}

export interface KodawariContent {
  /** 手順の id に使う(md の並び順の番号) */
  key: string;
  /** 一覧で立方体の下に出す名前 */
  label: string;
  title: string;
  /** 立方体の縁の色。ゲームのファイルと同じ 6 色(backend/internal/session/layout.go の directoryStock) */
  color: string;
  /** 最初の項目を出す手順で話す台詞(以降の手順は項目そのもの) */
  line: string;
  points: readonly KodawariPoint[];
}

const deck = parseKodawari(source);

/** 一覧のスライドの見出し */
export const KODAWARI_TITLE = deck.title;

export const KODAWARI_CONTENT: readonly KodawariContent[] = deck.items;

/** こだわりの手順の id。count は出している項目の数(1 から) */
export const kodawariStepId = (key: string, count: number): string =>
  `k-${key}/${count}`;

/** 技術パートの手順のうち、こだわりの各項目を出す手順 */
export const KODAWARI_STEPS = KODAWARI_CONTENT.flatMap((k) =>
  k.points.map((p, i) => ({
    id: kodawariStepId(k.key, i + 1),
    line: i === 0 ? k.line : p.text,
  })),
);
