import { type RefObject, useEffect, useRef } from "react";

const PREVENT = new Set([
  "Space",
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
]);

/** 押下中の KeyboardEvent.code 集合。再レンダーは起こさないので useFrame 内で読む */
export function useKeys(): RefObject<Set<string>> {
  const keys = useRef(new Set<string>());
  useEffect(() => {
    const set = keys.current;
    const down = (e: KeyboardEvent) => {
      if (PREVENT.has(e.code)) e.preventDefault();
      set.add(e.code);
    };
    const up = (e: KeyboardEvent) => set.delete(e.code);
    const clear = () => set.clear();
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", clear);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", clear);
      set.clear();
    };
  }, []);
  return keys;
}
