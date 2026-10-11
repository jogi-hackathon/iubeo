import {useFrame, useThree} from "@react-three/fiber";
import {useEffect} from "react";

import {pcSession} from "../objects/pc/session";
import {voiceEngine} from "./store";

const isTyping = (target: EventTarget | null): boolean =>
  target instanceof HTMLElement &&
  (target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.isContentEditable);

export function VoiceChat({
  sessionId,
  playerId,
}: {
  sessionId: string;
  playerId: string;
}) {
  const camera = useThree((s) => s.camera);

  useEffect(() => {
    void voiceEngine.start(sessionId, playerId);
    return () => voiceEngine.stop();
  }, [sessionId, playerId]);

  useEffect(() => {
    const unlock = () => voiceEngine.unlock();
    const down = (e: KeyboardEvent) => {
      if (
        e.repeat ||
        e.ctrlKey ||
        e.metaKey ||
        e.altKey ||
        isTyping(e.target)
      ) {
        return;
      }
      if (pcSession.getState().phase !== "idle") {
        return;
      }
      if (e.code === "KeyV") {
        voiceEngine.unlock();
        voiceEngine.setPTT(true);
      } else if (e.code === "KeyM") {
        voiceEngine.toggleMute();
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === "KeyV") {
        voiceEngine.setPTT(false);
      }
    };
    const blur = () => voiceEngine.setPTT(false);
    window.addEventListener("pointerdown", unlock);
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
      voiceEngine.setPTT(false);
    };
  }, []);

  useFrame(() => voiceEngine.updateFrame(camera, performance.now()));

  return null;
}
