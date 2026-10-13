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
import {linkPcBoot} from "./pcBoot";
import type {TutorialEvent} from "./steps";
import {TUTORIAL_FILE_COLOR, TutorialFile} from "./TutorialFile";
import {zonesAt} from "./zones";

const STEP_GAP_MS = 600;
const GLITCH_MS = 450;
const GLITCH_LEAD_MS = 110;

type Flow = TutorialFlowState<TutorialEvent>;

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

  useFrame(() => {
    const {x, z} = localPlayer.position;
    for (const zone of zonesAt(x, z)) {
      tutorialManager.signal({type: "zone", zone});
    }
  });
};

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

const usePcBoot = (flow: Flow): void => {
  const link = useRef<ReturnType<typeof linkPcBoot> | null>(null);
  useEffect(() => {
    const linked = linkPcBoot({
      power: pcPower,
      session: pcSession,
      pcId: ROOM_LAYOUT.pc?.id,
      bootMs: BOOT_MS,
      completed: () => tutorialStore.getState().completed,
      onBooted: () => tutorialManager.signal({type: "pcBooted"}),
    });
    link.current = linked;
    return () => {
      link.current = null;
      linked.dispose();
    };
  }, []);

  useEffect(() => {
    link.current?.sync(flow.status);
  }, [flow.status]);
};

const giveUneditedFile = () =>
  authorityRegistry.current()?.dev?.setHeldItem({
    id: crypto.randomUUID(),
    kind: FILE_KIND,
    data: {status: "unedited", color: TUTORIAL_FILE_COLOR},
  });
