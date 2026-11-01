import { useState } from 'react';
import { Card, CheckField, NumberField, Row, Tool, setter } from '../components';
import { analyzeBrf, effectivePrice, type BrfInput, type Rating } from '../lib/brf';
import { formatDec, formatKr, formatNum } from '../lib/format';
import { mergeExtracted } from '../lib/brfExtraction';
import { ArsredovisningUpload } from './ArsredovisningUpload';

const RATING_LABEL: Record<Rating, string> = { good: 'Bra', ok: 'Okej', bad: 'Varning' };

export default function Brf() {
  const [b, setB] = useState<BrfInput>({
    residentialArea: 4_200,
    otherArea: 300,
    interestBearingDebt: 28_000_000,
    yearlyFees: 3_100_000,
    totalRevenue: 3_400_000,
    netResult: -350_000,
    depreciation: 1_100_000,
    plannedMaintenance: 150_000,
    energyCosts: 950_000,
    cash: 1_200_000,
    leasehold: false,
    genuineHousingCoop: true,
    buildYear: 1962,
    lastPipeRenovation: 2008,
  });
  const [price, setPrice] = useState(3_200_000);
  const [area, setArea] = useState(58);
  const [filled, setFilled] = useState<Set<keyof BrfInput>>(new Set());
  const f = setter(b, setB);
  const mark = (key: keyof BrfInput) => (filled.has(key) ? 'autofilled' : undefined);
  const a = analyzeBrf(b);
  const debtRes = a.metrics.find((m) => m.key === 'debtPerResidentialSqm')!.value;
  const eff = effectivePrice(price, area, debtRes);

  return (
    <div className="page">
      <Tool
        result={
          <section className="card">
            <p className="summary-title">Föreningens betyg</p>
            <div className={`big ${a.score >= 60 ? 'good' : a.score < 40 ? 'bad' : ''}`}>{a.score} / 100</div>
            <table className="table">
              <tbody>
                {a.metrics.map((m) => (
                  <tr key={m.key}>
                    <td>
                      {m.label}
                      <small className="hint">{m.explanation}</small>
                    </td>
                    <td className="num">
                      {m.unit === '%' ? formatDec(m.value) : formatNum(m.value)} {m.unit}
                      <br />
                      <span className={`badge ${m.rating}`}>{RATING_LABEL[m.rating]}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {a.warnings.length > 0 && (
              <ul className="warnings">
                {a.warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            )}
          </section>
        }
      >
      <Card title="Läs in årsredovisning">
        <ArsredovisningUpload
          onExtracted={(data) => {
            const { input, filled } = mergeExtracted(b, data);
            setB(input);
            setFilled(new Set(filled));
          }}
        />
      </Card>

      <Card title="Uppgifter från årsredovisningen">
        {filled.size > 0 && <p className="hint"><span className="autofilled-chip">Gröna</span> fält är ifyllda automatiskt – dubbelkolla gärna.</p>}
        <p className="hint">
          Hittas i förvaltningsberättelsen (flerårsöversikt med nyckeltal), resultaträkningen, balansräkningen och noterna.
        </p>
        <div className="grid">
          <NumberField className={mark('residentialArea')} label="Boyta bostadsrätter" value={b.residentialArea} onChange={f('residentialArea')} step={100} suffix="kvm" />
          <NumberField className={mark('otherArea')} label="Lokaler + hyresrätter" value={b.otherArea} onChange={f('otherArea')} step={50} suffix="kvm" />
          <NumberField className={mark('interestBearingDebt')} label="Räntebärande skulder" value={b.interestBearingDebt} onChange={f('interestBearingDebt')} step={100000} suffix="kr" />
          <NumberField className={mark('yearlyFees')} label="Årsavgifter (totalt)" value={b.yearlyFees} onChange={f('yearlyFees')} step={10000} suffix="kr" />
          <NumberField className={mark('totalRevenue')} label="Rörelseintäkter (totalt)" value={b.totalRevenue} onChange={f('totalRevenue')} step={10000} suffix="kr" />
          <NumberField className={mark('netResult')} label="Årets resultat" value={b.netResult} onChange={f('netResult')} step={10000} suffix="kr" negative />
          <NumberField className={mark('depreciation')} label="Avskrivningar" value={b.depreciation} onChange={f('depreciation')} step={10000} suffix="kr" />
          <NumberField className={mark('plannedMaintenance')} label="Planerat underhåll" value={b.plannedMaintenance} onChange={f('plannedMaintenance')} step={10000} suffix="kr" hint="Kostnadsfört" />
          <NumberField className={mark('energyCosts')} label="Energikostnader" value={b.energyCosts} onChange={f('energyCosts')} step={10000} suffix="kr" hint="Värme, el, vatten" />
          <NumberField className={mark('cash')} label="Likvida medel" value={b.cash} onChange={f('cash')} step={10000} suffix="kr" />
          <NumberField className={mark('buildYear')} label="Byggår" value={b.buildYear ?? 0} onChange={(v) => f('buildYear')(v || undefined)} plain />
          <NumberField className={mark('lastPipeRenovation')} label="Senaste stambyte (år)" value={b.lastPipeRenovation ?? 0} onChange={(v) => f('lastPipeRenovation')(v || undefined)} plain />
        </div>
        <div className="checks">
          <CheckField label="Tomträtt (föreningen äger inte marken)" value={b.leasehold} onChange={f('leasehold')} />
          <CheckField label="Äkta bostadsrättsförening" value={b.genuineHousingCoop} onChange={f('genuineHousingCoop')} />
        </div>
      </Card>

      <Card title="Verkligt pris, med din andel av föreningens skuld">
        <div className="grid">
          <NumberField label="Pris lägenhet" value={price} onChange={setPrice} step={50000} suffix="kr" />
          <NumberField label="Boyta lägenhet" value={area} onChange={setArea} suffix="kvm" />
        </div>
        <div className="below" />
        <Row label="Pris per kvm" value={formatKr(price / area)} />
        <Row label="Din andel av föreningens lån" value={formatKr(eff.shareOfDebt)} />
        <Row label="Verkligt pris" value={formatKr(eff.effectivePrice)} strong />
        <Row label="Verkligt pris per kvm" value={formatKr(eff.effectivePricePerSqm)} />
        <p className="hint">
          Andelen är en approximation baserad på boyta. Exakt andelstal står i föreningens ekonomiska plan/stadgar.
        </p>
      </Card>
      </Tool>
    </div>
  );
}
