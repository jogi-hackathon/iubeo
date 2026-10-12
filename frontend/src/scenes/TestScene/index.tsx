import {LocalAuthority} from "../../authority/local/LocalAuthority";
import {ManagedObjects} from "../../objects";
import {DummyPlayers} from "./DummyPlayers";
import {TEST_INITIAL} from "./initial";
import {TEST_LAYOUT} from "./layout";
import {TestLayout} from "./TestLayout";

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
