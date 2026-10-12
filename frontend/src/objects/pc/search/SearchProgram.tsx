import {useCallback, useEffect, useMemo, useRef} from "react";

import {sfxEngine} from "../../../core/audio/sfx/engine";
import {itemManager} from "../../../items/itemStore";
import {objectManager} from "../../objectStore";
import {useImeCaret} from "../display/useImeCaret";
import type {PcProgram, PcProgramProps} from "../program";
import {pcSession} from "../session";
import {isSearchResultsUrl} from "./browser/browserChrome";
import {prewarmEngine} from "./browser/engine";
import {engineKeyboard, engineScreen} from "./browser/engineScreen";
import {createSearchDeliverable} from "./deliverable";
import {CONFIRM_MS, judgeAnnouncement, judgeStore, useJudge} from "./judge";
import {useSearchTaskIdOf, useTopicOf} from "./task";
import {PcTaskMemo} from "./TaskMemo";

const JUDGE_SETTLE_MS = 1200;

function SearchProgram({
  object,
  screen,
  using,
  mine,
  screenRef,
}: PcProgramProps) {
  const keyboard = useMemo(() => engineKeyboard(), []);
  useImeCaret({enabled: using, screen, screenRef, keyboard});

  const judge = useJudge();
  const topic = useTopicOf(object.owner ?? null);
  const taskId = useSearchTaskIdOf(object.owner ?? null);
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
      if (!topic || !url || url.startsWith("data:") || judged.current === url) {
        return;
      }
      judged.current = url;
      void (async () => {
        const page = await screen.readPage?.();
        if (!page) {
          if (judged.current === url) {
            judged.current = null;
          }
          judgeStore.fail(
            topic,
            url,
            "今のページを読めません（エンジンが起動していない）",
          );
          return;
        }
        await judgeStore.run({task: topic, page});
      })();
    },
    [screen, topic],
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
    if (mine && taskId) {
      currentUrl.current = "";
      screen.startTask?.(taskId);
    }
  }, [screen, mine, taskId]);

  useEffect(() => {
    if (!using || !currentUrl.current) {
      return;
    }
    judged.current = null;
    scheduleJudgement(currentUrl.current);
  }, [topic, using, scheduleJudgement]);

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
    if (!using || judge.status !== "done") {
      return;
    }
    sfxEngine.them(judge.result.verdict === "match" ? "clefOk" : "clefNo");
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

  return <PcTaskMemo topic={topic} />;
}

export const searchProgram: PcProgram = {
  pointer: "native",
  screen: engineScreen,
  prewarm: () => prewarmEngine(location.search),
  Runner: SearchProgram,
};
