import {type RefObject, useEffect, useRef} from "react";

const PREVENT = new Set([
  "Space",
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
]);

const EDITABLE_TAGS = new Set(["INPUT", "SELECT", "TEXTAREA"]);

export const isEditableTarget = (target: EventTarget | null): boolean => {
  const el = target as {tagName?: string; isContentEditable?: boolean} | null;
  return (
    el !== null &&
    (EDITABLE_TAGS.has(el.tagName ?? "") || el.isContentEditable === true)
  );
};

export function useKeys(): RefObject<Set<string>> {
  const keys = useRef(new Set<string>());
  useEffect(() => {
    const set = keys.current;
    const down = (e: KeyboardEvent) => {
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
