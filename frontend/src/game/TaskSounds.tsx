import {useFrame} from "@react-three/fiber";
import {useEffect, useRef} from "react";

import {useMyPlayerId} from "../authority/useMyPlayerId";
import {sfxEngine} from "../core/audio/sfx/engine";
import {gameStore, remainingMs, useGameState} from "./gameStore";

const DEADLINE_SECONDS = 10;

export function TaskSounds() {
  const myPlayerId = useMyPlayerId();
  const {phase} = useGameState();
  const completed = useRef(new Set<string>());
  const lastSecond = useRef<number | null>(null);
  const phaseNumber = phase?.number ?? null;

  useEffect(() => {
    completed.current.clear();
    lastSecond.current = null;
  }, [phaseNumber]);

  useEffect(() => {
    for (const task of phase?.tasks ?? []) {
      if (task.status !== "completed" || completed.current.has(task.taskId)) {
        continue;
      }
      completed.current.add(task.taskId);
      if (task.assigneePlayerId === myPlayerId) {
        sfxEngine.them("done");
      }
    }
  }, [phase, myPlayerId]);

  useFrame(() => {
    const left = remainingMs(gameStore.getState(), Date.now());
    if (left === null || left <= 0 || left > DEADLINE_SECONDS * 1000) {
      lastSecond.current = null;
      return;
    }
    const second = Math.ceil(left / 1000);
    if (second !== lastSecond.current) {
      lastSecond.current = second;
      sfxEngine.them("deadline");
    }
  });

  return null;
}
