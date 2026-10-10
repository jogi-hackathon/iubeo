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

/**
 * ローカルのオーソリティ(実サーバーができるまでの、この端末の中の窓口)。シーンの中に置くと、
 * マウントで、レイアウトと初期設定から物を置き(planLocalObjects)、窓口として登録する。
 * 置いた物は、規則の通知(deliver → apply)で反映する。
 * 準備の報告: 置き終えた commit の後に markSceneReady(scene) する(シーンの準備は、この物が置かれたことで決まる)。
 * アンマウント(シーンを離れる)で、窓口を外し、アニメーション待ちを取り消し、規則が置いた物と手持ちを片付ける。
 * 置き直しはシーンの切り替えで起きる(前のシーンのアンマウントが先、次のシーンのマウントが後)
 */
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
    // 手は空でマウントする(前のシーンの手持ちが残っていても、規則の手持ちと揃える)
    rules.dev.setHeldItem(null);
    // 勝利フラグも最初の値から(規則の最初の値と揃える)
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

  // 置き終えた commit の後に報告する(マウントの effect で置いた物が、この時点で反映されている)
  useEffect(() => {
    if (placed) {
      markSceneReady(scene);
    }
  }, [placed, scene]);

  return null;
}
