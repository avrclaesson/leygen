import { useState } from 'react';
import { Card, CheckField, NumberField, PercentField, Row, setter } from '../components';
import { valuate, type ValuationInput } from '../lib/valuation';
import { formatKr } from '../lib/format';

const signed = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${formatKr(Math.abs(n))}`;

export default function Varde() {
  const [v, setV] = useState<ValuationInput>({
    areaPricePerSqm: 58_000,
    area: 60,
    askingPrice: 3_400_000,
    discountRate: 0.05,
    feePerSqmYear: 660,
    areaFeePerSqmYear: 750,
    debtPerSqm: 11_000,
    areaDebtPerSqm: 6_000,
    brfRate: 0.025,
    directElectricHeating: true,
    ownHeatingCostYear: 11_000,
    pipeRenovationPlanned: true,
    pipeRenovationYears: 5,
    pipeRenovationCostPerSqm: 15_000,
    pipeRenovationOwnValueShare: 0.3,
    pipeRenovationAlreadyInDebt: false,
    leasehold: true,
    groundRentYear: 350_000,
    groundRentIncrease: 0.6,
    groundRentYearsUntil: 6,
    brfResidentialArea: 2_400,
    rentalUnits: 2,
    rentalSalePrice: 2_600_000,
    rentalYearlyRent: 95_000,
    rentalFutureFeeYear: 45_000,
    rentalConversionProbability: 0.5,
    rentalYearsUntil: 3,
    groundFloor: false,
    groundFloorPct: -0.05,
    noBalcony: false,
    noBalconyPct: -0.02,
    noElevatorHighFloor: false,
    noElevatorPct: -0.05,
    renovationNeed: 0,
  });
  const f = setter(v, setV);
  const r = valuate(v);
  const maxAbs = Math.max(1, ...r.adjustments.map((a) => Math.abs(a.amount)));

  return (
    <div className="page">
      <Card title="Uppskattat värde">
        <p className="hint">Exempelvärdena nedan är påhittade – fyll i din egen lägenhet.</p>
        <div className="big">{formatKr(Math.round(r.estimate / 10_000) * 10_000)}</div>
        <Row label={`Områdespris (${formatKr(v.areaPricePerSqm)}/kvm × ${v.area} kvm)`} value={formatKr(r.base)} />
        <table className="table adjustments">
          <tbody>
            {r.adjustments.map((a) => (
              <tr key={a.key}>
                <td>
                  {a.label}
                  <br />
                  <small className="hint">{a.explanation}</small>
                </td>
                <td className="bar-cell">
                  <span className={`bar ${a.amount < 0 ? 'neg' : 'pos'}`} style={{ width: `${(Math.abs(a.amount) / maxAbs) * 100}%` }} />
                </td>
                <td className="nowrap num">{signed(a.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <Row label="Uppskattat värde" value={formatKr(r.estimate)} strong />
        <Row label="Pris du jämför med" value={formatKr(v.askingPrice)} />
        <Row
          label={r.overprice > 0 ? 'Priset ligger över uppskattat värde med' : 'Priset ligger under uppskattat värde med'}
          value={<span className={r.overprice > 0 ? 'bad' : 'good'}>{formatKr(Math.abs(r.overprice))}</span>}
          strong
        />
        <p className="hint">
          Löpande kostnader omräknas till ett värde idag med {(v.discountRate * 100).toLocaleString('sv-SE')} % diskonteringsränta
          (100 kr/mån ≈ {formatKr(1200 / v.discountRate)}). Procentjusteringar är tumregler. Se resultatet som ett
          resonemangsunderlag, inte en exakt värdering.
        </p>
      </Card>

      <Card title="Jämförelse med området">
        <div className="grid">
          <NumberField label="Områdespris (liknande lgh)" value={v.areaPricePerSqm} onChange={f('areaPricePerSqm')} step={1000} suffix="kr/kvm" hint="Snitt för sålda lägenheter i området, t.ex. från Booli eller Hemnet" />
          <NumberField label="Boyta" value={v.area} onChange={f('area')} suffix="kvm" />
          <NumberField label="Utgångspris / pris" value={v.askingPrice} onChange={f('askingPrice')} step={50000} suffix="kr" />
          <PercentField label="Diskonteringsränta" value={v.discountRate} onChange={f('discountRate')} />
        </div>
      </Card>

      <Card title="Föreningen">
        <div className="grid">
          <NumberField label="Avgift (denna förening)" value={v.feePerSqmYear} onChange={f('feePerSqmYear')} step={10} suffix="kr/kvm/år" />
          <NumberField label="Avgift (typiskt i området)" value={v.areaFeePerSqmYear} onChange={f('areaFeePerSqmYear')} step={10} suffix="kr/kvm/år" />
          <NumberField label="Skuld (denna förening)" value={v.debtPerSqm} onChange={f('debtPerSqm')} step={500} suffix="kr/kvm" />
          <NumberField label="Skuld (typiskt i området)" value={v.areaDebtPerSqm} onChange={f('areaDebtPerSqm')} step={500} suffix="kr/kvm" />
          <PercentField label="Föreningens snittränta" value={v.brfRate} onChange={f('brfRate')} />
          <NumberField label="Föreningens bostadsrättsyta" value={v.brfResidentialArea} onChange={f('brfResidentialArea')} step={100} suffix="kvm" />
        </div>
      </Card>

      <Card title="Uppvärmning">
        <CheckField label="Direktverkande el (värmen ingår inte i avgiften)" value={v.directElectricHeating} onChange={f('directElectricHeating')} />
        {v.directElectricHeating && (
          <div className="grid">
            <NumberField label="Egen uppvärmningskostnad" value={v.ownHeatingCostYear} onChange={f('ownHeatingCostYear')} step={500} suffix="kr/år" hint="Elräkningen för värme. Saknas uppgift: ca 100–150 kWh/kvm × elpris" />
          </div>
        )}
      </Card>

      <Card title="Stambyte">
        <CheckField label="Stambyte planerat" value={v.pipeRenovationPlanned} onChange={f('pipeRenovationPlanned')} />
        {v.pipeRenovationPlanned && (
          <>
            <div className="grid">
              <NumberField label="Om antal år" value={v.pipeRenovationYears} onChange={f('pipeRenovationYears')} suffix="år" />
              <NumberField label="Kostnad" value={v.pipeRenovationCostPerSqm} onChange={f('pipeRenovationCostPerSqm')} step={1000} suffix="kr/kvm" hint="Ofta 10 000–20 000 kr/kvm. Har liknande lägenheter i området också stambyte framför sig ligger det delvis redan i områdespriset." />
              <PercentField label="Värde för dig (nytt badrum m.m.)" value={v.pipeRenovationOwnValueShare} onChange={f('pipeRenovationOwnValueShare')} />
            </div>
            <CheckField label="Redan lånefinansierat (ingår i skulden ovan)" value={v.pipeRenovationAlreadyInDebt} onChange={f('pipeRenovationAlreadyInDebt')} />
          </>
        )}
      </Card>

      <Card title="Tomträtt">
        <CheckField label="Föreningen har tomträtt" value={v.leasehold} onChange={f('leasehold')} />
        {v.leasehold && (
          <div className="grid">
            <NumberField label="Tomträttsavgäld idag (föreningen)" value={v.groundRentYear} onChange={f('groundRentYear')} step={10000} suffix="kr/år" />
            <PercentField label="Förväntad höjning" value={v.groundRentIncrease} onChange={f('groundRentIncrease')} hint="Höjningar på 50–200 % förekommer vid omförhandling. En KTH-studie (2025) fann i snitt 3,6 % lägre pris för tomträtt i Stockholms innerstad och 6,8 % i förorterna." />
            <NumberField label="Nästa omförhandling om" value={v.groundRentYearsUntil} onChange={f('groundRentYearsUntil')} suffix="år" />
          </div>
        )}
      </Card>

      <Card title="Hyresrätter i föreningen">
        <div className="grid">
          <NumberField label="Antal hyresrätter" value={v.rentalUnits} onChange={f('rentalUnits')} />
          {v.rentalUnits > 0 && (
            <>
              <NumberField label="Försäljningspris per lgh" value={v.rentalSalePrice} onChange={f('rentalSalePrice')} step={50000} suffix="kr" />
              <NumberField label="Hyra per lgh" value={v.rentalYearlyRent} onChange={f('rentalYearlyRent')} step={1000} suffix="kr/år" />
              <NumberField label="Avgift efter omvandling" value={v.rentalFutureFeeYear} onChange={f('rentalFutureFeeYear')} step={1000} suffix="kr/år" />
              <PercentField label="Sannolikhet att de säljs" value={v.rentalConversionProbability} onChange={f('rentalConversionProbability')} hint="Kräver ofta att hyresgästen flyttar eller vill köpa" />
              <NumberField label="Om antal år" value={v.rentalYearsUntil} onChange={f('rentalYearsUntil')} suffix="år" />
            </>
          )}
        </div>
      </Card>

      <Card title="Lägenheten">
        <CheckField label="Bottenvåning" value={v.groundFloor} onChange={f('groundFloor')} />
        <CheckField label="Saknar balkong" value={v.noBalcony} onChange={f('noBalcony')} />
        <CheckField label="Ingen hiss och högt upp (3 tr eller mer)" value={v.noElevatorHighFloor} onChange={f('noElevatorHighFloor')} />
        <div className="grid">
          {v.groundFloor && <PercentField label="Justering bottenvåning" value={v.groundFloorPct} onChange={f('groundFloorPct')} />}
          {v.noBalcony && <PercentField label="Justering balkong" value={v.noBalconyPct} onChange={f('noBalconyPct')} />}
          {v.noElevatorHighFloor && <PercentField label="Justering hiss" value={v.noElevatorPct} onChange={f('noElevatorPct')} />}
          <NumberField label="Renoveringsbehov" value={v.renovationNeed} onChange={f('renovationNeed')} step={10000} suffix="kr" />
        </div>
      </Card>
    </div>
  );
}
