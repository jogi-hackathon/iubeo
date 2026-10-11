import {useEffect, useState} from "react";

import {itemManager} from "../../items";
import type {SceneLayout} from "../../objects/layout";
import {objectManager} from "../../objects/objectStore";
import type {SceneName} from "../../scenes";
import {markSceneReady} from "../../scenes/sceneReady";
import {applyMessage} from "../apply";
import {authorityRegistry} from "../registry";
import {teamStore} from "../team";
import {
  LOCAL_AUTHORITY_PLAYER_ID,
  type LocalInitial,
  planLocalObjects,
} from "./plan";
import {createLocalRules} from "./rules";

const NO_INITIAL: LocalInitial = {};

export function LocalAuthority({
  scene,
  layout,
  initial = NO_INITIAL,
}: {
  scene: SceneName;
  layout: SceneLayout;
  initial?: LocalInitial;
}) {
  const [placed, setPlaced] = useState(false);

  useEffect(() => {
    const playerId = LOCAL_AUTHORITY_PLAYER_ID;
    const rules = createLocalRules({
      playerId,
      objects: objectManager,
      deliver: (message) =>
        applyMessage(
          {
            objects: objectManager,
            items: itemManager,
            myPlayerId: () => playerId,
            team: teamStore,
          },
          message,
        ),
    });
    rules.dev.setHeldItem(null);
    teamStore.reset();
    for (const object of planLocalObjects({layout, initial, playerId})) {
      rules.dev.deliver({type: "object.upsert", object});
    }
    const off = authorityRegistry.register({
      playerId,
      kind: "local",
      send: rules.handle,
      dev: rules.dev,
    });
    setPlaced(true);
    return () => {
      off();
      rules.dispose();
      rules.release();
      teamStore.reset();
      setPlaced(false);
    };
  }, [layout, initial]);

  useEffect(() => {
    if (placed) {
      markSceneReady(scene);
    }
  }, [placed, scene]);

  return null;
}
