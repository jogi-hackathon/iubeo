import {type RefObject, useEffect, useRef} from "react";

const PREVENT = new Set([
  "Space",
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
]);

const EDITABLE_TAGS = new Set(["INPUT", "SELECT", "TEXTAREA"]);

/** キー入力を受け取る UI(デバッグパネルの input / select など)上のイベントか */
export const isEditableTarget = (target: EventTarget | null): boolean => {
  const el = target as {tagName?: string; isContentEditable?: boolean} | null;
  return (
    el !== null &&
    (EDITABLE_TAGS.has(el.tagName ?? "") || el.isContentEditable === true)
  );
};

/** 押下中の KeyboardEvent.code 集合。再レンダーは起こさないので useFrame 内で読む */
export function useKeys(): RefObject<Set<string>> {
  const keys = useRef(new Set<string>());
  useEffect(() => {
    const set = keys.current;
    const down = (e: KeyboardEvent) => {
      // パネル操作中はゲームの入力として扱わない(矢印キーでのスライダー操作も妨げない)
      if (isEditableTarget(e.target)) {
        return;
      }
      if (PREVENT.has(e.code)) {
        e.preventDefault();
      }
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
