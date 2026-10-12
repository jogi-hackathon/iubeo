import {useSyncExternalStore} from "react";

import {sfxEngine, subscribeTrim} from "../audio/sfx/engine";
import {RECIPES} from "../audio/sfx/recipes";
import type {SfxId, WritingCue} from "../audio/sfx/types";
import {controlStyle, rowStyle, Slider} from "./ui";

const SUSTAINED: readonly SfxId[] = ["pcFan", "window", "corrupt"];

const DEMO_CUE: WritingCue = {
  beats: Array.from({length: 8}, (_, i) => ({at: i * 0.12, line: 0, x: i / 8})),
  lines: [{height: 1, shaded: false}],
  startIn: 0,
};

const ids = (): SfxId[] => Object.keys(RECIPES) as SfxId[];

const play = (id: SfxId) => {
  if (id === "writing") {
    sfxEngine.them("writing", DEMO_CUE);
  } else {
    (sfxEngine.them as (id: SfxId) => void)(id);
  }
};

function SfxRow({id}: {id: SfxId}) {
  const trim = useSyncExternalStore(subscribeTrim, () => sfxEngine.trim(id));
  return (
    <div style={{marginBottom: 4}}>
      <div style={{...controlStyle, justifyContent: "space-between"}}>
        <span>{id}</span>
        <span style={rowStyle}>
          <button type="button" onClick={() => play(id)}>
            鳴らす
          </button>
          {SUSTAINED.includes(id) && (
            <button type="button" onClick={() => sfxEngine.stopThem(id)}>
              止める
            </button>
          )}
        </span>
      </div>
      <Slider
        label="trim dB"
        value={trim}
        min={-30}
        max={12}
        step={1}
        onChange={(v) => sfxEngine.setTrim(id, v)}
      />
    </div>
  );
}

export function SfxTab() {
  return (
    <>
      {ids().map((id) => (
        <SfxRow key={id} id={id} />
      ))}
    </>
  );
}
