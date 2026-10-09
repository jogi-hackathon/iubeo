/**
 * Web Search の判定で、画面 (クライアント) と Worker がやり取りする型。
 *
 * 依存を持たせない (React も DOM も three も読まない)。Worker はブラウザの型を持たないので、
 * 共有する型はここに置く。
 */

/** 判定に渡す、今表示しているページの情報 */
export type PageSnapshot = {
  /** 表示中の URL */
  url: string;
  /** ページのタイトル */
  title: string;
  /** 本文の抜粋 (長いページは切り詰める) */
  text: string;
};

/** 判定の依頼。お題 (`task`) と、今見ているページ */
export type JudgeRequest = {
  task: string;
  page: PageSnapshot;
};

/** お題に対する検索の適合度 */
export type JudgeVerdict = "match" | "partial" | "mismatch";

/**
 * 判定の結果。画面に出すのはこの形だけで、Clef の生の答えは含めない。
 * 一致度 (`score`) と確からしさ (`confidence`) は別物: 前者は「どれだけ合っているか」、
 * 後者は「その判断にどれだけ自信があるか」。
 */
export type JudgeResult = {
  verdict: JudgeVerdict;
  /** お題への一致度 0..1 */
  score: number;
  /** 判定の確からしさ 0..1 */
  confidence: number;
  /**
   * 画面に出す短い理由。Clef は文字列を生成しないので、答え (いくつかの質問の確率) から
   * コード側で組み立てる。System One の「分解してコードでまとめる」方針に合わせる
   */
  reasons: string[];
  /** 判定した相手。clef は本物の判定、heuristic は簡易判定、dev は開発用の常時一致 */
  source: "clef" | "heuristic" | "dev";
};
