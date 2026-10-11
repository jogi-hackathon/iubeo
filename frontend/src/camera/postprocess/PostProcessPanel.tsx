import {Check, controlStyle, Section, Slider} from "../../core/debug/ui";
import {
  resetPostProcessSettings,
  TONE_MAPPING_KINDS,
  type ToneMappingKind,
  updatePostProcessSettings,
  usePostProcessSettings,
  VIGNETTE_MIN_SMOOTHNESS,
} from "./settings";

/** dev パネルの PostFX タブ。設定 store を直接書き換える */
export function PostProcessPanel() {
  const s = usePostProcessSettings();
  const set = updatePostProcessSettings;
  return (
    <>
      <Check
        label="Post-processing"
        checked={s.enabled}
        onChange={(enabled) => set({enabled})}
      />
      <Section title="Output">
        <Slider
          label="exposure"
          value={s.exposure}
          min={0.1}
          max={4}
          step={0.05}
          onChange={(exposure) => set({exposure})}
        />
        <label style={controlStyle}>
          <span style={{width: 84}}>tone map</span>
          <select
            value={s.toneMapping}
            onChange={(e) =>
              set({toneMapping: e.target.value as ToneMappingKind})
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
          onChange={(showOnly) => set({ao: {showOnly}})}
        />
        <Check
          label="baked"
          checked={s.bakedAO.enabled}
          onChange={(enabled) => set({bakedAO: {enabled}})}
        />
        <Slider
          label="baked str."
          value={s.bakedAO.intensity}
          min={0}
          max={1}
          step={0.05}
          disabled={!s.bakedAO.enabled}
          onChange={(intensity) => set({bakedAO: {intensity}})}
        />
        <Check
          label="GTAO"
          checked={s.ao.enabled}
          onChange={(enabled) => set({ao: {enabled}})}
        />
        <Check
          label="denoise"
          checked={s.ao.denoise}
          disabled={!s.ao.enabled}
          onChange={(denoise) => set({ao: {denoise}})}
        />
        <Slider
          label="radius"
          value={s.ao.radius}
          min={0.05}
          max={3}
          step={0.05}
          onChange={(radius) => set({ao: {radius}})}
        />
        <Slider
          label="scale"
          value={s.ao.scale}
          min={0}
          max={3}
          step={0.05}
          onChange={(scale) => set({ao: {scale}})}
        />
        <Slider
          label="thickness"
          value={s.ao.thickness}
          min={0.05}
          max={5}
          step={0.05}
          onChange={(thickness) => set({ao: {thickness}})}
        />
        <Slider
          label="samples"
          value={s.ao.samples}
          min={4}
          max={32}
          step={1}
          onChange={(samples) => set({ao: {samples}})}
        />
        <Slider
          label="resolution"
          value={s.ao.resolutionScale}
          min={0.25}
          max={1}
          step={0.05}
          onChange={(resolutionScale) => set({ao: {resolutionScale}})}
        />
      </Section>
      <Section title="Bloom">
        <Check
          label="enabled"
          checked={s.bloom.enabled}
          onChange={(enabled) => set({bloom: {enabled}})}
        />
        <Slider
          label="strength"
          value={s.bloom.strength}
          min={0}
          max={3}
          step={0.05}
          onChange={(strength) => set({bloom: {strength}})}
        />
        <Slider
          label="radius"
          value={s.bloom.radius}
          min={0}
          max={1}
          step={0.01}
          onChange={(radius) => set({bloom: {radius}})}
        />
        <Slider
          label="threshold"
          value={s.bloom.threshold}
          min={0}
          max={4}
          step={0.05}
          onChange={(threshold) => set({bloom: {threshold}})}
        />
      </Section>
      <Section title="Pixelate">
        <Check
          label="enabled"
          checked={s.pixelate.enabled}
          onChange={(enabled) => set({pixelate: {enabled}})}
        />
        <Slider
          label="pixel size"
          value={s.pixelate.pixelSize}
          min={1}
          max={32}
          step={1}
          onChange={(pixelSize) => set({pixelate: {pixelSize}})}
        />
      </Section>
      <Section title="Sky noise">
        <Check
          label="enabled"
          checked={s.skyNoise.enabled}
          onChange={(enabled) => set({skyNoise: {enabled}})}
        />
        <Slider
          label="intensity"
          value={s.skyNoise.intensity}
          min={0}
          max={2}
          step={0.01}
          onChange={(intensity) => set({skyNoise: {intensity}})}
        />
        <Slider
          label="block scale"
          value={s.skyNoise.blockScale}
          min={0.25}
          max={3}
          step={0.05}
          onChange={(blockScale) => set({skyNoise: {blockScale}})}
        />
        <Slider
          label="elev. start"
          value={s.skyNoise.elevationStart}
          min={-30}
          max={89}
          step={1}
          onChange={(elevationStart) => set({skyNoise: {elevationStart}})}
        />
        <Slider
          label="elev. end"
          value={s.skyNoise.elevationEnd}
          min={-29}
          max={90}
          step={1}
          onChange={(elevationEnd) => set({skyNoise: {elevationEnd}})}
        />
        <Slider
          label="update fps"
          value={s.skyNoise.updateRate}
          min={0.5}
          max={30}
          step={0.5}
          onChange={(updateRate) => set({skyNoise: {updateRate}})}
        />
      </Section>
      <Section title="Sea">
        <Check
          label="enabled"
          checked={s.sea.enabled}
          onChange={(enabled) => set({sea: {enabled}})}
        />
        <Slider
          label="crest"
          value={s.sea.crest}
          min={-50}
          max={0}
          step={0.5}
          onChange={(crest) => set({sea: {crest}})}
        />
        <Slider
          label="amplitude"
          value={s.sea.amplitude}
          min={0}
          max={15}
          step={0.1}
          onChange={(amplitude) => set({sea: {amplitude}})}
        />
        <Slider
          label="wavelength"
          value={s.sea.wavelengthScale}
          min={0.25}
          max={4}
          step={0.05}
          onChange={(wavelengthScale) => set({sea: {wavelengthScale}})}
        />
        <Slider
          label="speed"
          value={s.sea.speed}
          min={0}
          max={5}
          step={0.05}
          onChange={(speed) => set({sea: {speed}})}
        />
        <Slider
          label="cell px"
          value={s.sea.cellSize}
          min={4}
          max={24}
          step={1}
          onChange={(cellSize) => set({sea: {cellSize}})}
        />
      </Section>
      <Section title="Vignette">
        <Check
          label="enabled"
          checked={s.vignette.enabled}
          onChange={(enabled) => set({vignette: {enabled}})}
        />
        <Slider
          label="intensity"
          value={s.vignette.intensity}
          min={0}
          max={1}
          step={0.01}
          onChange={(intensity) => set({vignette: {intensity}})}
        />
        <Slider
          label="smoothness"
          value={s.vignette.smoothness}
          min={VIGNETTE_MIN_SMOOTHNESS}
          max={1}
          step={0.01}
          onChange={(smoothness) => set({vignette: {smoothness}})}
        />
      </Section>
      <button
        type="button"
        style={{marginTop: 8}}
        onClick={resetPostProcessSettings}
      >
        Reset
      </button>
    </>
  );
}
