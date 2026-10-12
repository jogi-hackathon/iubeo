import {useFrame} from "@react-three/fiber";
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
      if (e.code === "KeyM") {
        voiceEngine.toggleMute();
      }
    };
    window.addEventListener("pointerdown", unlock);
    window.addEventListener("keydown", down);
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", down);
    };
  }, []);

  useFrame(() => voiceEngine.updateFrame(performance.now()));

  return null;
}
