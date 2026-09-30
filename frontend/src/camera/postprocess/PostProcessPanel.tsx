import type { CSSProperties, ReactNode } from "react";
import { useDebugFlags } from "../../core/debug/flags";
import {
  resetPostProcessSettings,
  TONE_MAPPING_KINDS,
  type ToneMappingKind,
  updatePostProcessSettings,
  usePostProcessSettings,
  VIGNETTE_MIN_SMOOTHNESS,
} from "./settings";

// パネルは Canvas の外の DOM なので、クリックが canvas(pointer lock の要求元)へ伝わらない。
// pointer lock 中はカーソルが出ないため、操作するには Esc で解除してから使う
const panelStyle: CSSProperties = {
  position: "fixed",
  top: 0,
  right: 0,
  maxHeight: "100vh",
  overflowY: "auto",
  boxSizing: "border-box",
  width: 280,
  padding: "6px 8px",
  font: "11px/1.5 ui-monospace, Menlo, monospace",
  color: "#fff",
  background: "rgba(0,0,0,0.75)",
  zIndex: 10001,
};
const rowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  minHeight: 20,
};
const headingStyle: CSSProperties = {
  margin: "8px 0 2px",
  borderBottom: "1px solid rgba(255,255,255,0.3)",
  fontWeight: "bold",
};

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <>
      <div style={headingStyle}>{title}</div>
      {children}
    </>
  );
}

function Check({
  label,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label style={{ ...rowStyle, opacity: disabled ? 0.4 : 1 }}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      {label}
    </label>
  );
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  disabled,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  disabled?: boolean;
  onChange: (v: number) => void;
}) {
  return (
    <label style={{ ...rowStyle, opacity: disabled ? 0.4 : 1 }}>
      <span style={{ width: 84 }}>{label}</span>
      <input
        type="range"
        style={{ flex: 1, minWidth: 0 }}
        value={value}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        onChange={(e) => onChange(e.target.valueAsNumber)}
      />
      <span style={{ width: 38, textAlign: "right" }}>
        {value.toFixed(step < 1 ? 2 : 0)}
      </span>
    </label>
  );
}

/** F9 で開くポストプロセス調整パネル(VITE_ENABLE_DEBUG=true のときのみ)。設定 store を直接書き換える */
export function PostProcessPanel() {
  const { postfx } = useDebugFlags();
  const s = usePostProcessSettings();
  if (!postfx) return null;

  const set = updatePostProcessSettings;
  return (
    <div style={panelStyle}>
      <Check
        label="Post-processing"
        checked={s.enabled}
        onChange={(enabled) => set({ enabled })}
      />
      <Section title="Output">
        <Slider
          label="exposure"
          value={s.exposure}
          min={0.1}
          max={4}
          step={0.05}
          onChange={(exposure) => set({ exposure })}
        />
        <label style={rowStyle}>
          <span style={{ width: 84 }}>tone map</span>
          <select
            value={s.toneMapping}
            onChange={(e) =>
              set({ toneMapping: e.target.value as ToneMappingKind })
            }
          >
            {TONE_MAPPING_KINDS.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
        </label>
      </Section>
      <Section title="AO">
        {/* ベイク AO と GTAO の分担は prop ごとの AO モード(src/bake/aoMode.ts)。show AO only は合成後の AO。
            baked を外すと aoMap ごと外れ、baked モードの面も GTAO に戻る */}
        <Check
          label="show AO only"
          checked={s.ao.showOnly}
          onChange={(showOnly) => set({ ao: { showOnly } })}
        />
        <Check
          label="baked"
          checked={s.bakedAO.enabled}
          onChange={(enabled) => set({ bakedAO: { enabled } })}
        />
        <Slider
          label="baked str."
          value={s.bakedAO.intensity}
          min={0}
          max={1}
          step={0.05}
          disabled={!s.bakedAO.enabled}
          onChange={(intensity) => set({ bakedAO: { intensity } })}
        />
        <Check
          label="GTAO"
          checked={s.ao.enabled}
          onChange={(enabled) => set({ ao: { enabled } })}
        />
        <Check
          label="denoise"
          checked={s.ao.denoise}
          disabled={!s.ao.enabled}
          onChange={(denoise) => set({ ao: { denoise } })}
        />
        <Slider
          label="radius"
          value={s.ao.radius}
          min={0.05}
          max={3}
          step={0.05}
          onChange={(radius) => set({ ao: { radius } })}
        />
        <Slider
          label="scale"
          value={s.ao.scale}
          min={0}
          max={3}
          step={0.05}
          onChange={(scale) => set({ ao: { scale } })}
        />
        <Slider
          label="thickness"
          value={s.ao.thickness}
          min={0.05}
          max={5}
          step={0.05}
          onChange={(thickness) => set({ ao: { thickness } })}
        />
        <Slider
          label="samples"
          value={s.ao.samples}
          min={4}
          max={32}
          step={1}
          onChange={(samples) => set({ ao: { samples } })}
        />
        <Slider
          label="resolution"
          value={s.ao.resolutionScale}
          min={0.25}
          max={1}
          step={0.05}
          onChange={(resolutionScale) => set({ ao: { resolutionScale } })}
        />
      </Section>
      <Section title="Bloom">
        <Check
          label="enabled"
          checked={s.bloom.enabled}
          onChange={(enabled) => set({ bloom: { enabled } })}
        />
        <Slider
          label="strength"
          value={s.bloom.strength}
          min={0}
          max={3}
          step={0.05}
          onChange={(strength) => set({ bloom: { strength } })}
        />
        <Slider
          label="radius"
          value={s.bloom.radius}
          min={0}
          max={1}
          step={0.01}
          onChange={(radius) => set({ bloom: { radius } })}
        />
        <Slider
          label="threshold"
          value={s.bloom.threshold}
          min={0}
          max={4}
          step={0.05}
          onChange={(threshold) => set({ bloom: { threshold } })}
        />
      </Section>
      <Section title="Pixelate">
        <Check
          label="enabled"
          checked={s.pixelate.enabled}
          onChange={(enabled) => set({ pixelate: { enabled } })}
        />
        <Slider
          label="pixel size"
          value={s.pixelate.pixelSize}
          min={1}
          max={32}
          step={1}
          onChange={(pixelSize) => set({ pixelate: { pixelSize } })}
        />
      </Section>
      <Section title="Vignette">
        <Check
          label="enabled"
          checked={s.vignette.enabled}
          onChange={(enabled) => set({ vignette: { enabled } })}
        />
        <Slider
          label="intensity"
          value={s.vignette.intensity}
          min={0}
          max={1}
          step={0.01}
          onChange={(intensity) => set({ vignette: { intensity } })}
        />
        <Slider
          label="smoothness"
          value={s.vignette.smoothness}
          min={VIGNETTE_MIN_SMOOTHNESS}
          max={1}
          step={0.01}
          onChange={(smoothness) => set({ vignette: { smoothness } })}
        />
      </Section>
      <button
        type="button"
        style={{ marginTop: 8 }}
        onClick={resetPostProcessSettings}
      >
        Reset
      </button>
    </div>
  );
}
