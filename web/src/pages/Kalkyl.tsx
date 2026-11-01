import { useState } from 'react';
import { Card, CheckField, NumberField, PercentField, Row, Tool, setter } from '../components';
import { DEFAULT_KALP, kalp, monthlyCost, sensitivity, transactionCosts, type Household, type Purchase } from '../lib/mortgage';
import { formatDec, formatKr, formatPct } from '../lib/format';

export const DEFAULT_HOUSEHOLD: Household = {
  netIncomeMonthly: 55_000,
  grossIncomeYearly: 900_000,
  adults: 2,
  children: 0,
  cars: 0,
  otherDebtMonthly: 0,
  otherDebtTotal: 0,
};

export function HouseholdFields({ h, setH }: { h: Household; setH: (h: Household) => void }) {
  const f = setter(h, setH);
  return (
    <div className="grid">
      <NumberField label="Nettoinkomst hushåll / mån" value={h.netIncomeMonthly} onChange={f('netIncomeMonthly')} step={1000} suffix="kr" />
      <NumberField label="Bruttoinkomst hushåll / år" value={h.grossIncomeYearly} onChange={f('grossIncomeYearly')} step={10000} suffix="kr" />
      <NumberField label="Vuxna" value={h.adults} onChange={f('adults')} />
      <NumberField label="Barn" value={h.children} onChange={f('children')} />
      <NumberField label="Bilar" value={h.cars} onChange={f('cars')} />
      <NumberField label="Övriga lån, kostnad / mån" value={h.otherDebtMonthly} onChange={f('otherDebtMonthly')} step={500} suffix="kr" />
      <NumberField label="Övriga lån, totalt" value={h.otherDebtTotal} onChange={f('otherDebtTotal')} step={10000} suffix="kr" />
    </div>
  );
}

const ok = (b: boolean) => (b ? <span className="good">✓</span> : <span className="bad">✗</span>);

export default function Kalkyl() {
  const [h, setH] = useState<Household>(DEFAULT_HOUSEHOLD);
  const [p, setP] = useState<Purchase>({
    type: 'bostadsratt',
    price: 4_000_000,
    cash: 600_000,
    monthlyFee: 3_800,
    operatingMonthly: 700,
    interestRate: 0.03,
  });
  const [opts, setOpts] = useState(DEFAULT_KALP);
  const fp = setter(p, setP);
  const fo = setter(opts, setOpts);

  const cost = monthlyCost(p);
  const k = kalp(h, p, opts);
  const sens = sensitivity(p);
  const tx = transactionCosts(p);

  return (
    <div className="page">
      <Tool
        result={
          <>
            <section className="card">
              <p className="summary-title">Per månad</p>
              <div className="big">{formatKr(cost.total)}</div>
              <p className="big-sub">varav kostnad {formatKr(cost.totalExclAmortization)}, resten är amortering</p>
              <Row label="Bolån" value={formatKr(cost.loan)} />
              <Row label="Belåningsgrad" value={formatPct(cost.ltv)} />
              <Row label={`Ränta (${formatPct(p.interestRate)})`} value={formatKr(cost.interest)} />
              <Row label="Ränta efter ränteavdrag" value={formatKr(cost.interestAfterDeduction)} />
              <Row label={`Amortering (${formatPct(cost.amortizationRate)}/år)`} value={formatKr(cost.amortization)} />
              <Row label="Avgift + drift" value={formatKr(cost.fee + cost.operating)} />
              <Row label="Engångskostnader vid köp" value={formatKr(tx)} />
            </section>
            <section className="card">
              <p className="summary-title">Bankens kalkyl (KALP)</p>
              <div className={`big small ${k.approved ? 'good' : 'bad'}`}>{k.approved ? 'Godkänd' : 'Underkänd'}</div>
              <p className="big-sub">Kvar att leva på {formatKr(k.kalp)}/mån</p>
              <Row label="KALP ≥ 0" value={ok(k.approvedByKalp)} />
              <Row label={`Kontantinsats ≥ ${formatKr(k.cashRequired)}`} value={ok(k.approvedByLtv)} />
              <Row label={`Skuldkvot ${formatDec(k.debtToIncome)} ≤ ${opts.maxDebtToIncome}`} value={ok(k.approvedByDti)} />
            </section>
          </>
        }
      >
        <Card title="Bostaden">
          <div className="grid">
            <label className="field">
              <span className="field-label">Typ</span>
              <select value={p.type} onChange={(e) => fp('type')(e.target.value as Purchase['type'])}>
                <option value="bostadsratt">Bostadsrätt</option>
                <option value="villa">Villa / äganderätt</option>
              </select>
            </label>
            <NumberField label="Pris" value={p.price} onChange={fp('price')} step={50000} suffix="kr" />
            <NumberField label="Kontantinsats" value={p.cash} onChange={fp('cash')} step={10000} suffix="kr" />
            <NumberField label="Månadsavgift" value={p.monthlyFee} onChange={fp('monthlyFee')} step={100} suffix="kr" />
            <NumberField label="Drift per månad" value={p.operatingMonthly} onChange={fp('operatingMonthly')} step={100} suffix="kr" hint="El, värme, försäkring" />
            <PercentField label="Bolåneränta" value={p.interestRate} onChange={fp('interestRate')} />
          </div>
        </Card>

        <Card title="Hushållet">
          <HouseholdFields h={h} setH={setH} />
        </Card>

        <Card title="Så räknar banken">
          <Row label="Nettoinkomst" value={formatKr(k.income)} />
          <Row label="− Ränta på kalkylränta" value={formatKr(k.stressedInterest)} />
          <Row label="− Amortering" value={formatKr(k.amortization)} />
          <Row label="− Avgift + drift" value={formatKr(k.housing)} />
          <Row label="− Levnadskostnader (schablon)" value={formatKr(k.living)} />
          <Row label="− Övriga lån" value={formatKr(k.otherDebt)} />
          <Row label="Kvar att leva på" value={<span className={k.kalp >= 0 ? 'good' : 'bad'}>{formatKr(k.kalp)}</span>} strong />
          <details>
            <summary>Ändra bankens antaganden</summary>
            <div className="grid compact">
              <PercentField label="Kalkylränta" value={opts.stressRate} onChange={fo('stressRate')} />
              <NumberField label="Max skuldkvot" value={opts.maxDebtToIncome} onChange={fo('maxDebtToIncome')} step={0.5} suffix="ggr" />
            </div>
            <div className="checks">
              <CheckField label="Räkna med ränteavdrag" value={opts.includeDeduction} onChange={fo('includeDeduction')} />
            </div>
          </details>
        </Card>
      </Tool>

      <Card title="Månadskostnad vid olika räntor och avgiftshöjningar">
        <table className="table heat">
          <thead>
            <tr>
              <th>Ränta \ Avgift</th>
              {sens.feeChanges.map((f) => (
                <th key={f}>{f === 0 ? 'Nuvarande' : `+${f * 100} %`}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sens.rates.map((r, i) => (
              <tr key={r}>
                <th>{formatPct(r)}</th>
                {sens.cells[i].map((c, j) => (
                  <td key={j} className={`nowrap ${c > h.netIncomeMonthly * 0.4 ? 'bad' : c > h.netIncomeMonthly * 0.3 ? 'warn' : ''}`}>
                    {formatKr(c)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        <small className="hint">Inkl. amortering, efter ränteavdrag. Gult: över 30 % av nettoinkomsten, rött: över 40 %.</small>
      </Card>
    </div>
  );
}
