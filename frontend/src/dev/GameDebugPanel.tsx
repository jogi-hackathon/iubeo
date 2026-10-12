import {type CSSProperties, Fragment, useSyncExternalStore} from "react";

import {authorityRegistry} from "../authority/registry";
import {useTeamState} from "../authority/team";
import {mutedStyle, rowStyle} from "../core/debug/ui";
import type {JsonValue} from "../core/json";
import {
  beginElimination,
  resetSpectate,
  useSpectatePhase,
} from "../core/spectate";
import {useItemState} from "../items";
import type {Team} from "../net/types";
import {objectManager, useObjectsState} from "../objects";
import {DIRECTORY_KIND, parseDirectoryData} from "../objects/directory/data";
import type {SceneLayout} from "../objects/layout";
import {getSkybox} from "../scenes/environment/skybox";
import {sceneLayouts} from "../scenes/layouts";
import {TEST_SPARE_IDS} from "../scenes/TestScene/layout";
import {useSceneState} from "../scenes/useScene";
import {type LocalDevOps, getLocalDevOps} from "./localDevOps";

const headStyle: CSSProperties = {...mutedStyle, marginTop: 6};

let lastRejected = "";
const rejectedListeners = new Set<() => void>();
objectManager.on("interactRejected", ({objectId, reason}) => {
  lastRejected = `${objectId}: ${reason}`;
  for (const l of rejectedListeners) {
    l();
  }
});
const subscribeRejected = (l: () => void) => {
  rejectedListeners.add(l);
  return () => rejectedListeners.delete(l);
};

export function GameDebugPanel() {
  const {objects} = useObjectsState();
  const {held} = useItemState();
  const {current: sceneName} = useSceneState();
  const rejected = useSyncExternalStore(subscribeRejected, () => lastRejected);
  const spectate = useSpectatePhase();
  const authority = useSyncExternalStore(
    authorityRegistry.subscribe,
    authorityRegistry.current,
  );
  const dev = authority?.dev ? getLocalDevOps() : null;
  const kind = authority ? authority.kind : "none";
  const layout: SceneLayout = sceneLayouts[sceneName];
  const hasSpares = Object.values(layout).some((item) =>
    TEST_SPARE_IDS.includes(item.id),
  );

  return (
    <>
      <div style={headStyle}>authority: {kind}</div>
      <div style={rowStyle}>
        <span style={{flex: 1}}>me: {spectate}</span>
        <button
          type="button"
          disabled={spectate !== "alive"}
          onClick={() => {
            beginElimination();
            getSkybox().flashAnomaly();
          }}
        >
          eliminate
        </button>
        <button
          type="button"
          disabled={spectate === "alive"}
          onClick={resetSpectate}
        >
          revive
        </button>
      </div>
      {hasSpares && (
        <div style={rowStyle}>
          {(["personal", "shared"] as const).map((scope) => (
            <button
              key={scope}
              type="button"
              disabled={!dev}
              onClick={() => {
                if (dev?.spawnSpareObject(scope) === undefined) {
                  console.warn(
                    "[debug] 予備のダミー(dummy-4〜8)はすべて置かれています",
                  );
                }
              }}
            >
              spawn {scope}
            </button>
          ))}
        </div>
      )}
      {objects.length === 0 && <div style={{marginTop: 4}}>(none)</div>}
      {objects.map((o) => (
        <Fragment key={o.id}>
          <div style={rowStyle}>
            <span style={{flex: 1}}>
              {o.id} [{o.scope}] {o.availability} users:{o.users.length}
            </span>
            <button type="button" onClick={() => objectManager.interact(o.id)}>
              interact
            </button>
            <button
              type="button"
              disabled={!dev}
              onClick={() =>
                dev?.setAvailability(
                  o.id,
                  o.availability === "available" ? "unavailable" : "available",
                )
              }
            >
              {o.availability === "available" ? "lock" : "unlock"}
            </button>
            <button
              type="button"
              disabled={!dev}
              onClick={() => dev?.removeObject(o.id)}
            >
              remove
            </button>
          </div>
          {o.kind === DIRECTORY_KIND && (
            <DirectoryRow id={o.id} data={o.data} dev={dev} />
          )}
        </Fragment>
      ))}
      <div style={{marginTop: 4}}>last rejected: {rejected || "-"}</div>
      <TeamRows dev={dev} />
      <div style={headStyle}>items</div>
      <div style={rowStyle}>
        <span style={{flex: 1}}>held: {held ? held.id : "(none)"}</span>
        <button type="button" disabled={!dev} onClick={() => dev?.spawnItem()}>
          spawn item
        </button>
        <button
          type="button"
          disabled={!dev || !held}
          onClick={() => dev?.deleteHeldItem()}
        >
          delete
        </button>
      </div>
      <div style={rowStyle}>
        <button
          type="button"
          disabled={!dev}
          onClick={() => dev?.spawnNewFile()}
        >
          new file
        </button>
        <button
          type="button"
          disabled={!dev}
          onClick={() => dev?.editHeldFile()}
        >
          edit held file
        </button>
      </div>
    </>
  );
}

function DirectoryRow({
  id,
  data,
  dev,
}: {
  id: string;
  data: JsonValue;
  dev: LocalDevOps | null;
}) {
  const {stock, outputs} = parseDirectoryData(data);
  return (
    <div style={rowStyle}>
      <span style={{flex: 1}}>
        stock:{stock.length} outputs:{outputs} achieved:
        {dev?.getAchieved() ?? "-"} borrowed:
        {dev?.getBorrowedCount() ?? "-"}
      </span>
      <button
        type="button"
        disabled={!dev}
        onClick={() => dev?.borrowAsOther(id)}
      >
        other borrows
      </button>
      <button
        type="button"
        disabled={!dev}
        onClick={() => dev?.returnAsOther(id)}
      >
        other returns
      </button>
    </div>
  );
}

const TEAM_FLAGS: readonly (keyof Team)[] = ["bypassPermission", "fireStarted"];
function TeamRows({dev}: {dev: LocalDevOps | null}) {
  const team = useTeamState();
  return (
    <>
      <div style={headStyle}>team(勝利フラグ)</div>
      {TEAM_FLAGS.map((flag) => (
        <div key={flag} style={rowStyle}>
          <span style={{flex: 1}}>
            {flag}: {String(team[flag])}
          </span>
          <button
            type="button"
            disabled={!dev}
            onClick={() => dev?.toggleTeamFlag(flag)}
          >
            toggle
          </button>
        </div>
      ))}
    </>
  );
}
