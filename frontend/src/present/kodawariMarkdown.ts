import type {
  KodawariContent,
  KodawariPoint,
  WorldScene,
} from "./kodawariContent";

/**
 * kodawari.md を読む。書き方は kodawari.md の先頭のコメントのとおり。
 * 書き間違いは行番号付きで投げる(プレゼンの前に気づけるように、黙って飛ばさない)
 */

const WORLD_SCENES: readonly WorldScene[] = [
  "light",
  "pc",
  "canvas",
  "ragdoll",
  "directory",
];

export interface KodawariDeck {
  /** 一覧のスライドの見出し(`#`) */
  title: string;
  items: KodawariContent[];
}

interface Draft {
  title: string;
  label?: string;
  color?: string;
  line?: string;
  points: (KodawariPoint & {sub: string[]})[];
}

const SCENE_SUFFIX = /\s*\{([a-z]+)\}$/;

export const parseKodawari = (source: string): KodawariDeck => {
  const fail = (lineNo: number, message: string): never => {
    throw new Error(`kodawari.md ${lineNo} 行目: ${message}`);
  };
  // コメント(書き方の説明)は行番号を保ったまま消す
  const lines = source
    .replace(/<!--[\s\S]*?-->/g, (c) => "\n".repeat(c.split("\n").length - 1))
    .split("\n");
  let title: string | null = null;
  const drafts: {draft: Draft; lineNo: number}[] = [];
  const current = (lineNo: number): Draft =>
    drafts.at(-1)?.draft ?? fail(lineNo, "`## 見出し` の前に書かれている");

  lines.forEach((raw, i) => {
    const lineNo = i + 1;
    const line = raw.trimEnd();
    if (line.trim() === "") {
      return;
    }
    let m: RegExpExecArray | null;
    if ((m = /^# (.+)$/.exec(line))) {
      title = m[1]!.trim();
    } else if ((m = /^## (.+)$/.exec(line))) {
      drafts.push({draft: {title: m[1]!.trim(), points: []}, lineNo});
    } else if ((m = /^名前:\s*(.+)$/.exec(line))) {
      current(lineNo).label = m[1]!.trim();
    } else if ((m = /^色:\s*(#[0-9a-fA-F]{6})$/.exec(line))) {
      current(lineNo).color = m[1]!.toLowerCase();
    } else if ((m = /^>\s*(.+)$/.exec(line))) {
      const d = current(lineNo);
      d.line = d.line ? `${d.line}${m[1]!.trim()}` : m[1]!.trim();
    } else if ((m = /^- (.+)$/.exec(line))) {
      let text = m[1]!.trim();
      let scene: WorldScene | undefined;
      const s = SCENE_SUFFIX.exec(text);
      if (s) {
        if (!WORLD_SCENES.includes(s[1] as WorldScene)) {
          fail(
            lineNo,
            `{${s[1]}} は描ける実物ではない(${WORLD_SCENES.join("・")})`,
          );
        }
        scene = s[1] as WorldScene;
        text = text.slice(0, s.index).trim();
      }
      current(lineNo).points.push({text, sub: [], ...(scene && {scene})});
    } else if ((m = /^\s{2,}- (.+)$/.exec(line))) {
      const point =
        current(lineNo).points.at(-1) ??
        fail(lineNo, "補足(字下げした -)の前に項目(-)が無い");
      point.sub.push(m[1]!.trim());
    } else {
      fail(lineNo, `読めない行: ${line}`);
    }
  });

  if (title === null) {
    return fail(1, "一覧の見出し(`# 見出し`)が無い");
  }
  const items = drafts.map(({draft, lineNo}, index): KodawariContent => {
    const where = `「${draft.title}」`;
    if (!draft.label) {
      fail(lineNo, `${where}に 名前: が無い`);
    }
    if (!draft.color) {
      fail(lineNo, `${where}に 色: が無い`);
    }
    if (draft.points.length === 0) {
      fail(lineNo, `${where}に項目(-)が無い`);
    }
    return {
      key: String(index + 1),
      label: draft.label!,
      title: draft.title,
      color: draft.color!,
      line: draft.line ?? draft.points[0]!.text,
      points: draft.points.map(({sub, ...p}) => ({
        ...p,
        ...(sub.length > 0 && {sub}),
      })),
    };
  });
  return {title, items};
};
