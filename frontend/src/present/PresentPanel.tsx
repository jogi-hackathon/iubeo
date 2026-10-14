import {mutedStyle, rowStyle, Section} from "../core/debug/ui";
import {DECK_IDS, DECKS, type DeckId} from "./script";
import {startPresentation} from "./session";

const DECK_LABELS: Record<
  DeckId,
  {title: string; start: string; note: string}
> = {
  intro: {
    title: "イントロ",
    start: "▶ イントロを始める",
    note: "黒い画面から始める。ロゴのあと自動で暗転し、倒れた状態から起き上がってチュートリアルへ。裏でゲームは最初の部屋・チュートリアルの始めに戻る",
  },
  tech: {
    title: "技術パート",
    start: "▶ 技術パートを始める (F9)",
    note: "今の画面のまま目を閉じて始める。終わりに目を開けると最初の部屋にいる",
  },
};

/** dev パネルの Present タブ。イントロと技術パートを始める(途中の手順からも始められる)。台本も確認できる */
export function PresentPanel() {
  return (
    <>
      <div style={mutedStyle}>
        次へ: → / Space / PageDown / Enter / クリック
        <br />
        戻る: ← / PageUp / Backspace / 右クリック ・ やめる: Esc
      </div>
      {DECK_IDS.map((deck) => (
        <Section key={deck} title={DECK_LABELS[deck].title}>
          <div style={rowStyle}>
            <button type="button" onClick={() => startPresentation(deck)}>
              {DECK_LABELS[deck].start}
            </button>
          </div>
          <div style={mutedStyle}>{DECK_LABELS[deck].note}</div>
          {DECKS[deck].map((step, i) => (
            <div key={step.id} style={{...rowStyle, alignItems: "baseline"}}>
              <button type="button" onClick={() => startPresentation(deck, i)}>
                {i}
              </button>
              <span>{step.line}</span>
            </div>
          ))}
        </Section>
      ))}
    </>
  );
}
