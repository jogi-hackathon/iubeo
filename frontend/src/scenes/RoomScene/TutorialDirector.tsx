import {useFrame} from "@react-three/fiber";
import {useEffect, useRef, useState} from "react";

import {authorityRegistry} from "../../authority/registry";
import {cameraGlitch} from "../../camera/postprocess";
import {useToggles} from "../../core/toggles";
import {FILE_KIND, itemManager, parseFileData} from "../../items";
import {localPlayer} from "../../player/local";
import {
  pcLogo,
  startTutorialPresenceHeartbeat,
  tutorialManager,
  tutorialStore,
  useTutorial,
  useTutorialFlow,
} from "../../tutorial";
import {TUTORIAL_FILE_COLOR, TutorialFile} from "./TutorialFile";
import {
  calmLook,
  COMPLETED_LOOK,
  HIDDEN_LOOK,
  lookFor,
  reveals,
  type TutorialLook,
  TUTORIAL_OBJECT_KEYS,
} from "./tutorialLook";
import {zonesAt} from "./tutorialZones";

const LOGO_MS = 5000;
const STEP_GAP_MS = 600;
const GLITCH_MS = 450;
const GLITCH_LEAD_MS = 110;

const heldFileStatus = () => {
  const held = itemManager.getHeld();
  if (held?.kind !== FILE_KIND) {
    return null;
  }
  return parseFileData(held.data)?.status ?? null;
};

const giveUneditedFile = () =>
  authorityRegistry.current()?.dev?.setHeldItem({
    id: crypto.randomUUID(),
    kind: FILE_KIND,
    data: {status: "unedited", color: TUTORIAL_FILE_COLOR},
  });

export function TutorialDirector() {
  const toggles = useToggles();
  const {completed} = useTutorial();
  const flow = useTutorialFlow();
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
  const previousStatus = useRef(flow.status);

  useEffect(() => {
    if (previousStatus.current === "running" && flow.status === "completed") {
      pcLogo.show(LOGO_MS);
    }
    previousStatus.current = flow.status;
  }, [flow.status]);

  useEffect(() => () => pcLogo.hide(), []);

  useEffect(() => {
    tutorialManager.start();
    return () => tutorialManager.abort();
  }, []);

  useEffect(() => {
    if (completed) {
      return;
    }
    return startTutorialPresenceHeartbeat();
  }, [completed]);

  useEffect(() => {
    if (flow.status === "idle") {
      tutorialManager.start();
    }
  }, [flow.status]);

  useEffect(() => {
    if (!toggles) {
      return;
    }
    for (const key of TUTORIAL_OBJECT_KEYS) {
      toggles.setVisible(key, look.visible.includes(key));
      toggles.setEnabled(key, look.enabled.includes(key));
      toggles.setHighlighted(key, look.highlighted.includes(key));
    }
  }, [toggles, look]);

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

  return look.pickupFile ? <TutorialFile onTake={giveUneditedFile} /> : null;
}
