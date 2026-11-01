import { useMemo, useState, type ReactNode } from 'react';
import { Card, CheckField, NumberField, PercentField, Row, setter } from '../components';
import { FanChart } from '../FanChart';
import { ArsredovisningUpload, type ExtractionResult } from './ArsredovisningUpload';
import { DEFAULT_HOUSEHOLD, HouseholdFields } from './Kalkyl';
import {
  DEFAULT_ASSOCIATION,
  associationFromExtraction,
  brfInputFromExtraction,
  projectionInput,
  purchaseInput,
  valuationInput,
  type Association,
  type Listing,
} from '../lib/analysis';
import { analyzeBrf } from '../lib/brf';
import { kalp, monthlyCost, type Household } from '../lib/mortgage';
import { rateShock, simulate } from '../lib/projection';
import { MARKET_CENTRAL, MARKET_SUBURB, valuate, valuateMarket } from '../lib/valuation';
import { formatDec, formatKr, formatNum } from '../lib/format';

const round10k = (n: number) => Math.round(n / 10_000) * 10_000;
const signed = (n: number) => (Math.abs(n) < 1 ? '–' : `${n > 0 ? '+' : '−'}${formatKr(Math.abs(n))}`);

function Tile({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: 'good' | 'bad' }) {
  return (
    <div className="tile">
      <div className="tile-label">{label}</div>
      <div className={`tile-value ${tone ?? ''}`}>{value}</div>
      {sub && <div className="tile-sub">{sub}</div>}
    </div>
  );
}

export default function NyAnalys() {
  const [l, setL] = useState<Listing>({
    address: '',
    price: 3_400_000,
    area: 60,
    monthlyFee: 3_300,
    floor: 1,
    hasBalcony: true,
    hasElevator: false,
    directElectricHeating: false,
    ownHeatingCostYear: 11_000,
    otherOperatingMonthly: 700,
    areaPricePerSqm: 58_000,
    location: 'central',
    cash: 500_000,
    interestRate: 0.03,
  });
  const [a, setA] = useState<Association>(DEFAULT_ASSOCIATION);
  const [h, setH] = useState<Household>(DEFAULT_HOUSEHOLD);
  const [extracted, setExtracted] = useState<ExtractionResult | null>(null);
  const fl = setter(l, setL);
  const fa = setter(a, setA);

  const valuationIn = valuationInput(l, a);
  const economic = valuate(valuationIn);
  const market = valuateMarket(valuationIn, l.location === 'central' ? MARKET_CENTRAL : MARKET_SUBURB);
  const purchase = purchaseInput(l);
  const cost = monthlyCost(purchase);
  const k = kalp(h, purchase);
  const projIn = projectionInput(l, a);
  const projection = useMemo(() => simulate(projIn), [JSON.stringify(projIn)]); // eslint-disable-line react-hooks/exhaustive-deps
  const shock = rateShock(projIn);
  const brfIn = extracted ? brfInputFromExtraction(extracted) : null;
  const brf = brfIn ? analyzeBrf(brfIn) : null;
  const in5 = projection[5];

  const keys = [...new Set([...economic.adjustments, ...market.adjustments].map((x) => x.key))];
  const label = (key: string) => (economic.adjustments.find((x) => x.key === key) ?? market.adjustments.find((x) => x.key === key))!.label;
  const amount = (list: typeof economic.adjustments, key: string) => list.find((x) => x.key === key)?.amount ?? 0;

  return (
    <div className="page">
      <div className="no-print">
        <Card title="1. Bostaden">
          <p className="hint">Fyll i från annonsen. Jämförelsepriset hittar du som snittpris per kvm för sålda lägenheter i området på Booli eller Hemnet.</p>
          <div className="grid">
            <label className="field">
              <span className="field-label">Adress</span>
              <span className="field-input"><input value={l.address} onChange={(e) => fl('address')(e.target.value)} placeholder="Gatan 12, Stockholm" /></span>
            </label>
            <NumberField label="Pris / utgångspris" value={l.price} onChange={fl('price')} step={50000} suffix="kr" />
            <NumberField label="Boyta" value={l.area} onChange={fl('area')} suffix="kvm" />
            <NumberField label="Avgift / mån" value={l.monthlyFee} onChange={fl('monthlyFee')} step={100} suffix="kr" />
            <NumberField label="Våning (0 = bottenvåning)" value={l.floor} onChange={fl('floor')} />
            <NumberField label="Jämförelsepris i området" value={l.areaPricePerSqm} onChange={fl('areaPricePerSqm')} step={1000} suffix="kr/kvm" />
            <label className="field">
              <span className="field-label">Läge</span>
              <select value={l.location} onChange={(e) => fl('location')(e.target.value as Listing['location'])}>
                <option value="central">Centralt</option>
                <option value="suburb">Förort</option>
              </select>
            </label>
            <NumberField label="Din kontantinsats" value={l.cash} onChange={fl('cash')} step={10000} suffix="kr" />
            <PercentField label="Din bolåneränta" value={l.interestRate} onChange={fl('interestRate')} />
          </div>
          <CheckField label="Balkong" value={l.hasBalcony} onChange={fl('hasBalcony')} />
          <CheckField label="Hiss" value={l.hasElevator} onChange={fl('hasElevator')} />
          <CheckField label="Direktverkande el (värmen ingår inte i avgiften)" value={l.directElectricHeating} onChange={fl('directElectricHeating')} />
          {l.directElectricHeating && (
            <div className="grid">
              <NumberField label="Uppvärmning per år" value={l.ownHeatingCostYear} onChange={fl('ownHeatingCostYear')} step={500} suffix="kr" hint="Fråga mäklaren om elkostnaden. Annars: ca 100–150 kWh/kvm × elpris" />
            </div>
          )}
        </Card>

        <Card title="2. Föreningen">
          <ArsredovisningUpload
            onExtracted={(data) => {
              setExtracted(data);
              setA(associationFromExtraction(data, a, new Date().getFullYear()));
            }}
          />
          <h3 className="sub">{extracted ? 'Ifyllt från årsredovisningen – justera vid behov' : 'Eller fyll i själv'}</h3>
          <div className="grid">
            <NumberField label="Föreningens skuld" value={a.debtPerSqm} onChange={fa('debtPerSqm')} step={500} suffix="kr/kvm" />
            <PercentField label="Föreningens snittränta" value={a.brfRate} onChange={fa('brfRate')} />
            <NumberField label="Föreningens bindningstid" value={a.brfBindingYears} onChange={fa('brfBindingYears')} step={0.5} suffix="år" />
            <NumberField label="Föreningens bostadsrättsyta" value={a.brfResidentialArea} onChange={fa('brfResidentialArea')} step={100} suffix="kvm" />
          </div>
          <CheckField label="Tomträtt" value={a.leasehold} onChange={fa('leasehold')} />
          {a.leasehold && (
            <div className="grid">
              <NumberField label="Tomträttsavgäld (föreningen)" value={a.groundRentYear} onChange={fa('groundRentYear')} step={10000} suffix="kr/år" />
              <PercentField label="Förväntad höjning" value={a.groundRentIncrease} onChange={fa('groundRentIncrease')} />
              <NumberField label="Omförhandling om" value={a.groundRentYearsUntil} onChange={fa('groundRentYearsUntil')} suffix="år" />
            </div>
          )}
          <CheckField label="Stambyte väntar" value={a.pipeRenovationPlanned} onChange={fa('pipeRenovationPlanned')} />
          {a.pipeRenovationPlanned && (
            <div className="grid">
              <NumberField label="Om antal år" value={a.pipeRenovationYears} onChange={fa('pipeRenovationYears')} suffix="år" />
              <NumberField label="Kostnad" value={a.pipeRenovationCostPerSqm} onChange={fa('pipeRenovationCostPerSqm')} step={1000} suffix="kr/kvm" />
            </div>
          )}
          <div className="grid">
            <NumberField label="Hyresrätter i föreningen" value={a.rentalUnits} onChange={fa('rentalUnits')} />
            {a.rentalUnits > 0 && (
              <>
                <NumberField label="Värde per hyresrätt om den säljs" value={a.rentalSalePrice} onChange={fa('rentalSalePrice')} step={50000} suffix="kr" />
                <NumberField label="Hyra per hyresrätt" value={a.rentalYearlyRent} onChange={fa('rentalYearlyRent')} step={1000} suffix="kr/år" />
              </>
            )}
          </div>
          <details>
            <summary>Typiska nivåer i området</summary>
            <div className="grid">
              <NumberField label="Typisk avgift" value={a.areaFeePerSqmYear} onChange={fa('areaFeePerSqmYear')} step={10} suffix="kr/kvm/år" />
              <NumberField label="Typisk föreningsskuld" value={a.areaDebtPerSqm} onChange={fa('areaDebtPerSqm')} step={500} suffix="kr/kvm" />
            </div>
          </details>
        </Card>

        <Card title="3. Ditt hushåll (för bankens kalkyl)">
          <details>
            <summary>Visa och ändra</summary>
            <HouseholdFields h={h} setH={setH} />
          </details>
        </Card>
      </div>

      <section className="report">
        <div className="report-head">
          <h2>Analys{l.address ? `: ${l.address}` : ''}</h2>
          <button className="primary no-print" onClick={() => window.print()}>Skriv ut / spara som PDF</button>
        </div>

        <div className="tiles">
          <Tile
            label="Ekonomiskt värde"
            value={formatKr(round10k(economic.estimate))}
            sub={<>Pris {economic.overprice > 0 ? 'över' : 'under'} med {formatKr(Math.abs(economic.overprice))}</>}
            tone={economic.overprice > 0 ? 'bad' : 'good'}
          />
          <Tile
            label="Vad marknaden brukar betala"
            value={formatKr(round10k(market.estimate))}
            sub={<>Pris {market.overprice > 0 ? 'över' : 'under'} med {formatKr(Math.abs(market.overprice))}</>}
            tone={market.overprice > 0 ? 'bad' : 'good'}
          />
          <Tile label="Månadskostnad idag" value={formatKr(cost.total)} sub={<>varav amortering {formatKr(cost.amortization)}</>} />
          <Tile label="Om 5 år (median)" value={formatKr(in5.p50)} sub={<>Hög: {formatKr(in5.p90)}</>} />
          <Tile
            label="Bankens kalkyl (KALP)"
            value={k.approved ? 'Godkänd' : 'Underkänd'}
            sub={<>Kvar att leva på {formatKr(k.kalp)}</>}
            tone={k.approved ? 'good' : 'bad'}
          />
          {brf && <Tile label="Föreningens betyg" value={`${brf.score} / 100`} tone={brf.score >= 60 ? 'good' : brf.score < 40 ? 'bad' : undefined} />}
        </div>

        <Card title="Värdering">
          <table className="table">
            <thead>
              <tr><th /><th className="num">Ekonomiskt</th><th className="num">Marknaden</th></tr>
            </thead>
            <tbody>
              <tr><td>Områdespris ({formatNum(l.areaPricePerSqm)} kr/kvm × {l.area} kvm)</td><td className="num">{formatKr(economic.base)}</td><td className="num">{formatKr(market.base)}</td></tr>
              {keys.map((key) => (
                <tr key={key}>
                  <td>{label(key)}</td>
                  <td className="num">{signed(amount(economic.adjustments, key))}</td>
                  <td className="num">{signed(amount(market.adjustments, key))}</td>
                </tr>
              ))}
              <tr className="total"><td>Uppskattat värde</td><td className="num">{formatKr(economic.estimate)}</td><td className="num">{formatKr(market.estimate)}</td></tr>
            </tbody>
          </table>
          <p className="hint">
            <strong>Ekonomiskt</strong> räknar om föreningens skuld och alla löpande kostnader till kronor idag. <strong>Marknaden</strong> bygger på vad
            studier uppmätt på slutpriser: köpare prisar in avgiften svagare och bortser oftast från framtida händelser. Skillnaden
            ({formatKr(Math.abs(market.estimate - economic.estimate))}) är det marknaden inte tar betalt för
            {market.estimate > economic.estimate ? ' – risk för dig som köpare, men ofta fördel när du säljer.' : '.'}
          </p>
        </Card>

        <Card title="Månadskostnad de kommande 10 åren">
          <FanChart data={projection} />
          <Row label="+1 procentenhet ränta: ditt bolån" value={`+${formatKr(shock.ownLoan)}/mån`} />
          <Row label="+1 procentenhet ränta: via avgiften" value={`+${formatKr(shock.viaFee)}/mån`} />
          <p className="hint">
            Inkl. amortering, avgift och drift; efter ränteavdrag.
            {projIn.events.length > 0 && <> Inräknat: {projIn.events.map((e) => `${e.label.toLowerCase()} år ${e.year}`).join(', ')}.</>}
          </p>
        </Card>

        {brf && (
          <Card title="Föreningens ekonomi">
            <table className="table">
              <tbody>
                {brf.metrics.filter((m) => m.key !== 'debtPerResidentialSqm').map((m) => (
                  <tr key={m.key}>
                    <td>{m.label}</td>
                    <td className="num nowrap">{m.unit === '%' ? formatDec(m.value) : formatNum(m.value)} {m.unit}</td>
                    <td><span className={`badge ${m.rating}`}>{{ good: 'Bra', ok: 'Okej', bad: 'Varning' }[m.rating]}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
            {extracted && extracted.findings.length > 0 && (
              <ul className="warnings">
                {extracted.findings.map((f, i) => (
                  <li key={i}>{{ info: 'ℹ️', warning: '⚠️', critical: '🛑' }[f.severity]} {f.text}</li>
                ))}
              </ul>
            )}
          </Card>
        )}

        <p className="hint">Uppskattningar för att resonera kring ett köp – inte en värdering eller finansiell rådgivning.</p>
      </section>
    </div>
  );
}
