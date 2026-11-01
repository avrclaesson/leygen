/**
 * Motståndskraft: hur påverkas värde och ekonomi i en nedgång?
 *
 * Fyra delar:
 *  1. Marknaden i regionen – historiska prisfall (Mäklarstatistik, topp 2022 → botten).
 *  2. Prissegment – billigare bostäder (kr/kvm jämfört med kommunen) svänger mer.
 *     Stöds av amerikanska data; svenska data per segment saknas, så känsligheten är ett antagande.
 *  3. Föreningen – i en räntedriven nedgång höjs avgiften mer i föreningar med mer skuld
 *     än områdets typiska. Avgiftshöjningen prisas in med ca −2,5 % per 1 000 kr/mån (Wilhelmsson, KTH 2025).
 *  4. Din ekonomi – belåningsgrad och månadskostnad i scenariot.
 */
import { interestDeduction } from './rules.ts';

export interface Region {
  id: string;
  label: string;
  /** Prisfall för bostadsrätter från toppen 2022 till botten (negativt). */
  drop2022: number;
  source: string;
}

/** Svensk Mäklarstatistik via Placera 2026-10-28 (största kommunen i länet). */
export const REGIONS: Region[] = [
  { id: 'stockholm', label: 'Stockholm', drop2022: -0.12, source: 'Mäklarstatistik' },
  { id: 'malmo', label: 'Malmö', drop2022: -0.13, source: 'Mäklarstatistik' },
  { id: 'uppsala', label: 'Uppsala', drop2022: -0.15, source: 'Mäklarstatistik' },
  { id: 'goteborg', label: 'Göteborg', drop2022: -0.17, source: 'Mäklarstatistik' },
  { id: 'riket', label: 'Övriga Sverige (riket)', drop2022: -0.14, source: 'Mäklarstatistik' },
];

export interface Scenario {
  id: 'mild' | 'like2022' | 'deep';
  label: string;
  /** Marknadsrörelse som andel av regionens fall 2022. */
  marketFactor: number;
  /** Ökning av bolåneräntan i procentenheter. */
  rateShock: number;
  /** Ungefärlig historisk tid till återhämtning. */
  recovery: string;
}

export const SCENARIOS: Scenario[] = [
  { id: 'mild', label: 'Mild nedgång', marketFactor: 0.5, rateShock: 0.01, recovery: '1–2 år' },
  { id: 'like2022', label: 'Som 2022–23 (räntechock)', marketFactor: 1, rateShock: 0.03, recovery: '2–4 år (Stockholm var över toppen 2026, flera orter inte än)' },
  // 90-talskrisen: villapriserna föll ca 21 % i riket (Nordea) ⇒ 1,5 × rikets fall 2022.
  { id: 'deep', label: 'Djup kris (som 90-talet)', marketFactor: 1.5, rateShock: 0.04, recovery: 'ca 7 år (90-talet)' },
];

export interface ResilienceInput {
  price: number;
  area: number;
  loan: number;
  ownRate: number;
  monthlyFee: number;
  region: Region;
  /** Bostadens kvm-pris jämfört med kommunens median (1 = som medianen). */
  priceRatio: number;
  /** Hur mycket mer en bostad svänger per 100 % lägre relativt kvm-pris (antagande). */
  segmentSensitivity: number;
  debtPerSqm: number;
  areaDebtPerSqm: number;
  brfBindingYears: number;
  /** Prisförändring per 1 000 kr högre månadskostnad. */
  perThousandMonthly: number;
}

export interface ScenarioResult {
  scenario: Scenario;
  market: number;
  segment: number;
  association: number;
  total: number;
  valueAfter: number;
  ltvAfter: number;
  feeIncrease: number;
  ownCostIncrease: number;
  monthlyIncrease: number;
}

export function segmentBeta(priceRatio: number, sensitivity: number): number {
  return Math.min(1.5, Math.max(0.7, 1 + sensitivity * (1 - priceRatio)));
}

export function scenarioResult(r: ResilienceInput, s: Scenario): ScenarioResult {
  const market = r.region.drop2022 * s.marketFactor;
  const beta = segmentBeta(r.priceRatio, r.segmentSensitivity);
  const segment = market * (beta - 1);

  // Avgiftshöjning inom ca två år: andelen av föreningens lån som hinner räntejusteras.
  const repriced = Math.min(1, 2 / Math.max(1, r.brfBindingYears));
  const feeIncrease = (r.area * r.debtPerSqm * s.rateShock * repriced) / 12;
  // Bara skulden utöver (eller under) områdets typiska nivå – den typiska ingår redan i marknadens fall.
  const excessFee = (r.area * (r.debtPerSqm - r.areaDebtPerSqm) * s.rateShock * repriced) / 12;
  const association = (excessFee / 1000) * r.perThousandMonthly;

  const total = market + segment + association;
  const valueAfter = r.price * (1 + total);

  const before = r.loan * r.ownRate;
  const after = r.loan * (r.ownRate + s.rateShock);
  const ownCostIncrease = (after - interestDeduction(after) - (before - interestDeduction(before))) / 12;

  return {
    scenario: s,
    market,
    segment,
    association,
    total,
    valueAfter,
    ltvAfter: valueAfter > 0 ? r.loan / valueAfter : Infinity,
    feeIncrease,
    ownCostIncrease,
    monthlyIncrease: feeIncrease + ownCostIncrease,
  };
}

export type ResilienceRating = 'better' | 'same' | 'worse';

export function resilience(r: ResilienceInput) {
  const results = SCENARIOS.map((s) => scenarioResult(r, s));
  const like2022 = results.find((x) => x.scenario.id === 'like2022')!;
  const diff = like2022.total - r.region.drop2022;
  const rating: ResilienceRating = diff > 0.01 ? 'better' : diff < -0.01 ? 'worse' : 'same';
  return { results, rating, diffVsRegion: diff };
}
