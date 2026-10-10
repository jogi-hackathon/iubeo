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

/** ボタンの id(オーソリティのオブジェクト id とは別。狙いとクリックの登録に使う) */
export const MATCHMAKING_BUTTON_ID = "room.matchmaking-button";

const IDLE_COLOR = "#4cd964";
const QUEUED_COLOR = "#ff9f43";

/**
 * room の机の上に置く、マッチングを始める仮のボタン。
 * 狙って左クリックすると、ゲームの流れ(gameFlow)の startMatchmaking / cancelMatchmaking を切り替える。
 * オーソリティが管理するオブジェクトにはしない(状態は gameFlow が持ち、ここは見た目とクリックだけ)。
 *
 * TODO(tutorial): チュートリアルの終わりにマッチングを始める形に置き換える。それまでの仮の入口
 */
export function MatchmakingButton() {
  const flow = useGameFlow();
  const root = useRef<Group>(null);
  const toggle = useRef<() => void>(() => {});

  // クリックの処理は、毎レンダーで最新に差し替える(登録は id と根だけで、貼り直さない)
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
