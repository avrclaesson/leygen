import { useState } from 'react';
import { FIELD_LABELS, type ExtractedBrf } from '../lib/brfExtraction';

type State =
  | { kind: 'idle' }
  | { kind: 'loading'; fileName: string }
  | { kind: 'error'; message: string }
  | { kind: 'done'; data: ExtractedBrf };

const SEVERITY_ICON = { info: 'ℹ️', warning: '⚠️', critical: '🛑' } as const;

export function ArsredovisningUpload({ onExtracted }: { onExtracted: (data: ExtractedBrf) => void }) {
  const [state, setState] = useState<State>({ kind: 'idle' });

  async function upload(file: File) {
    if (file.type !== 'application/pdf') {
      setState({ kind: 'error', message: 'Välj en PDF-fil.' });
      return;
    }
    setState({ kind: 'loading', fileName: file.name });
    try {
      const res = await fetch('/api/brf/extract', {
        method: 'POST',
        headers: { 'content-type': 'application/pdf' },
        body: file,
      });
      const body = await res.json().catch(() => ({ error: `Servern svarade ${res.status}.` }));
      if (!res.ok) throw new Error(body.error ?? `Servern svarade ${res.status}.`);
      setState({ kind: 'done', data: body as ExtractedBrf });
      onExtracted(body as ExtractedBrf);
    } catch (err) {
      setState({ kind: 'error', message: err instanceof Error ? err.message : String(err) });
    }
  }

  return (
    <div className="upload">
      <label className={`dropzone ${state.kind === 'loading' ? 'disabled' : ''}`}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const f = e.dataTransfer.files[0];
          if (f && state.kind !== 'loading') void upload(f);
        }}
      >
        <input
          type="file"
          accept="application/pdf"
          disabled={state.kind === 'loading'}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void upload(f);
            e.target.value = '';
          }}
        />
        {state.kind === 'loading' ? (
          <span>
            <span className="spinner" /> Läser {state.fileName} … det tar oftast 30–90 sekunder.
          </span>
        ) : (
          <span>
            📄 <strong>Ladda upp årsredovisningen (PDF)</strong> – nyckeltalen fylls i automatiskt.
            <br />
            <small className="hint">Släpp filen här eller klicka för att välja. Dokumentet skickas till Claude (Anthropic) för analys.</small>
          </span>
        )}
      </label>

      {state.kind === 'error' && <p className="bad">{state.message}</p>}

      {state.kind === 'done' && <ExtractionSummary data={state.data} />}
    </div>
  );
}

function ExtractionSummary({ data }: { data: ExtractedBrf }) {
  const r = data.reportedKeyFigures;
  const reported = [
    ['Skuldsättning/kvm', r.debtPerSqm, 'kr'],
    ['Sparande/kvm', r.savingsPerSqm, 'kr'],
    ['Årsavgift/kvm', r.feePerSqm, 'kr'],
    ['Räntekänslighet', r.interestSensitivityPercent, '%'],
  ] as const;
  return (
    <div className="extraction">
      <p>
        <strong>{data.associationName ?? 'Okänd förening'}</strong>
        {data.orgNumber && ` (${data.orgNumber})`}
        {data.fiscalYear && ` – räkenskapsår ${data.fiscalYear}`}
      </p>
      <ul className="facts">
        {data.averageInterestRate !== null && (
          <li>Genomsnittlig ränta på lånen: {(data.averageInterestRate * 100).toLocaleString('sv-SE', { maximumFractionDigits: 2 })} %</li>
        )}
        {data.debtMaturingWithin12Months !== null && (
          <li>Lån som ska omförhandlas inom 12 mån: {Math.round(data.debtMaturingWithin12Months).toLocaleString('sv-SE')} kr</li>
        )}
        {data.apartmentCount !== null && <li>Antal bostadsrätter: {data.apartmentCount}</li>}
        {data.plannedFeeChange && <li>Avgiftsändring: {data.plannedFeeChange}</li>}
        {reported.some(([, v]) => v !== null) && (
          <li>
            Föreningens egna nyckeltal:{' '}
            {reported
              .filter(([, v]) => v !== null)
              .map(([label, v, unit]) => `${label} ${v!.toLocaleString('sv-SE')} ${unit}`)
              .join(' · ')}
          </li>
        )}
      </ul>
      {data.findings.length > 0 && (
        <>
          <h3>Att känna till</h3>
          <ul className="warnings">
            {data.findings.map((f, i) => (
              <li key={i} className={`finding ${f.severity}`}>
                {SEVERITY_ICON[f.severity]} {f.text}
              </li>
            ))}
          </ul>
        </>
      )}
      {data.uncertainFields.length > 0 && (
        <p className="hint">Osäkra/tolkade värden – kontrollera mot dokumentet: {data.uncertainFields.map((k) => FIELD_LABELS[k] ?? k).join(', ')}.</p>
      )}
    </div>
  );
}
