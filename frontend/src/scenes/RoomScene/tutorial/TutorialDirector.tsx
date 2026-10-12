import {useFrame} from "@react-three/fiber";
import {useEffect, useRef, useState} from "react";

import {authorityRegistry} from "../../../authority/registry";
import {cameraGlitch} from "../../../camera/postprocess";
import {useToggles} from "../../../core/toggles";
import {FILE_KIND, itemManager, parseFileData} from "../../../items";
import {BOOT_MS} from "../../../objects/pc/bootScreen";
import {pcPower, usePcPower} from "../../../objects/pc/power";
import {pcSession} from "../../../objects/pc/session";
import {localPlayer} from "../../../player/local";
import {type TutorialFlowState, tutorialStore} from "../../../tutorial";
import {ROOM_LAYOUT} from "../layout";
import {
  calmLook,
  COMPLETED_LOOK,
  HIDDEN_LOOK,
  lookFor,
  reveals,
  type TutorialLook,
  TUTORIAL_OBJECT_KEYS,
} from "./look";
import {tutorialManager, useTutorialFlow} from "./manager";
import type {TutorialEvent} from "./steps";
import {TUTORIAL_FILE_COLOR, TutorialFile} from "./TutorialFile";
import {zonesAt} from "./zones";

const STEP_GAP_MS = 600;
const GLITCH_MS = 450;
const GLITCH_LEAD_MS = 110;

type Flow = TutorialFlowState<TutorialEvent>;

/**
 * 部屋のチュートリアルを進める。進行(./manager)へ合図を送り、手順に合わせて物の見せ方(./look)を切り替える。
 *
 * - 進行: シーンに入ったら始め、出たら中断する(dev パネルで reset されたら始め直す)
 * - 合図: 手に持ったファイルの状態、プレイヤーが立っている範囲(./zones)、部屋の PC が起動し終えたこと
 * - 見せ方: 次の手順へは少し間を置いて移り、新しい物が現れるときは画面を一瞬乱す
 * - PC の電源: 終えるまでは落としておき、最後の手順で PC を触ると起動する(ロゴと読み込み)。起動し終えたら完了
 */
export function TutorialDirector() {
  const flow = useTutorialFlow();
  useTutorialRun(flow);
  useTutorialSignals();
  const look = useTutorialLook(flow);
  usePcBoot(flow);
  return look.pickupFile ? <TutorialFile onTake={giveUneditedFile} /> : null;
}

const useTutorialRun = (flow: Flow): void => {
  useEffect(() => {
    if (flow.status === "idle") {
      tutorialManager.start();
    }
  }, [flow.status]);
  useEffect(() => () => tutorialManager.abort(), []);
};

const heldFileStatus = () => {
  const held = itemManager.getHeld();
  if (held?.kind !== FILE_KIND) {
    return null;
  }
  return parseFileData(held.data)?.status ?? null;
};

const useTutorialSignals = (): void => {
  useEffect(() => {
    let last = heldFileStatus();
    return itemManager.subscribe(() => {
      const file = heldFileStatus();
      if (file !== last) {
        last = file;
        tutorialManager.signal({type: "held", file});
      }
    });
  }, []);

  useEffect(
    () =>
      pcPower.subscribe(() => {
        if (pcPower.get() === "on") {
          tutorialManager.signal({type: "pcBooted"});
        }
      }),
    [],
  );

  useFrame(() => {
    const {x, z} = localPlayer.position;
    for (const zone of zonesAt(x, z)) {
      tutorialManager.signal({type: "zone", zone});
    }
  });
};

/** 今の手順の見せ方を、トグル(表示・機能・強調)へ反映して返す。PC の起動が始まったら PC の強調は消す */
const useTutorialLook = (flow: Flow): TutorialLook => {
  const toggles = useToggles();
  const pcBooting = usePcPower() === "booting";
  const target = lookFor(flow);
  const [look, setLook] = useState<TutorialLook>(() =>
    tutorialStore.getState().completed ? COMPLETED_LOOK : HIDDEN_LOOK,
  );
  const lookRef = useRef(look);
  lookRef.current = look;

  useEffect(() => {
    if (flow.status === "idle") {
      return;
    }
    const timers = [setTimeout(() => setLook(target), STEP_GAP_MS)];
    if (reveals(lookRef.current, target)) {
      timers.push(
        setTimeout(
          () => cameraGlitch.pulse(GLITCH_MS),
          STEP_GAP_MS - GLITCH_LEAD_MS,
        ),
      );
    }
    setLook((prev) => (prev === target ? prev : calmLook(prev)));
    return () => {
      for (const timer of timers) {
        clearTimeout(timer);
      }
    };
  }, [flow.status, target]);

  useEffect(() => {
    if (!toggles) {
      return;
    }
    for (const key of TUTORIAL_OBJECT_KEYS) {
      toggles.setVisible(key, look.visible.includes(key));
      toggles.setEnabled(key, look.enabled.includes(key));
      toggles.setHighlighted(
        key,
        look.highlighted.includes(key) && !(key === "pc" && pcBooting),
      );
    }
  }, [toggles, look, pcBooting]);

  return look;
};

/** 終えるまでは PC の電源を落としておき、触ったら起動する。部屋を出たら点けて戻す(試合の PC のため) */
const usePcBoot = (flow: Flow): void => {
  useEffect(() => {
    if (flow.status === "completed") {
      pcPower.turnOn();
    } else if (!tutorialStore.getState().completed) {
      pcPower.turnOff();
    }
  }, [flow.status]);

  useEffect(
    () =>
      pcSession.subscribe(() => {
        const {phase, objectId} = pcSession.getState();
        if (phase === "active" && objectId === ROOM_LAYOUT.pc?.id) {
          pcPower.boot(BOOT_MS);
        }
      }),
    [],
  );

  useEffect(() => () => pcPower.turnOn(), []);
};

const giveUneditedFile = () =>
  authorityRegistry.current()?.dev?.setHeldItem({
    id: crypto.randomUUID(),
    kind: FILE_KIND,
    data: {status: "unedited", color: TUTORIAL_FILE_COLOR},
  });
