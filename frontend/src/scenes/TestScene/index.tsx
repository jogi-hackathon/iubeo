import {LocalAuthority} from "../../authority/local/LocalAuthority";
import {ManagedObjects} from "../../objects";
import {DummyPlayers} from "./DummyPlayers";
import {TEST_INITIAL} from "./initial";
import {TEST_LAYOUT} from "./layout";
import {TestLayout} from "./TestLayout";

/**
 * 衝突確認用のテストシーン。サーバーにはつながず、ローカルのオーソリティ(LocalAuthority)で動かす。
 * 置く物はレイアウトと初期設定(initial.ts)で決まる
 */
export function TestScene() {
  return (
    <>
      <TestLayout />
      <DummyPlayers />
      <LocalAuthority
        scene="test"
        layout={TEST_LAYOUT}
        initial={TEST_INITIAL}
      />
      <ManagedObjects layout={TEST_LAYOUT} />
    </>
  );
}
