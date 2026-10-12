import type {GameFlowState} from "../../../../flow";
import {noticeLabels} from "../../../../game/hudText";
import type {AppView, DesktopApp} from "../kernel/app";
import type {Rect, Size} from "../kernel/geometry";
import {paintButton, paintMarquee, wrapText} from "../paint/controls";
import {COLORS, FONT, FONT_BOLD} from "../theme/classic";
import {paintIcon} from "../theme/icons";
import {createButton, createControlSet} from "../toolkit/controls";

/** マッチングのアプリが使う、ゲームの流れ(flow/gameFlow)の口 */
export type MatchmakingPort = {
  getState(): GameFlowState;
  subscribe(listener: () => void): () => void;
  startMatchmaking(): unknown;
  cancelMatchmaking(): unknown;
};

type Schedule = (fn: () => void, ms: number) => () => void;

const defaultSchedule: Schedule = (fn, ms) => {
  const id = setInterval(fn, ms);
  return () => clearInterval(id);
};

const SIZE: Size = {width: 300, height: 150};

export const MATCHMAKING_LAYOUT = {
  button: {x: SIZE.width - 92, y: SIZE.height - 33, width: 80, height: 23},
  marquee: {x: 12, y: SIZE.height - 62, width: SIZE.width - 24, height: 16},
} as const satisfies Record<string, Rect>;

const TICK_MS = 100;

type Phase = "ready" | "connecting" | "waiting" | "found" | "failed";

const phaseOf = (state: GameFlowState): Phase => {
  switch (state.status) {
    case "idle":
      return "ready";
    case "issuing":
      return "connecting";
    case "queued":
      return "waiting";
    case "matched":
    case "entering":
    case "inSession":
      return "found";
    case "error":
      return "failed";
  }
};

const formatElapsed = (ms: number): string => {
  const sec = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;
};

/** 今の状態で出す文(1 つ目が本文、2 つ目は待ち時間やエラーの中身などの補足) */
export const matchmakingLines = (
  state: GameFlowState,
  elapsedMs: number | null,
): string[] => {
  switch (state.status) {
    case "idle":
      return [
        state.notice
          ? noticeLabels[state.notice]
          : "「開始」を押すと、一緒に遊ぶ相手を探します。",
      ];
    case "issuing":
      return ["サーバーに接続しています…"];
    case "queued":
      return [
        "対戦相手を探しています…",
        `待ち時間 ${formatElapsed(elapsedMs ?? 0)}`,
      ];
    case "matched":
    case "entering":
      return ["見つかりました。セッションに入ります…"];
    case "inSession":
      return ["セッションに参加しています。"];
    case "error":
      return [
        "うまくいきませんでした。「開始」でやり直せます。",
        state.message,
      ];
  }
};

/**
 * マッチングの窓。開始・キャンセルをゲームの流れへ伝え、待っている間は流れるバーと待ち時間を出す。
 * 見つかったら、そのまま画面へ飛び込む(シーンの切り替えが PC の画面を入口にする)
 */
export const createMatchmakingApp = ({
  flow,
  now = () => Date.now(),
  schedule = defaultSchedule,
}: {
  flow: MatchmakingPort;
  now?: () => number;
  schedule?: Schedule;
}): DesktopApp => ({
  id: "matchmaking",
  title: "マッチング",
  icon: "matchmaking",
  size: SIZE,
  open: (): AppView => {
    const listeners = new Set<() => void>();
    const notify = () => {
      for (const l of Array.from(listeners)) {
        l();
      }
    };

    let state = flow.getState();
    let waitingSince: number | null = null;
    let stopTicking: (() => void) | null = null;
    const startedAt = now();

    const sync = () => {
      state = flow.getState();
      const phase = phaseOf(state);
      if (phase === "waiting") {
        waitingSince ??= now();
      } else {
        waitingSince = null;
      }
      const animate =
        phase === "connecting" || phase === "waiting" || phase === "found";
      if (animate && !stopTicking) {
        stopTicking = schedule(notify, TICK_MS);
      } else if (!animate && stopTicking) {
        stopTicking();
        stopTicking = null;
      }
    };

    const button = createButton({
      rect: MATCHMAKING_LAYOUT.button,
      enabled: () => phaseOf(state) !== "found",
      onClick: () => {
        const phase = phaseOf(state);
        if (phase === "ready" || phase === "failed") {
          void flow.startMatchmaking();
        } else if (phase === "connecting" || phase === "waiting") {
          void flow.cancelMatchmaking();
        }
      },
    });
    const controls = createControlSet([button]);

    sync();
    const offFlow = flow.subscribe(() => {
      sync();
      notify();
    });

    const elapsed = (): number | null => {
      if (state.status !== "queued") {
        return null;
      }
      const since = state.queuedAt ? Date.parse(state.queuedAt) : waitingSince;
      return since === null || Number.isNaN(since) ? null : now() - since;
    };

    return {
      paint: (ctx, {width}) => {
        paintIcon(ctx, "matchmaking", 12, 12);
        ctx.font = FONT_BOLD;
        ctx.fillStyle = COLORS.text;
        ctx.fillText("対戦相手を探す", 56, 20);

        ctx.font = FONT;
        const [body = "", extra = ""] = matchmakingLines(state, elapsed());
        const lines = [
          ...wrapText(ctx, body, width - 68).map((text) => ({
            text,
            gray: false,
          })),
          ...wrapText(ctx, extra, width - 68).map((text) => ({
            text,
            gray: true,
          })),
        ].slice(0, 4);
        lines.forEach(({text, gray}, i) => {
          ctx.fillStyle = gray ? COLORS.grayText : COLORS.text;
          ctx.fillText(text, 56, 42 + i * 16);
        });

        const phase = phaseOf(state);
        if (
          phase === "connecting" ||
          phase === "waiting" ||
          phase === "found"
        ) {
          paintMarquee(
            ctx,
            MATCHMAKING_LAYOUT.marquee,
            (now() - startedAt) / 1000,
          );
        }
        const label =
          phase === "connecting" || phase === "waiting" ? "キャンセル" : "開始";
        paintButton(ctx, button, label, {isDefault: true});
      },
      pointer: (event) => {
        if (controls.pointer(event)) {
          notify();
        }
      },
      subscribe: (listener) => {
        listeners.add(listener);
        return () => {
          listeners.delete(listener);
        };
      },
      dispose: () => {
        offFlow();
        stopTicking?.();
        stopTicking = null;
        listeners.clear();
      },
    };
  },
});
