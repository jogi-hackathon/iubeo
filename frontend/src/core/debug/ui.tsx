import type {CSSProperties, ReactNode} from "react";

export const rowStyle: CSSProperties = {display: "flex", gap: 6, marginTop: 4};
export const controlStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  minHeight: 20,
};
export const mutedStyle: CSSProperties = {opacity: 0.7};
const headingStyle: CSSProperties = {
  margin: "8px 0 2px",
  borderBottom: "1px solid rgba(255,255,255,0.3)",
  fontWeight: "bold",
};

export function Section({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <>
      <div style={headingStyle}>{title}</div>
      {children}
    </>
  );
}

export function Check({
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
    <label style={{...controlStyle, opacity: disabled ? 0.4 : 1}}>
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

export function Slider({
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
    <label style={{...controlStyle, opacity: disabled ? 0.4 : 1}}>
      <span style={{width: 84}}>{label}</span>
      <input
        type="range"
        style={{flex: 1, minWidth: 0}}
        value={value}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        onChange={(e) => onChange(e.target.valueAsNumber)}
      />
      <span style={{width: 38, textAlign: "right"}}>
        {value.toFixed(step < 1 ? 2 : 0)}
      </span>
    </label>
  );
}
