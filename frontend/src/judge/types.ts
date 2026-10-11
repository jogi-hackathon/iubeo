export type PageSnapshot = {
  url: string;
  title: string;
  text: string;
};

export type JudgeRequest = {
  task: string;
  page: PageSnapshot;
};

export type JudgeVerdict = "match" | "partial" | "mismatch";

export type JudgeResult = {
  verdict: JudgeVerdict;
  score: number;
  confidence: number;
  reasons: string[];
  source: "clef" | "heuristic" | "dev";
};
