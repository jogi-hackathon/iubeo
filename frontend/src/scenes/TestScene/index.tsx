import {DummyPlayers} from "./DummyPlayers";
import {TestLayout} from "./TestLayout";

/** 衝突確認用のテストシーン。サーバーにはつながず、ダミーのサーバー役で動かす */
export function TestScene() {
  return (
    <>
      <TestLayout />
      <DummyPlayers />
    </>
  );
}
