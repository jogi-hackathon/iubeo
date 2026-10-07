import {useEffect} from "react";

import {DEBUG_AVAILABLE} from "../../core/debug/flags";
import {RemotePlayers} from "../../player";
import {TestLayout} from "../TestScene/TestLayout";

/**
 * 開発用ローカルマルチのシーン。地形は TestScene と同じ。
 * デバッグが有効(VITE_ENABLE_DEBUG=true)なら、入ったときに同じサーバー(開発時は Vite の proxy の先)へ
 * 自動でつなぎ、実サーバーと同じ経路で動かす。出たら切って、ダミーのサーバー役に戻す
 */
export function MultiplayerTestScene() {
  useEffect(() => {
    if (!DEBUG_AVAILABLE) {
      return;
    }
    let stop: (() => void) | null = null;
    let cancelled = false;
    // dev/ は開発時だけの物なので、動的に読み込む(本番のバンドルに入れない)
    void import("../../dev/multiplayer/session").then(
      ({startDevMultiplayer}) => {
        if (!cancelled) {
          stop = startDevMultiplayer();
        }
      },
    );
    return () => {
      cancelled = true;
      stop?.();
    };
  }, []);

  return (
    <>
      <TestLayout />
      <RemotePlayers />
    </>
  );
}
