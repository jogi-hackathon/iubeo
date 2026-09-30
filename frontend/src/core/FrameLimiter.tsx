import {useThree} from "@react-three/fiber";
import {useEffect} from "react";

import {useAppContext} from "../boot/context";

/** frameloop="never" の Canvas 内で fpsLimit に合わせて advance を呼ぶ。fpsLimit が null なら何もしない */
export function FrameLimiter() {
  const advance = useThree((s) => s.advance);
  const {settings} = useAppContext();
  useEffect(() => {
    const {fpsLimit} = settings;
    if (fpsLimit === null) {
      return;
    }
    const interval = 1000 / fpsLimit;
    let last = performance.now();
    let id = 0;
    // never モードの clock は advance に渡した値(秒)で進むため、初回に現在時刻で初期化する
    advance(last / 1000);
    const tick = (t: number) => {
      id = requestAnimationFrame(tick);
      const elapsed = t - last;
      if (elapsed < interval) {
        return;
      }
      last = t - (elapsed % interval);
      advance(t / 1000);
    };
    id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
  }, [advance, settings]);

  return null;
}
