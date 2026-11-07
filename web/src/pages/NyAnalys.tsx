import { useEffect, useMemo, useState, type ReactNode } from 'react';
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
import { formatDec, formatKr, formatNum, formatPct } from '../lib/format';
import { REGIONS, resilience } from '../lib/resilience';
import { MARKET_REGIONS, formatAsOf, isStale, type DataPoint } from '../lib/marketData';

const STEPS = ['Bostaden', 'Föreningen', 'Din ekonomi', 'Resultat'];
const RESULT_STEP = STEPS.length - 1;

const round10k = (n: number) => Math.round(n / 10_000) * 10_000;
const signed = (n: number) => (Math.abs(n) < 1 ? '–' : `${n > 0 ? '+' : '−'}${formatKr(Math.abs(n))}`);

function Stat({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: 'good' | 'bad' }) {
  return (
    <div className="stat">
      <div className="stat-label">{label}</div>
      <div className={`stat-value ${tone ?? ''}`}>{value}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  );
}

export default function NyAnalys() {
  const [step, setStep] = useState(0);
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
  const [regionId, setRegionId] = useState('stockholm');
  // Prissegment har svagt underlag och är därför avstängt som standard.
  const [segmentOn, setSegmentOn] = useState(false);
  const [segmentSensitivity, setSegmentSensitivity] = useState(0.5);
  const [municipalOverride, setMunicipalOverride] = useState<number | null>(null);
  const fl = setter(l, setL);
  const fa = setter(a, setA);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [step]);

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
  const region = REGIONS.find((r) => r.id === regionId)!;
  const marketData = MARKET_REGIONS.find((r) => r.id === regionId)!;
  const municipalMedian = municipalOverride ?? marketData.avgPricePerSqm?.value ?? null;
  const ownPricePerSqm = l.area > 0 ? l.price / l.area : 0;
  const segmentActive = segmentOn && municipalMedian !== null && municipalMedian > 0;
  const now = new Date();
  const sourceText = (d: DataPoint) => `${d.source}, ${formatAsOf(d.asOf)}${isStale(d, now) ? ' – kan vara inaktuell' : ''}`;
  const res = resilience({
    price: l.price,
    area: l.area,
    loan: cost.loan,
    ownRate: l.interestRate,
    monthlyFee: l.monthlyFee,
    region,
    priceRatio: segmentActive ? ownPricePerSqm / municipalMedian : 1,
    segmentSensitivity: segmentActive ? segmentSensitivity : 0,
    debtPerSqm: a.debtPerSqm,
    areaDebtPerSqm: a.areaDebtPerSqm,
    brfBindingYears: a.brfBindingYears,
    perThousandMonthly: -0.025,
  });
  const ratingText = { better: 'Bättre än området', same: 'Som området', worse: 'Sämre än området' }[res.rating];

  const keys = [...new Set([...economic.adjustments, ...market.adjustments].map((x) => x.key))];
  const label = (key: string) => (economic.adjustments.find((x) => x.key === key) ?? market.adjustments.find((x) => x.key === key))!.label;
  const amount = (list: typeof economic.adjustments, key: string) => list.find((x) => x.key === key)?.amount ?? 0;

  const print = () => {
    // Förklaringarna ska följa med på utskriften.
    document.querySelectorAll<HTMLDetailsElement>('.report details').forEach((d) => { d.open = true; });
    window.print();
  };

  const stepper = (
    <ol className="steps no-print">
      {STEPS.map((name, i) => (
        <li key={name} className={i < step ? 'done' : undefined}>
          <button aria-current={i === step ? 'step' : undefined} onClick={() => setStep(i)}>
            {name}
          </button>
        </li>
      ))}
    </ol>
  );

  if (step === RESULT_STEP) {
    return (
      <div className="page">
        {stepper}
        <section className="report">
          <div className="report-head">
            <h2>{l.address || 'Din analys'}</h2>
            <div className="report-actions no-print">
              <button className="secondary" onClick={() => setStep(0)}>Ändra uppgifter</button>
              <button className="primary" onClick={print}>Spara som PDF</button>
            </div>
          </div>

          <div className="stats">
            <Stat
              label="Ekonomiskt värde"
              value={formatKr(round10k(economic.estimate))}
              sub={<>Priset är {formatKr(Math.abs(economic.overprice))} {economic.overprice > 0 ? 'högre' : 'lägre'}</>}
              tone={economic.overprice > 0 ? 'bad' : 'good'}
            />
            <Stat
              label="Vad marknaden brukar betala"
              value={formatKr(round10k(market.estimate))}
              sub={<>Priset är {formatKr(Math.abs(market.overprice))} {market.overprice > 0 ? 'högre' : 'lägre'}</>}
              tone={market.overprice > 0 ? 'bad' : 'good'}
            />
            <Stat label="Månadskostnad idag" value={formatKr(cost.total)} sub={<>varav amortering {formatKr(cost.amortization)}</>} />
            <Stat label="Månadskostnad om 5 år" value={formatKr(in5.p50)} sub={<>median, högt utfall {formatKr(in5.p90)}</>} />
            <Stat
              label="Bankens kalkyl (KALP)"
              value={k.approved ? 'Godkänd' : 'Underkänd'}
              sub={<>Kvar att leva på {formatKr(k.kalp)}</>}
              tone={k.approved ? 'good' : 'bad'}
            />
            <Stat
              label="Motståndskraft vid nedgång"
              value={ratingText}
              sub={<>Som 2022: {formatPct(res.results[1].total)} (området {formatPct(region.drop2022)})</>}
              tone={res.rating === 'better' ? 'good' : res.rating === 'worse' ? 'bad' : undefined}
            />
            {brf && <Stat label="Föreningens betyg" value={`${brf.score} / 100`} tone={brf.score >= 60 ? 'good' : brf.score < 40 ? 'bad' : undefined} />}
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
            <details>
              <summary>Vad är skillnaden?</summary>
              <p className="hint">
                <strong>Ekonomiskt</strong> räknar om föreningens skuld och alla löpande kostnader till kronor idag. <strong>Marknaden</strong> bygger på vad
                studier uppmätt på slutpriser: köpare prisar in avgiften svagare och bortser oftast från framtida händelser. Skillnaden
                ({formatKr(Math.abs(market.estimate - economic.estimate))}) är det marknaden inte tar betalt för
                {market.estimate > economic.estimate ? ' – risk för dig som köpare, men ofta fördel när du säljer.' : '.'}
              </p>
            </details>
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

          <Card title="Motståndskraft vid nedgång">
            <table className="table">
              <thead>
                <tr>
                  <th>Scenario</th>
                  <th className="num">Marknaden</th>
                  <th className="num">Prissegment</th>
                  <th className="num">Föreningen</th>
                  <th className="num">Totalt</th>
                  <th className="num">Värde efter</th>
                  <th className="num">Belåningsgrad</th>
                  <th className="num">Månadskostnad</th>
                </tr>
              </thead>
              <tbody>
                {res.results.map((r) => (
                  <tr key={r.scenario.id}>
                    <td>
                      {r.scenario.label}
                      <small className="hint">Ränta +{formatDec(r.scenario.rateShock * 100)} pe · återhämtning {r.scenario.recovery}</small>
                    </td>
                    <td className="num">{formatPct(r.market)}</td>
                    <td className="num">{Math.abs(r.segment) < 0.0005 ? '–' : formatPct(r.segment)}</td>
                    <td className="num">{Math.abs(r.association) < 0.0005 ? '–' : formatPct(r.association)}</td>
                    <td className="num"><strong>{formatPct(r.total)}</strong></td>
                    <td className="num">{formatKr(round10k(r.valueAfter))}</td>
                    <td className={`num ${r.ltvAfter > 1 ? 'bad' : ''}`}>{formatPct(r.ltvAfter)}</td>
                    <td className="num">+{formatKr(r.monthlyIncrease)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <details>
              <summary>Så räknar vi</summary>
              <ul className="facts">
                <li>
                  <strong>Marknaden:</strong> {region.label} föll {formatPct(Math.abs(region.drop2022))} från toppen 2022 (
                  {marketData.drop2022.url ? <a href={marketData.drop2022.url}>{sourceText(marketData.drop2022)}</a> : sourceText(marketData.drop2022)}). Djup kris
                  antas bli 1,5 gånger så stor – villapriserna föll ca 21 % på 90-talet.
                </li>
                <li>
                  <strong>Föreningen</strong> och <strong>marknaden</strong> är de delar med bäst underlag. Det var räntan som drev nedgången 2022.
                </li>
                <li>
                  <strong>Prissegment:</strong>{' '}
                  {segmentActive
                    ? <>påslaget. Kvm-priset är {formatDec((ownPricePerSqm / municipalMedian!) * 100)} % av kommunens snitt.</>
                    : 'avstängt.'}{' '}
                  Att billigare bostäder svänger mer stöds av amerikanska data, men i Sverige 2022 föll billiga Malmö lika lite som Stockholm, och
                  kvm-pris blandar ihop läge med lägenhetens storlek (små lägenheter har högre kvm-pris). Därför är det ett osäkert antagande.
                </li>
                <li>
                  <strong>Föreningen:</strong> skulden jämfört med områdets typiska nivå avgör hur mycket mer (eller mindre) avgiften stiger när räntan
                  går upp, och höjningen prisas in med ca 2,5 % per 1 000 kr/mån (Wilhelmsson, KTH 2025).
                </li>
                <li>
                  <strong>Månadskostnad:</strong> ökning för ditt bolån (efter ränteavdrag) och avgiften inom ca två år. Belåningsgrad över 100 % betyder att
                  lånet är större än bostadens värde.
                </li>
              </ul>
              <div className="no-print">
                <CheckField label="Räkna med prissegment (osäkert)" value={segmentOn} onChange={setSegmentOn} />
                {segmentOn && (
                  <div className="grid">
                    <NumberField
                      label="Kommunens snittpris"
                      value={municipalMedian ?? 0}
                      onChange={(v) => setMunicipalOverride(v || null)}
                      step={1000}
                      suffix="kr/kvm"
                      hint={
                        municipalOverride !== null
                          ? 'Ditt eget värde.'
                          : marketData.avgPricePerSqm
                            ? `${sourceText(marketData.avgPricePerSqm)}.${marketData.avgPricePerSqm.note ? ` ${marketData.avgPricePerSqm.note}` : ''}`
                            : 'Saknas för den här kommunen – fyll i snittpriset från Svensk Mäklarstatistik.'
                      }
                    />
                    <PercentField label="Känslighet för prissegment" value={segmentSensitivity} onChange={setSegmentSensitivity} hint="50 % ⇒ en bostad 30 % billigare än snittet faller 15 % mer" />
                  </div>
                )}
              </div>
            </details>
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
                    <li key={i} className={f.severity}>{f.text}</li>
                  ))}
                </ul>
              )}
            </Card>
          )}

          <p className="hint report-disclaimer">Uppskattningar för att resonera kring ett köp – inte en värdering eller finansiell rådgivning.</p>
        </section>
      </div>
    );
  }

  return (
    <div className="page">
      {stepper}
      <div className="tool">
        <div className="tool-inputs">
          {step === 0 && (
            <>
              <Card title="Från annonsen">
                <p className="hint">Fälten innehåller exempelvärden. Byt ut dem mot bostaden du tittar på.</p>
                <div className="grid">
                  <label className="field full">
                    <span className="field-label">Adress</span>
                    <span className="field-input"><input value={l.address} onChange={(e) => fl('address')(e.target.value)} placeholder="Gatan 12, Stockholm" /></span>
                  </label>
                  <NumberField label="Pris" value={l.price} onChange={fl('price')} step={50000} suffix="kr" />
                  <NumberField label="Boyta" value={l.area} onChange={fl('area')} suffix="kvm" />
                  <NumberField label="Avgift" value={l.monthlyFee} onChange={fl('monthlyFee')} step={100} suffix="kr/mån" />
                  <NumberField label="Våning" value={l.floor} onChange={fl('floor')} hint="0 = bottenvåning" />
                </div>
                <div className="checks">
                  <CheckField label="Balkong" value={l.hasBalcony} onChange={fl('hasBalcony')} />
                  <CheckField label="Hiss" value={l.hasElevator} onChange={fl('hasElevator')} />
                  <CheckField label="Direktverkande el (värmen ingår inte i avgiften)" value={l.directElectricHeating} onChange={fl('directElectricHeating')} />
                </div>
                {l.directElectricHeating && (
                  <div className="grid">
                    <NumberField label="Uppvärmning per år" value={l.ownHeatingCostYear} onChange={fl('ownHeatingCostYear')} step={500} suffix="kr" hint="Fråga mäklaren om elkostnaden. Annars: ca 100–150 kWh/kvm × elpris" />
                  </div>
                )}
              </Card>
              <Card title="Området">
                <div className="grid">
                  <NumberField label="Jämförelsepris" value={l.areaPricePerSqm} onChange={fl('areaPricePerSqm')} step={1000} suffix="kr/kvm" hint="Utgångspunkt för värderingen: snittpris för sålda liknande lägenheter i närområdet, t.ex. på Booli eller Hemnet" />
                  <label className="field">
                    <span className="field-label">Läge</span>
                    <select value={l.location} onChange={(e) => fl('location')(e.target.value as Listing['location'])}>
                      <option value="central">Centralt</option>
                      <option value="suburb">Förort</option>
                    </select>
                  </label>
                  <label className="field">
                    <span className="field-label">Kommun</span>
                    <select
                      value={regionId}
                      onChange={(e) => {
                        setRegionId(e.target.value);
                        setMunicipalOverride(null);
                      }}
                    >
                      {REGIONS.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
                    </select>
                    <small className="hint">Används för prisfall i scenarierna för nedgång.</small>
                  </label>
                </div>
              </Card>
            </>
          )}

          {step === 1 && (
            <>
              <Card title="Årsredovisningen">
                <ArsredovisningUpload
                  onExtracted={(data) => {
                    setExtracted(data);
                    setA(associationFromExtraction(data, a, new Date().getFullYear()));
                  }}
                />
              </Card>
              <Card title={extracted ? 'Ifyllt från årsredovisningen' : 'Eller fyll i själv'}>
                {extracted && <p className="hint">Justera om något inte stämmer.</p>}
                <div className="grid">
                  <NumberField label="Föreningens skuld" value={a.debtPerSqm} onChange={fa('debtPerSqm')} step={500} suffix="kr/kvm" />
                  <PercentField label="Snittränta" value={a.brfRate} onChange={fa('brfRate')} />
                  <NumberField label="Bindningstid" value={a.brfBindingYears} onChange={fa('brfBindingYears')} step={0.5} suffix="år" />
                  <NumberField label="Bostadsrättsyta" value={a.brfResidentialArea} onChange={fa('brfResidentialArea')} step={100} suffix="kvm" />
                  <NumberField label="Hyresrätter i föreningen" value={a.rentalUnits} onChange={fa('rentalUnits')} />
                  {a.rentalUnits > 0 && (
                    <>
                      <NumberField label="Värde per hyresrätt om den säljs" value={a.rentalSalePrice} onChange={fa('rentalSalePrice')} step={50000} suffix="kr" />
                      <NumberField label="Hyra per hyresrätt" value={a.rentalYearlyRent} onChange={fa('rentalYearlyRent')} step={1000} suffix="kr/år" />
                    </>
                  )}
                </div>
                <div className="checks">
                  <CheckField label="Tomträtt" value={a.leasehold} onChange={fa('leasehold')} />
                </div>
                {a.leasehold && (
                  <div className="grid">
                    <NumberField label="Tomträttsavgäld (föreningen)" value={a.groundRentYear} onChange={fa('groundRentYear')} step={10000} suffix="kr/år" />
                    <PercentField label="Förväntad höjning" value={a.groundRentIncrease} onChange={fa('groundRentIncrease')} />
                    <NumberField label="Omförhandling om" value={a.groundRentYearsUntil} onChange={fa('groundRentYearsUntil')} suffix="år" />
                  </div>
                )}
                <div className="checks">
                  <CheckField label="Stambyte väntar" value={a.pipeRenovationPlanned} onChange={fa('pipeRenovationPlanned')} />
                </div>
                {a.pipeRenovationPlanned && (
                  <div className="grid">
                    <NumberField label="Om antal år" value={a.pipeRenovationYears} onChange={fa('pipeRenovationYears')} suffix="år" />
                    <NumberField label="Kostnad" value={a.pipeRenovationCostPerSqm} onChange={fa('pipeRenovationCostPerSqm')} step={1000} suffix="kr/kvm" />
                  </div>
                )}
                <details>
                  <summary>Typiska nivåer i området</summary>
                  <div className="grid">
                    <NumberField label="Typisk avgift" value={a.areaFeePerSqmYear} onChange={fa('areaFeePerSqmYear')} step={10} suffix="kr/kvm/år" />
                    <NumberField label="Typisk föreningsskuld" value={a.areaDebtPerSqm} onChange={fa('areaDebtPerSqm')} step={500} suffix="kr/kvm" />
                  </div>
                </details>
              </Card>
            </>
          )}

          {step === 2 && (
            <>
              <Card title="Lånet">
                <div className="grid">
                  <NumberField label="Kontantinsats" value={l.cash} onChange={fl('cash')} step={10000} suffix="kr" />
                  <PercentField label="Bolåneränta" value={l.interestRate} onChange={fl('interestRate')} />
                </div>
              </Card>
              <Card title="Hushållet">
                <p className="hint">Används för att räkna ut om bostaden klarar bankens kalkyl.</p>
                <HouseholdFields h={h} setH={setH} />
              </Card>
            </>
          )}

          <div className="step-actions">
            {step > 0 && <button className="secondary" onClick={() => setStep(step - 1)}>Tillbaka</button>}
            <button className="primary" onClick={() => setStep(step + 1)}>
              {step === RESULT_STEP - 1 ? 'Visa resultat' : 'Nästa'}
            </button>
          </div>
        </div>

        <aside className="tool-result summary" aria-label="Sammanfattning">
          <div className="card">
            <div>
              <p className="summary-title">Marknadsvärde</p>
              <div className={`big small ${market.overprice > 0 ? 'bad' : 'good'}`}>{formatKr(round10k(market.estimate))}</div>
            </div>
            <div>
              <p className="summary-title">Per månad</p>
              <div className="big small">{formatKr(cost.total)}</div>
            </div>
            <div className="summary-more">
              <p className="big-sub">Uppdateras medan du fyller i.</p>
              <Row label="Pris" value={formatKr(l.price)} />
              <Row label="Ekonomiskt värde" value={formatKr(round10k(economic.estimate))} />
              <Row label="Bolån" value={formatKr(cost.loan)} />
              <Row label="Bankens kalkyl" value={<span className={k.approved ? 'good' : 'bad'}>{k.approved ? 'Godkänd' : 'Underkänd'}</span>} />
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
