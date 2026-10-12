import {mutedStyle, Slider} from "../core/debug/ui";
import {
  LOOK_SENSITIVITY,
  setLookSensitivityScale,
  useLookSensitivityScale,
} from "../player";

export function LookSensitivityPanel() {
  const scale = useLookSensitivityScale();
  return (
    <>
      <Slider
        label="look scale"
        value={scale}
        min={0.25}
        max={4}
        step={0.05}
        onChange={(v) => setLookSensitivityScale(Math.round(v * 100) / 100)}
      />
      <div style={mutedStyle}>
        {(LOOK_SENSITIVITY * scale).toFixed(5)} rad/px
      </div>
      <button
        type="button"
        disabled={scale === 1}
        onClick={() => setLookSensitivityScale(1)}
      >
        reset
      </button>
    </>
  );
}
