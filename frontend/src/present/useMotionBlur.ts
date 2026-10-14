import {useEffect, useRef} from "react";

import {createFrameGate} from "./frameGate";
import {blurFilterOn, isJump, smoothSpeed, verticalBlur} from "./motionBlur";

export const MOTION_BLUR_ID = "present-motion-blur";

const prefersReducedMotion = (): boolean =>
  typeof matchMedia === "function" &&
  matchMedia("(prefers-reduced-motion: reduce)").matches;

export const useMotionBlur = (enabled: boolean) => {
  const logRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const blurRef = useRef<SVGFEGaussianBlurElement>(null);

  useEffect(() => {
    const log = logRef.current;
    const track = trackRef.current;
    const blur = blurRef.current;
    if (!log || !track || !blur || !enabled || prefersReducedMotion()) {
      return;
    }
    let height = track.getBoundingClientRect().height;
    let last = performance.now();
    let speed = 0;
    let on = false;
    const open = createFrameGate();
    let id = requestAnimationFrame(function loop(now) {
      if (!open(now)) {
        id = requestAnimationFrame(loop);
        return;
      }
      const dt = Math.max(1, now - last);
      last = now;
      const nextHeight = track.getBoundingClientRect().height;
      const logHeight = log.getBoundingClientRect().height;
      const delta = nextHeight - height;
      height = nextHeight;
      speed = smoothSpeed(
        speed,
        isJump(delta, logHeight) ? 0 : Math.abs(delta / dt) * 1000,
        dt,
      );
      const vertical = verticalBlur(speed);
      on = blurFilterOn(on, vertical);
      blur.setAttribute("stdDeviation", `0 ${vertical.toFixed(2)}`);
      log.style.filter = on ? `url(#${MOTION_BLUR_ID})` : "";
      id = requestAnimationFrame(loop);
    });
    return () => {
      cancelAnimationFrame(id);
      log.style.filter = "";
    };
  }, [enabled]);

  return {logRef, trackRef, blurRef};
};
