import { useState } from 'react';
import { Card, CheckField, NumberField, PercentField, Row, Tool, setter } from '../components';
import { DEFAULT_KALP, maxPrice, saleProceeds, type Household, type Purchase, type Sale } from '../lib/mortgage';
import { formatKr, formatPct } from '../lib/format';
import { DEFAULT_HOUSEHOLD, HouseholdFields } from './Kalkyl';

const LIMIT_TEXT = {
  kontantinsats: 'kontantinsatsen (bolånetaket 90 %)',
  kalp: 'KALP – inkomsten räcker inte för högre lån vid kalkylräntan',
  skuldkvot: 'skuldkvoten (lån i förhållande till bruttoinkomst)',
};

export default function KopSalj() {
  const [h, setH] = useState<Household>(DEFAULT_HOUSEHOLD);
  const [sell, setSell] = useState(true);
  const [s, setS] = useState<Sale>({
    salePrice: 3_500_000,
    purchasePrice: 2_800_000,
    improvements: 100_000,
    brokerFee: 60_000,
    otherCosts: 15_000,
    remainingLoan: 2_000_000,
  });
  const [savings, setSavings] = useState(200_000);
  const [taxDeferral, setTaxDeferral] = useState(false);
  const [base, setBase] = useState<Omit<Purchase, 'price' | 'cash'>>({
    type: 'bostadsratt',
    monthlyFee: 4_000,
    operatingMonthly: 700,
    interestRate: 0.03,
  });
  const fs = setter(s, setS);
  const fb = setter(base, setBase);

  const sale = saleProceeds(s);
  const taxPaidNow = taxDeferral ? 0 : sale.tax;
  const fromSale = sell ? sale.netProceeds + sale.tax - taxPaidNow : 0;
  const cash = Math.max(0, savings + fromSale);
  const result = maxPrice(h, { ...base, cash }, DEFAULT_KALP);

  return (
    <div className="page">
      <Tool
        result={
          <section className="card">
            <p className="summary-title">Du kan köpa för upp till</p>
            <div className="big">{formatKr(result.maxPrice)}</div>
            <p className="big-sub">Begränsas av {LIMIT_TEXT[result.limitedBy]}.</p>
            <Row label="Kontantinsats" value={formatKr(cash)} />
            <Row label="Bolån" value={formatKr(result.loan)} />
            <Row label="Belåningsgrad" value={formatPct(result.maxPrice > 0 ? result.loan / result.maxPrice : 0)} />
            <Row label="KALP vid maxpris" value={formatKr(result.kalp.kalp)} />
            <p className="hint">Bankerna använder egna kalkylräntor och schabloner, så ta alltid ett lånelöfte.</p>
          </section>
        }
      >
      <Card title="Säljer du en bostad?">
        <CheckField label="Ja, jag säljer en nuvarande bostad" value={sell} onChange={setSell} />
        {sell && (
          <>
            <div className="grid">
              <NumberField label="Förväntat försäljningspris" value={s.salePrice} onChange={fs('salePrice')} step={50000} suffix="kr" />
              <NumberField label="Ursprungligt inköpspris" value={s.purchasePrice} onChange={fs('purchasePrice')} step={50000} suffix="kr" />
              <NumberField label="Förbättringsutgifter" value={s.improvements} onChange={fs('improvements')} step={10000} suffix="kr" hint="Renoveringar som höjt standarden, med kvitton" />
              <NumberField label="Mäklararvode" value={s.brokerFee} onChange={fs('brokerFee')} step={5000} suffix="kr" />
              <NumberField label="Övriga säljkostnader" value={s.otherCosts} onChange={fs('otherCosts')} step={1000} suffix="kr" />
              <NumberField label="Kvarvarande bolån" value={s.remainingLoan} onChange={fs('remainingLoan')} step={50000} suffix="kr" />
            </div>
            <div className="checks">
              <CheckField label="Begär uppskov med vinstskatten" value={taxDeferral} onChange={setTaxDeferral} />
            </div>
            <div className="below" />
            <Row label="Kapitalvinst" value={formatKr(sale.gain)} />
            <Row label="Vinstskatt (22 %)" value={formatKr(sale.tax) + (taxDeferral ? ' (uppskov)' : '')} />
            <Row label="Kvar efter lån och skatt" value={formatKr(fromSale)} strong />
          </>
        )}
      </Card>

      <Card title="Hushållet">
        <HouseholdFields h={h} setH={setH} />
        <div className="grid">
          <NumberField label="Eget sparkapital till insats" value={savings} onChange={setSavings} step={10000} suffix="kr" />
        </div>
      </Card>

      <Card title="Den nya bostaden">
        <div className="grid">
          <label className="field">
            <span className="field-label">Typ</span>
            <select value={base.type} onChange={(e) => fb('type')(e.target.value as Purchase['type'])}>
              <option value="bostadsratt">Bostadsrätt</option>
              <option value="villa">Villa / äganderätt</option>
            </select>
          </label>
          <NumberField label="Förväntad månadsavgift" value={base.monthlyFee} onChange={fb('monthlyFee')} step={100} suffix="kr" />
          <NumberField label="Drift / mån" value={base.operatingMonthly} onChange={fb('operatingMonthly')} step={100} suffix="kr" />
          <PercentField label="Bolåneränta" value={base.interestRate} onChange={fb('interestRate')} />
        </div>
      </Card>
      </Tool>
    </div>
  );
}
