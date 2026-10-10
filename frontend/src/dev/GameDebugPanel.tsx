import {
  type CSSProperties,
  Fragment,
  useEffect,
  useState,
  useSyncExternalStore,
} from "react";

import {authorityRegistry} from "../authority/registry";
import {useTeamState} from "../authority/team";
import {useDebugFlags} from "../core/debug/flags";
import type {JsonValue} from "../core/json";
import {useItemState} from "../items";
import type {Team} from "../net/types";
import {objectManager, useObjectsState} from "../objects";
import {DIRECTORY_KIND, parseDirectoryData} from "../objects/directory/data";
import type {SceneLayout} from "../objects/layout";
import {sceneLayouts} from "../scenes/layouts";
import {TEST_SPARE_IDS} from "../scenes/TestScene/layout";
import {useSceneState} from "../scenes/useScene";
import {type LocalDevOps, getLocalDevOps} from "./localDevOps";

// パネルは Canvas の外の DOM なので、操作するには Esc で pointer lock を解除してから使う。
// SceneDebugPanel(左上)・PostProcessPanel(右上)と重ならないよう左下に置く
const panelStyle: CSSProperties = {
  position: "fixed",
  bottom: 0,
  left: 0,
  boxSizing: "border-box",
  width: 360,
  padding: "6px 8px",
  font: "11px/1.5 ui-monospace, Menlo, monospace",
  color: "#fff",
  background: "rgba(0,0,0,0.75)",
  zIndex: 10001,
};
const rowStyle: CSSProperties = {display: "flex", gap: 6, marginTop: 4};
const headStyle: CSSProperties = {marginTop: 6, opacity: 0.7};

/**
 * Shift+F10 で開くオブジェクト・アイテム管理パネル(VITE_ENABLE_DEBUG=true のときのみ)。
 * 今の窓口(local / server / none)を表示する。開発用の操作(置く・外す・手持ち)は、窓口が dev を持つときだけ使える
 * (ローカルのオーソリティが無ければ、押せないように無効にする)。interact だけは、実際のゲームと同じく objectManager から要求を送る
 */
export function GameDebugPanel() {
  const {game} = useDebugFlags();
  const {objects} = useObjectsState();
  const {held} = useItemState();
  const {current: sceneName} = useSceneState();
  const [rejected, setRejected] = useState("");
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

  useEffect(
    () =>
      objectManager.on("interactRejected", ({objectId, reason}) =>
        setRejected(`${objectId}: ${reason}`),
      ),
    [],
  );

  if (!game) {
    return null;
  }

  return (
    <div style={panelStyle}>
      <div style={headStyle}>authority: {kind}</div>
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
    </div>
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
/**
 * 勝利フラグ(team)の今の値と切り替え。値は teamStore(サーバーの値も入る)から読む。
 * 切り替えはローカルのオーソリティでだけ使える(サーバーの値は変えない)。bypassPermission を立てると、ライターの置き場が使えるようになる
 */
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
