import {ManagedObjects} from "../../objects";
import {DummyPlayers} from "./DummyPlayers";
import {TestLayout} from "./TestLayout";

/** 衝突確認用のテストシーン。サーバーにはつながず、ダミーのサーバー役で動かす(サーバー役が置くオブジェクトは ManagedObjects が描く) */
export function TestScene() {
  return (
    <>
      <TestLayout />
      <DummyPlayers />
      <ManagedObjects />
    </>
  );
}
