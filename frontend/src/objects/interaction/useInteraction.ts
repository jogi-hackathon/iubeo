import {useLayoutEffect, useRef} from "react";

import type {GameObject} from "../types";
import {type InteractionHandler, registerInteractionHandler} from "./handlers";

/**
 * オブジェクトのクライアント側のインタラクトの処理を、マウントで登録し、アンマウントで解除する。
 * 狙いの対象(targets。ObjectRoot の ref で登録)と同じコミットの中で登録する(useLayoutEffect)。
 * 機能 OFF の間も登録は残す(dispatch は狙いの対象からしか来ず、機能 OFF の物は対象から外れるので呼ばれない)。
 * 登録は object.id だけに依存し、handler は ref で最新の物を読むので、毎レンダーで新しい関数を渡しても登録し直さない
 */
export function useInteraction(
  object: GameObject,
  handler: InteractionHandler,
): void {
  const latest = useRef(handler);
  useLayoutEffect(() => {
    latest.current = handler;
  }, [handler]);

  const {id} = object;
  useLayoutEffect(
    () => registerInteractionHandler(id, (o) => latest.current(o)),
    [id],
  );
}
