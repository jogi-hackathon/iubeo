import {useCallback, useEffect, useMemo, useRef} from "react";

import {itemManager} from "../../../items/itemStore";
import {useLayoutSlot} from "../../layoutContext";
import {objectManager} from "../../objectStore";
import {type PcCursor, useNativePointer} from "../display/useNativePointer";
import type {PcProgram, PcProgramProps} from "../program";
import {pcSession} from "../session";
import {isSearchResultsUrl} from "./browser/browserChrome";
import {prewarmEngine} from "./browser/engine";
import {engineKeyboard, engineScreen} from "./browser/engineScreen";
import {createSearchDeliverable} from "./deliverable";
import {CONFIRM_MS, judgeAnnouncement, judgeStore, useJudge} from "./judge";
import {taskStore, useTask} from "./task";
import {PcTaskMemo} from "./TaskMemo";

const JUDGE_SETTLE_MS = 1200;

/**
 * Web 検索の PC。Gecko を画面に出し、開いたページがお題に合うかを Clef に見てもらう。
 * 合えば検索を成果物として渡し、合図のあと PC を畳む。
 * お題のメモは PC の横に置く(部屋の PC は look: "plain" で置かない)
 */
function SearchProgram({
  object,
  screen,
  using,
  mine,
  screenRef,
}: PcProgramProps) {
  const {item} = useLayoutSlot();
  const keyboard = useMemo(() => engineKeyboard(), []);
  const cursor = useMemo<PcCursor>(() => ({x: 0, y: 0}), []);
  useNativePointer({enabled: using, screen, screenRef, cursor});

  const judge = useJudge();
  const task = useTask();
  const currentUrl = useRef("");
  const judged = useRef<string | null>(null);
  const settle = useRef<number | undefined>(undefined);
  const deliverable = useMemo(
    () =>
      createSearchDeliverable({
        interact: (id) => objectManager.interact(id),
        held: () => itemManager.getHeld() !== null,
      }),
    [],
  );

  const judgeNow = useCallback(
    (url: string) => {
      window.clearTimeout(settle.current);
      settle.current = undefined;
      if (!url || url.startsWith("data:") || judged.current === url) {
        return;
      }
      judged.current = url;
      void (async () => {
        const currentTask = taskStore.getTask();
        const page = await screen.readPage?.();
        if (!page) {
          if (judged.current === url) {
            judged.current = null;
          }
          judgeStore.fail(
            currentTask,
            url,
            "今のページを読めません（エンジンが起動していない）",
          );
          return;
        }
        await judgeStore.run({task: currentTask, page});
      })();
    },
    [screen],
  );

  const scheduleJudgement = useCallback(
    (url: string) => {
      window.clearTimeout(settle.current);
      if (!url || url.startsWith("data:") || isSearchResultsUrl(url)) {
        return;
      }
      currentUrl.current = url;
      settle.current = window.setTimeout(() => judgeNow(url), JUDGE_SETTLE_MS);
    },
    [judgeNow],
  );

  useEffect(() => {
    if (!using) {
      return;
    }
    screen.onPageChange = scheduleJudgement;
    return () => {
      screen.onPageChange = undefined;
      window.clearTimeout(settle.current);
    };
  }, [using, screen, scheduleJudgement]);

  useEffect(() => {
    if (!using || !currentUrl.current) {
      return;
    }
    judged.current = null;
    scheduleJudgement(currentUrl.current);
  }, [task, using, scheduleJudgement]);

  useEffect(() => {
    if (!mine) {
      return;
    }
    const announcement = using ? judgeAnnouncement(judge) : null;
    screen.setNotice?.(announcement?.lines ?? null, announcement?.tear);
    if (!announcement) {
      return;
    }
    const timer = window.setTimeout(
      () => screen.setNotice?.(null),
      announcement.ms,
    );
    return () => window.clearTimeout(timer);
  }, [screen, mine, using, judge]);
  useEffect(
    () => () => {
      if (mine) {
        screen.setNotice?.(null);
      }
    },
    [screen, mine],
  );

  useEffect(() => {
    if (!using || judge.status !== "done" || judge.result.verdict !== "match") {
      return;
    }
    const timer = window.setTimeout(() => pcSession.leave(), CONFIRM_MS);
    return () => window.clearTimeout(timer);
  }, [using, judge]);

  useEffect(() => {
    if (!using) {
      return;
    }
    deliverable.onJudge(judge, object.id);
  }, [using, judge, object.id, deliverable]);

  useEffect(() => {
    if (!using) {
      judgeStore.reset();
      currentUrl.current = "";
      judged.current = null;
      window.clearTimeout(settle.current);
      deliverable.reset();
    }
  }, [using, deliverable]);

  useEffect(() => {
    if (!using) {
      return;
    }
    void screen.boot();
    keyboard.onActiveChange = (active) => {
      if (!active) {
        pcSession.leave();
      }
    };
    keyboard.engage(screen);
    return () => {
      keyboard.onActiveChange = undefined;
      keyboard.disengage();
    };
  }, [using, screen, keyboard]);

  return item.look === "plain" ? null : <PcTaskMemo clickable={using} />;
}

export const searchProgram: PcProgram = {
  screen: engineScreen,
  prewarm: () => prewarmEngine(location.search),
  Runner: SearchProgram,
};
