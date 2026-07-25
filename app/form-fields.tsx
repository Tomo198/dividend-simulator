import type { ReactNode } from "react";

interface NumberFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  suffix?: string;
  help?: string;
  min?: string;
  max?: string;
  step?: string;
  disabled?: boolean;
}

export function NumberField({
  label,
  value,
  onChange,
  suffix,
  help,
  min,
  max,
  step = "any",
  disabled,
}: NumberFieldProps) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      <span className="input-with-suffix">
        <input
          type="number"
          value={value}
          onChange={(event) => onChange(event.currentTarget.value)}
          min={min}
          max={max}
          step={step}
          disabled={disabled}
          inputMode="decimal"
        />
        {suffix && <span>{suffix}</span>}
      </span>
      {help && <small>{help}</small>}
    </label>
  );
}

interface SelectFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
  help?: string;
  disabled?: boolean;
}

export function SelectField({ label, value, onChange, children, help, disabled }: SelectFieldProps) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      <select value={value} onChange={(event) => onChange(event.currentTarget.value)} disabled={disabled}>
        {children}
      </select>
      {help && <small>{help}</small>}
    </label>
  );
}
