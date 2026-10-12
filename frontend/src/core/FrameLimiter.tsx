import {useThree} from "@react-three/fiber";
import {useEffect} from "react";

import {graphicsStore} from "./graphics";
import {useStore} from "./storage";

export function FrameLimiter() {
  const advance = useThree((s) => s.advance);
  const {fpsLimit} = useStore(graphicsStore);
  useEffect(() => {
    const interval = fpsLimit === null ? 0 : 1000 / fpsLimit;
    let last = performance.now();
    let id = 0;
    advance(last / 1000);
    const tick = (t: number) => {
      id = requestAnimationFrame(tick);
      const elapsed = t - last;
      if (elapsed < interval) {
        return;
      }
      last = interval === 0 ? t : t - (elapsed % interval);
      advance(t / 1000);
    };
    id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
  }, [advance, fpsLimit]);

  return null;
}
