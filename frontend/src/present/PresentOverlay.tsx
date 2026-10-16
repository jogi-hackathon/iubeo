import {useEffect, useReducer} from "react";

import {DEBUG_AVAILABLE} from "../core/debug/flags";
import {ASK_END_MS, PROMPTS_END_MS, STALL_END_MS, SWAP_END_MS} from "./chat";
import {createFrameGate} from "./frameGate";
import {IntroStage} from "./IntroStage";
import {DECKS, type DeckId, type StepId, stepIdOf} from "./script";
import {
  advancePresentation,
  backPresentation,
  endPresentation,
  startPresentation,
} from "./session";
import {presentStore, usePresent} from "./store";
import {TechStage} from "./TechStage";
import {
  CLOSE_LID_DURATION_MS,
  CLOSE_LID_KEYS,
  LID_DURATION_MS,
  LID_KEYS,
  lidAt,
  LOGO_TURN_MS,
} from "./timeline";

const NEXT_KEYS = new Set([
  "ArrowRight",
  "ArrowDown",
  "PageDown",
  "Space",
  "Enter",
  "KeyN",
]);
const PREV_KEYS = new Set([
  "ArrowLeft",
  "ArrowUp",
  "PageUp",
  "Backspace",
  "KeyP",
]);

const INTRO_AUTO_ADVANCE_MS: Partial<Record<StepId<"intro">, number>> = {
  ask: ASK_END_MS,
  prompts: PROMPTS_END_MS,
  stall: STALL_END_MS,
  swap: SWAP_END_MS,
  logo: LOGO_TURN_MS,
};

const autoAdvanceMsOf = (deck: DeckId, id: string): number | undefined =>
  deck === "intro" ? INTRO_AUTO_ADVANCE_MS[id as StepId<"intro">] : undefined;

/** 経過時間(ms)で描き直す。プレゼン中だけ毎フレーム再描画する */
const useElapsed = (since: number): number => {
  const [, tick] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    const open = createFrameGate();
    let id = requestAnimationFrame(function loop(now) {
      if (open(now)) {
        tick();
      }
      id = requestAnimationFrame(loop);
    });
    return () => cancelAnimationFrame(id);
  }, []);
  return performance.now() - since;
};

/** 技術パートを始めるキー(デモの画面で dev パネルを開かずに済むように) */
const TECH_KEY = "F9";

/**
 * プレゼンの演出。dev パネルの Present タブ(技術パートは F9 でも)から始める。
 * → / Space / PageDown / Enter / クリックで次へ、← / PageUp / Backspace で戻る、Esc でやめる。
 * イントロは喋らずに流すので、暗転で待っているところから次へを押すと、あとは起き上がりまで自動で進む
 */
export function PresentOverlay() {
  const state = usePresent();

  useEffect(() => {
    if (!DEBUG_AVAILABLE) {
      return;
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.code === TECH_KEY && !presentStore.getState().active) {
        e.preventDefault();
        startPresentation("tech");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (!state.active) {
    return null;
  }
  return (
    <PresentStage
      key={state.deck}
      deck={state.deck}
      step={state.step}
      since={state.since}
    />
  );
}

function PresentStage({
  deck,
  step,
  since,
}: {
  deck: DeckId;
  step: number;
  since: number;
}) {
  const elapsed = useElapsed(since);
  const id = stepIdOf(deck, step);
  const waking = deck === "tech" && id === "wake";
  const autoAdvanceMs = autoAdvanceMsOf(deck, id);
  const autoplaying = autoAdvanceMs !== undefined;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (waking) {
        if (e.code === "Escape") {
          endPresentation();
        }
        return;
      }
      // ゲーム側の入力(移動・dev パネルのホットキー)に渡さない
      e.stopImmediatePropagation();
      if (e.repeat) {
        return;
      }
      if (e.code === "Escape") {
        endPresentation();
      } else if (autoplaying) {
        e.preventDefault();
      } else if (NEXT_KEYS.has(e.code)) {
        e.preventDefault();
        advancePresentation();
      } else if (PREV_KEYS.has(e.code)) {
        e.preventDefault();
        backPresentation();
      }
    };
    // クリックでも進める(右クリックで戻る)。目を開け始めたらクリックはゲームの画面へ通す
    const onPointer = (e: MouseEvent) => {
      if (waking || autoplaying) {
        return;
      }
      if (e.button === 0) {
        advancePresentation();
      } else if (e.button === 2) {
        backPresentation();
      }
    };
    const onContextMenu = (e: MouseEvent) => {
      if (!waking) {
        e.preventDefault();
      }
    };
    window.addEventListener("keydown", onKey, {capture: true});
    window.addEventListener("mousedown", onPointer);
    window.addEventListener("contextmenu", onContextMenu);
    return () => {
      window.removeEventListener("keydown", onKey, {capture: true});
      window.removeEventListener("mousedown", onPointer);
      window.removeEventListener("contextmenu", onContextMenu);
    };
  }, [waking, autoplaying]);

  useEffect(() => {
    if (!waking) {
      return;
    }
    const id = setTimeout(endPresentation, LID_DURATION_MS);
    return () => clearTimeout(id);
  }, [waking]);

  useEffect(() => {
    if (autoAdvanceMs === undefined) {
      return;
    }
    const id = setTimeout(advancePresentation, autoAdvanceMs);
    return () => clearTimeout(id);
  }, [step, autoAdvanceMs]);

  if (waking) {
    return <Lid elapsed={elapsed} keys={LID_KEYS} />;
  }
  // 技術パートはデモの画面のまま始め、目を閉じきってから黒い世界に入る
  if (id === "close" && elapsed < CLOSE_LID_DURATION_MS) {
    return <Lid elapsed={elapsed} keys={CLOSE_LID_KEYS} />;
  }

  return (
    <div className="present" data-deck={deck}>
      {deck === "intro" ? (
        <IntroStage step={step} elapsed={elapsed} />
      ) : (
        <TechStage step={step} elapsed={elapsed} />
      )}
      <div className="present-step" aria-hidden>
        {step + 1} / {DECKS[deck].length}
      </div>
    </div>
  );
}

/** まぶた。黒い幕を楕円に切り抜き、ぼやけた視界ごと開く(閉じる)。下にはゲームの画面がある */
function Lid({
  elapsed,
  keys,
}: {
  elapsed: number;
  keys: Parameters<typeof lidAt>[1];
}) {
  const {open, blur} = lidAt(elapsed, keys);
  const w = window.innerWidth;
  const h = window.innerHeight;
  const rx = w * (0.35 + 0.5 * open);
  const ry = Math.max(0.5, h * 0.5 * open);
  const mask = `radial-gradient(ellipse ${rx}px ${ry}px at 50% 50%, transparent 55%, #000 100%)`;
  return (
    <>
      <div
        className="present-blur"
        style={{backdropFilter: `blur(${blur}px)`}}
      />
      <div
        className="present-lid"
        style={{maskImage: mask, WebkitMaskImage: mask}}
      />
    </>
  );
}
