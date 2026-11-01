import { useState, type ReactNode } from 'react';
import { formatInput, parseInput } from './lib/format';

interface NumberFieldProps {
  label: string;
  value: number;
  onChange: (v: number) => void;
  step?: number;
  suffix?: string;
  hint?: string;
  className?: string;
  /** Visa utan tusentalsavgränsare, t.ex. för årtal. */
  plain?: boolean;
  /** Fältet kan vara negativt, vilket kräver ett tangentbord med minustecken på mobilen. */
  negative?: boolean;
}

export function NumberField({ label, value, onChange, step = 1, suffix, hint, className, plain, negative }: NumberFieldProps) {
  // Medan man skriver visas texten som den är, så att t.ex. "3," inte skrivs om till "3".
  const [draft, setDraft] = useState<string | null>(null);
  const safe = Number.isFinite(value) ? value : 0;
  return (
    <label className={className ? `field ${className}` : 'field'}>
      <span className="field-label">{label}</span>
      <span className="field-input">
        <input
          type="text"
          inputMode={negative ? 'text' : 'decimal'}
          autoComplete="off"
          value={draft ?? formatInput(safe, !plain)}
          onFocus={(e) => e.target.select()}
          onBlur={() => setDraft(null)}
          onChange={(e) => {
            setDraft(e.target.value);
            const parsed = parseInput(e.target.value);
            if (parsed !== null) onChange(parsed);
          }}
          onKeyDown={(e) => {
            if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
            e.preventDefault();
            setDraft(null);
            const next = safe + (e.key === 'ArrowUp' ? step : -step);
            onChange(Math.round(next * 100) / 100);
          }}
        />
        {suffix && <span className="suffix">{suffix}</span>}
      </span>
      {hint && <small className="hint">{hint}</small>}
    </label>
  );
}

/** Procentfält: visar procent men lagrar andel (0.03 = 3 %). */
export function PercentField({ label, value, onChange, hint, negative }: Omit<NumberFieldProps, 'step' | 'suffix' | 'className' | 'plain'>) {
  return (
    <NumberField
      label={label}
      value={Math.round(value * 10000) / 100}
      onChange={(v) => onChange(v / 100)}
      step={0.1}
      suffix="%"
      hint={hint}
      negative={negative}
    />
  );
}

export function CheckField({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="check">
      <input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
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

/** Indata till vänster och resultat som följer med till höger. */
export function Tool({ result, children }: { result: ReactNode; children: ReactNode }) {
  return (
    <div className="tool">
      <div className="tool-inputs">{children}</div>
      <aside className="tool-result" aria-label="Resultat">{result}</aside>
    </div>
  );
}

/** Hjälpare för att uppdatera ett fält i ett state-objekt. */
export function setter<T>(state: T, set: (s: T) => void) {
  return <K extends keyof T>(key: K) =>
    (v: T[K]) =>
      set({ ...state, [key]: v });
}
