import type { ReactNode } from 'react';

interface NumberFieldProps {
  label: string;
  value: number;
  onChange: (v: number) => void;
  step?: number;
  suffix?: string;
  hint?: string;
  className?: string;
}

export function NumberField({ label, value, onChange, step = 1, suffix, hint, className }: NumberFieldProps) {
  return (
    <label className={className ? `field ${className}` : 'field'}>
      <span className="field-label">{label}</span>
      <span className="field-input">
        <input
          type="number"
          value={Number.isFinite(value) ? value : 0}
          step={step}
          onChange={(e) => onChange(e.target.value === '' ? 0 : Number(e.target.value))}
        />
        {suffix && <span className="suffix">{suffix}</span>}
      </span>
      {hint && <small className="hint">{hint}</small>}
    </label>
  );
}

/** Procentfält: visar procent men lagrar andel (0.03 = 3 %). */
export function PercentField({ label, value, onChange, hint }: Omit<NumberFieldProps, 'step' | 'suffix' | 'className'>) {
  return (
    <NumberField
      label={label}
      value={Math.round(value * 10000) / 100}
      onChange={(v) => onChange(v / 100)}
      step={0.1}
      suffix="%"
      hint={hint}
    />
  );
}

export function CheckField({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="check">
      <input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

export function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="card">
      <h2>{title}</h2>
      {children}
    </section>
  );
}

export function Row({ label, value, strong }: { label: string; value: ReactNode; strong?: boolean }) {
  return (
    <div className={strong ? 'row strong' : 'row'}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}

/** Hjälpare för att uppdatera ett fält i ett state-objekt. */
export function setter<T>(state: T, set: (s: T) => void) {
  return <K extends keyof T>(key: K) =>
    (v: T[K]) =>
      set({ ...state, [key]: v });
}
