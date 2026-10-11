import {useLayoutEffect, useRef} from "react";
import type {Group} from "three";

import {aoModeUserData} from "../../bake/aoMode";
import {useGameFlow} from "../../flow";
import {gameFlow} from "../../flow/store";
import {
  OBJECT_ID_KEY,
  registerClientTarget,
  registerTarget,
} from "../../objects/interaction";
import {MATCHMAKING_BUTTON_POSITION} from "./layout";

export const MATCHMAKING_BUTTON_ID = "room.matchmaking-button";

const IDLE_COLOR = "#4cd964";
const QUEUED_COLOR = "#ff9f43";

export function MatchmakingButton() {
  const flow = useGameFlow();
  const root = useRef<Group>(null);
  const toggle = useRef<() => void>(() => {});

  toggle.current = () => {
    const {status} = gameFlow.getState();
    if (status === "queued" || status === "issuing") {
      void gameFlow.cancelMatchmaking();
    } else if (status === "idle" || status === "error") {
      void gameFlow.startMatchmaking();
    }
  };

  useLayoutEffect(() => {
    const group = root.current;
    if (!group) {
      return;
    }
    const offTarget = registerTarget(MATCHMAKING_BUTTON_ID, group);
    const offClient = registerClientTarget(MATCHMAKING_BUTTON_ID, {
      interact: () => toggle.current(),
    });
    return () => {
      offTarget();
      offClient();
    };
  }, []);

  const queued = flow.status === "queued" || flow.status === "issuing";
  const color = queued ? QUEUED_COLOR : IDLE_COLOR;

  return (
    <group
      ref={root}
      position={MATCHMAKING_BUTTON_POSITION}
      userData={{
        [OBJECT_ID_KEY]: MATCHMAKING_BUTTON_ID,
        ...aoModeUserData("realtime"),
      }}
    >
      <mesh position={[0, 0.02, 0]} castShadow={false}>
        <boxGeometry args={[0.16, 0.04, 0.16]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={queued ? 1.8 : 0.6}
        />
      </mesh>
    </group>
  );
}
