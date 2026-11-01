import { useMemo, useState } from 'react';
import { Card, NumberField, PercentField, Row, setter } from '../components';
import { FanChart } from '../FanChart';
import { DEFAULT_RATE_MODEL, rateShock, simulate, type BrfEvent, type ProjectionInput, type RateModel } from '../lib/projection';
import { formatKr, formatPct } from '../lib/format';

export default function Framtid() {
  const [p, setP] = useState<ProjectionInput>({
    price: 3_400_000,
    cash: 500_000,
    area: 60,
    ownRate: 0.03,
    monthlyFee: 3_300,
    operatingMonthly: 1_400,
    brfDebtPerSqm: 11_000,
    brfRate: 0.025,
    brfBindingYears: 3,
    inflation: 0.02,
    years: 10,
    events: [
      { year: 5, label: 'Stambyte (lånefinansierat)', addedDebtPerSqm: 15_000 },
      { year: 6, label: 'Ny tomträttsavgäld', feeChangeMonthly: 400 },
    ],
  });
  const [model, setModel] = useState<RateModel>(DEFAULT_RATE_MODEL);
  const f = setter(p, setP);
  const fm = setter(model, setModel);

  const data = useMemo(() => simulate(p, model), [p, model]);
  const shock = rateShock(p);
  const setEvent = (i: number, e: Partial<BrfEvent>) =>
    setP({ ...p, events: p.events.map((ev, j) => (i === j ? { ...ev, ...e } : ev)) });

  return (
    <div className="page">
      <Card title={`Månadskostnad de kommande ${p.years} åren`}>
        <FanChart data={data} />
        <p className="hint">
          {model.paths} simulerade räntebanor. Bandet visar spannet där 80 % av utfallen hamnar. Inkl. amortering, avgift och
          drift; efter ränteavdrag. Amorteringen är ett sparande, och den sjunker när belåningsgraden passerar 70 % och 50 %.
        </p>
        <details>
          <summary>Visa tabell</summary>
          <table className="table">
            <thead>
              <tr>
                <th>År</th><th>Låg</th><th>Median</th><th>Hög</th><th>Varav amortering</th><th>Bolåneränta</th><th>Föreningens ränta</th><th>Ränta via avgift</th>
              </tr>
            </thead>
            <tbody>
              {data.map((d) => (
                <tr key={d.year}>
                  <td>{d.year === 0 ? 'Idag' : d.year}</td>
                  <td>{formatKr(d.p10)}</td>
                  <td>{formatKr(d.p50)}</td>
                  <td>{formatKr(d.p90)}</td>
                  <td>{formatKr(d.amortization)}</td>
                  <td>{formatPct(d.ownRate)}</td>
                  <td>{formatPct(d.brfRate)}</td>
                  <td>{formatKr(d.feeInterest)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      </Card>

      <Card title="Räntan slår dubbelt">
        <p className="hint">Så mycket stiger månadskostnaden om räntan går upp 1 procentenhet.</p>
        <Row label="Ditt bolån (efter ränteavdrag)" value={`+${formatKr(shock.ownLoan)}/mån`} />
        <Row label="Avgiften – föreningens lån (inget ränteavdrag)" value={`+${formatKr(shock.viaFee)}/mån`} />
        <Row label="Totalt när allt slagit igenom" value={`+${formatKr(shock.ownLoan + shock.viaFee)}/mån`} strong />
        <p className="hint">
          Föreningens lån räntejusteras successivt (bindningstid {p.brfBindingYears} år), så avgiften stiger med ca{' '}
          {formatKr(shock.viaFeeFirstYear)}/mån första året. Räntan via avgiften är dyrare krona för krona eftersom den inte ger
          ränteavdrag.
        </p>
      </Card>

      <Card title="Bostaden och föreningen">
        <div className="grid">
          <NumberField label="Pris" value={p.price} onChange={f('price')} step={50000} suffix="kr" />
          <NumberField label="Kontantinsats" value={p.cash} onChange={f('cash')} step={10000} suffix="kr" />
          <NumberField label="Boyta" value={p.area} onChange={f('area')} suffix="kvm" />
          <PercentField label="Din bolåneränta idag" value={p.ownRate} onChange={f('ownRate')} />
          <NumberField label="Avgift / mån" value={p.monthlyFee} onChange={f('monthlyFee')} step={100} suffix="kr" />
          <NumberField label="Egen drift / mån (el, värme, försäkring)" value={p.operatingMonthly} onChange={f('operatingMonthly')} step={100} suffix="kr" />
          <NumberField label="Föreningens skuld / kvm" value={p.brfDebtPerSqm} onChange={f('brfDebtPerSqm')} step={500} suffix="kr" />
          <PercentField label="Föreningens snittränta" value={p.brfRate} onChange={f('brfRate')} />
          <NumberField label="Föreningens bindningstid" value={p.brfBindingYears} onChange={f('brfBindingYears')} step={0.5} suffix="år" />
          <PercentField label="Kostnadsökning / år (inflation)" value={p.inflation} onChange={f('inflation')} />
          <NumberField label="Antal år" value={p.years} onChange={(v) => f('years')(Math.max(1, Math.min(30, Math.round(v))))} suffix="år" />
        </div>
      </Card>

      <Card title="Kända händelser i föreningen">
        <table className="table">
          <thead>
            <tr><th>Om år</th><th>Händelse</th><th>Ny skuld kr/kvm</th><th>Avgiftsändring kr/mån</th><th /></tr>
          </thead>
          <tbody>
            {p.events.map((e, i) => (
              <tr key={i}>
                <td><input className="cell" type="number" value={e.year} onChange={(ev) => setEvent(i, { year: Number(ev.target.value) })} /></td>
                <td><input className="cell wide" value={e.label} onChange={(ev) => setEvent(i, { label: ev.target.value })} /></td>
                <td><input className="cell" type="number" step={1000} value={e.addedDebtPerSqm ?? 0} onChange={(ev) => setEvent(i, { addedDebtPerSqm: Number(ev.target.value) })} /></td>
                <td><input className="cell" type="number" step={100} value={e.feeChangeMonthly ?? 0} onChange={(ev) => setEvent(i, { feeChangeMonthly: Number(ev.target.value) })} /></td>
                <td><button className="link" onClick={() => setP({ ...p, events: p.events.filter((_, j) => j !== i) })}>Ta bort</button></td>
              </tr>
            ))}
          </tbody>
        </table>
        <button className="link" onClick={() => setP({ ...p, events: [...p.events, { year: 1, label: 'Ny händelse' }] })}>+ Lägg till händelse</button>
        <p className="hint">Stambyte kostar ofta 10 000–20 000 kr/kvm. Lånefinansieras det ökar föreningens skuld och därmed avgiften.</p>
      </Card>

      <Card title="Antaganden om räntan">
        <div className="grid">
          <PercentField label="Långsiktig bolåneränta" value={model.longRunRate} onChange={fm('longRunRate')} />
          <PercentField label="Osäkerhet per år" value={model.volatility} onChange={fm('volatility')} hint="Standardavvikelse i procentenheter" />
          <PercentField label="Hur snabbt räntan normaliseras" value={model.meanReversion} onChange={fm('meanReversion')} hint="Andel av avståndet till långsiktig nivå per år" />
        </div>
        <p className="hint">Föreningens snittränta antas närma sig bolåneräntan i takt med bindningstiden. Det här är ett räkneexempel, inte en prognos.</p>
      </Card>
    </div>
  );
}
