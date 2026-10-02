import {type CSSProperties, Fragment, useEffect, useState} from "react";

import {useDebugFlags} from "../core/debug/flags";
import type {JsonValue} from "../core/json";
import {useItemState} from "../items";
import {objectManager, useObjectsState} from "../objects";
import {DIRECTORY_KIND, parseDirectoryData} from "../objects/directory/data";
import {dummyAuthority} from "./authority";

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
 * 操作はダミーのサーバー役を通す。interact だけは、実際のゲームと同じく objectManager から要求を送る
 */
export function GameDebugPanel() {
  const {game} = useDebugFlags();
  const {objects} = useObjectsState();
  const {held} = useItemState();
  const [rejected, setRejected] = useState("");

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
      <div style={headStyle}>objects</div>
      <div style={rowStyle}>
        {(["personal", "shared"] as const).map((scope) => (
          <button
            key={scope}
            type="button"
            onClick={() =>
              // 続けて置いても重ならないよう、x をずらして並べる
              dummyAuthority.spawnObject(
                [((objects.length % 5) - 2) * 0.8, 1.5, -7],
                scope,
              )
            }
          >
            spawn {scope}
          </button>
        ))}
      </div>
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
              onClick={() =>
                dummyAuthority.setAvailability(
                  o.id,
                  o.availability === "available" ? "unavailable" : "available",
                )
              }
            >
              {o.availability === "available" ? "lock" : "unlock"}
            </button>
            <button
              type="button"
              onClick={() => dummyAuthority.removeObject(o.id)}
            >
              remove
            </button>
          </div>
          {o.kind === DIRECTORY_KIND && (
            <DirectoryRow id={o.id} data={o.data} />
          )}
        </Fragment>
      ))}
      <div style={{marginTop: 4}}>last rejected: {rejected || "-"}</div>
      <div style={headStyle}>items</div>
      <div style={rowStyle}>
        <span style={{flex: 1}}>held: {held ? held.id : "(none)"}</span>
        <button type="button" onClick={() => dummyAuthority.spawnItem()}>
          spawn item
        </button>
        <button
          type="button"
          disabled={!held}
          onClick={() => dummyAuthority.deleteHeldItem()}
        >
          delete
        </button>
      </div>
      <div style={rowStyle}>
        <button type="button" onClick={() => dummyAuthority.spawnNewFile()}>
          new file
        </button>
        <button type="button" onClick={() => dummyAuthority.editHeldFile()}>
          edit held file
        </button>
      </div>
    </div>
  );
}

/** ディレクトリの在庫・成果物・達成の数と、他のプレイヤーとしての貸し借り */
function DirectoryRow({id, data}: {id: string; data: JsonValue}) {
  const {stock, outputs} = parseDirectoryData(data);
  return (
    <div style={rowStyle}>
      <span style={{flex: 1}}>
        stock:{stock.length} outputs:{outputs} achieved:
        {dummyAuthority.getAchieved()} borrowed:
        {dummyAuthority.getBorrowedCount()}
      </span>
      <button type="button" onClick={() => dummyAuthority.borrowAsOther(id)}>
        other borrows
      </button>
      <button type="button" onClick={() => dummyAuthority.returnAsOther(id)}>
        other returns
      </button>
    </div>
  );
}
