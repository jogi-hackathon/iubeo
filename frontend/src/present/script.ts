/**
 * プレゼンの台本。デッキごとに、手順をプレゼンターのキー操作で 1 つずつ進める。
 * line はプレゼンターが話す台詞(の案)で、画面には出さない(dev パネルの台本表示に使う)
 */
export const DECKS = {
  intro: [
    {id: "dark", line: "AIにどんなことをさせていますか？"},
    {id: "ask", line: "例えば…"},
    {
      id: "prompts",
      line: "他にも…画像生成からファイルの読み書き、Web検索まで",
    },
    {id: "stall", line: "(黙って待つ。AIの方から頼みごとが届く)"},
    {id: "swap", line: "では、もしも立場が入れかわったら…"},
    {
      id: "logo",
      line: "AIと人間との立場が入れかわった世界。それがIUBEOです",
    },
    {id: "wake", line: "(目を開ける → チュートリアルへ)"},
  ],
} as const;

export type DeckId = keyof typeof DECKS;

export const DECK_IDS = Object.keys(DECKS) as DeckId[];

export type StepId<D extends DeckId> = (typeof DECKS)[D][number]["id"];

export const stepIndexOf = <D extends DeckId>(deck: D, id: StepId<D>): number =>
  DECKS[deck].findIndex((s) => s.id === id);

export const lastStepOf = (deck: DeckId): number => DECKS[deck].length - 1;

export const stepIdOf = (deck: DeckId, step: number): string =>
  DECKS[deck][step]?.id ?? "";
