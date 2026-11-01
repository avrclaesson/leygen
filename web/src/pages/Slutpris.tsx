import { useEffect, useState } from 'react';
import { Card, NumberField } from '../components';
import { formatKr } from '../lib/format';

const DEMO = import.meta.env.VITE_DEMO === 'true';

interface CitySummary {
  city: string;
  sales: number;
  medianPricePerSqm: number;
}

type TriState = 'yes' | 'no' | 'unknown';
const tri = (v: TriState) => (v === 'unknown' ? null : v === 'yes');

export default function Slutpris() {
  const [form, setForm] = useState({
    address: '',
    city: '',
    saleDate: new Date().toISOString().slice(0, 10),
    price: 0,
    area: 0,
    rooms: 0,
    floor: 0,
    monthlyFee: 0,
    brfOrgNumber: '',
    balcony: 'unknown' as TriState,
    elevator: 'unknown' as TriState,
  });
  const [consent, setConsent] = useState(false);
  const [status, setStatus] = useState<{ kind: 'idle' | 'sending' } | { kind: 'error'; message: string } | { kind: 'done'; id: string; token: string }>({ kind: 'idle' });
  const [summary, setSummary] = useState<CitySummary[]>([]);
  const set = <K extends keyof typeof form>(k: K) => (v: (typeof form)[K]) => setForm({ ...form, [k]: v });

  const loadSummary = () => {
    if (DEMO) return;
    fetch('/api/sales/summary')
      .then((r) => (r.ok ? r.json() : []))
      .then(setSummary)
      .catch(() => setSummary([]));
  };
  useEffect(loadSummary, []);

  async function submit() {
    setStatus({ kind: 'sending' });
    try {
      const res = await fetch('/api/sales', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          address: form.address,
          city: form.city,
          saleDate: form.saleDate,
          price: Math.round(form.price),
          area: form.area,
          rooms: form.rooms || null,
          floor: form.floor,
          monthlyFee: form.monthlyFee || null,
          brfOrgNumber: form.brfOrgNumber.trim() || null,
          hasBalcony: tri(form.balcony),
          hasElevator: tri(form.elevator),
          consent,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? `Servern svarade ${res.status}.`);
      setStatus({ kind: 'done', id: body.id, token: body.deleteToken });
      loadSummary();
    } catch (err) {
      setStatus({ kind: 'error', message: err instanceof Error ? err.message : String(err) });
    }
  }

  async function remove(id: string, token: string) {
    const res = await fetch(`/api/sales/${id}`, { method: 'DELETE', headers: { 'x-delete-token': token } });
    setStatus(res.ok ? { kind: 'idle' } : { kind: 'error', message: 'Kunde inte radera rapporten.' });
    loadSummary();
  }

  if (DEMO) {
    return (
      <div className="page">
        <p className="demo-note">I demon sparas inga uppgifter. Här kan man i den riktiga appen rapportera vad man köpte eller sålde för.</p>
      </div>
    );
  }

  const triSelect = (label: string, value: TriState, onChange: (v: TriState) => void) => (
    <label className="field">
      <span className="field-label">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value as TriState)}>
        <option value="unknown">Vet ej</option>
        <option value="yes">Ja</option>
        <option value="no">Nej</option>
      </select>
    </label>
  );

  return (
    <div className="page">
      <Card title="Rapportera ett slutpris">
        <p className="hint">
          Har du köpt eller sålt en bostadsrätt? Slutpriser för bostadsrätter registreras inte offentligt. Med din hjälp kan vi
          bygga en värdering som tar hänsyn till föreningens ekonomi.
        </p>
        <div className="grid">
          <label className="field">
            <span className="field-label">Adress</span>
            <span className="field-input"><input value={form.address} onChange={(e) => set('address')(e.target.value)} placeholder="Gatan 12" /></span>
          </label>
          <label className="field">
            <span className="field-label">Ort</span>
            <span className="field-input"><input value={form.city} onChange={(e) => set('city')(e.target.value)} placeholder="Stockholm" /></span>
          </label>
          <label className="field">
            <span className="field-label">Datum för köpet</span>
            <span className="field-input"><input type="date" value={form.saleDate} onChange={(e) => set('saleDate')(e.target.value)} /></span>
          </label>
          <NumberField label="Slutpris" value={form.price} onChange={set('price')} step={10000} suffix="kr" />
          <NumberField label="Boyta" value={form.area} onChange={set('area')} suffix="kvm" />
          <NumberField label="Antal rum" value={form.rooms} onChange={set('rooms')} step={0.5} />
          <NumberField label="Våning (0 = bottenvåning)" value={form.floor} onChange={set('floor')} />
          <NumberField label="Månadsavgift" value={form.monthlyFee} onChange={set('monthlyFee')} step={100} suffix="kr" />
          <label className="field">
            <span className="field-label">Föreningens org.nr (valfritt)</span>
            <span className="field-input"><input value={form.brfOrgNumber} onChange={(e) => set('brfOrgNumber')(e.target.value)} placeholder="769600-1234" /></span>
          </label>
          {triSelect('Balkong', form.balcony, set('balcony'))}
          {triSelect('Hiss', form.elevator, set('elevator'))}
        </div>
        <label className="check">
          <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
          Jag samtycker till att uppgifterna sparas och används anonymiserat för prisstatistik och värdering. Jag kan radera dem
          när som helst.
        </label>
        <button className="primary" disabled={!consent || status.kind === 'sending'} onClick={() => void submit()}>
          {status.kind === 'sending' ? 'Skickar …' : 'Skicka'}
        </button>
        {status.kind === 'error' && <p className="bad">{status.message}</p>}
        {status.kind === 'done' && (
          <div className="success">
            <p className="good">Tack! Uppgifterna är sparade.</p>
            <p className="hint">
              Spara din raderingsnyckel om du vill ta bort rapporten senare: <code>{status.token}</code>{' '}
              <button className="link" onClick={() => void remove(status.id, status.token)}>Radera nu</button>
            </p>
          </div>
        )}
      </Card>

      <Card title="Insamlade slutpriser">
        {summary.length === 0 ? (
          <p className="hint">Inga orter med minst tre rapporterade försäljningar än.</p>
        ) : (
          <table className="table">
            <thead><tr><th>Ort</th><th>Antal</th><th>Median kr/kvm</th></tr></thead>
            <tbody>
              {summary.map((s) => (
                <tr key={s.city}><td style={{ textTransform: 'capitalize' }}>{s.city}</td><td>{s.sales}</td><td>{formatKr(s.medianPricePerSqm)}</td></tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="hint">Orter med färre än tre försäljningar visas inte, så att enskilda köp inte kan pekas ut.</p>
      </Card>
    </div>
  );
}
