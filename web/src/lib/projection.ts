/**
 * Simulering av månadskostnad över tid med osäker ränta (Monte Carlo).
 *
 * Kärnidén: räntan slår två gånger.
 *  1. På ditt eget bolån (med ränteavdrag).
 *  2. På föreningens lån, via avgiften (utan ränteavdrag). Föreningens lån har
 *     ofta längre bindningstid, så effekten kommer med fördröjning.
 */
import { RULES_2026, amortizationRate, interestDeduction } from './rules.ts';

export interface BrfEvent {
  /** År från idag (1 = om ett år). */
  year: number;
  label: string;
  /** Ny upplåning i föreningen per kvm bostadsrättsyta (t.ex. stambyte). */
  addedDebtPerSqm?: number;
  /** Direkt avgiftsändring för lägenheten i kr/mån (t.ex. höjd tomträttsavgäld). */
  feeChangeMonthly?: number;
}

export interface ProjectionInput {
  price: number;
  cash: number;
  area: number;
  /** Din bolåneränta idag (rörlig antas). */
  ownRate: number;
  /** Avgift per månad idag. */
  monthlyFee: number;
  /** Egen drift (el, uppvärmning, försäkring) per månad idag. */
  operatingMonthly: number;
  /** Föreningens räntebärande skuld per kvm bostadsrättsyta. */
  brfDebtPerSqm: number;
  /** Föreningens genomsnittsränta idag. */
  brfRate: number;
  /** Föreningens genomsnittliga räntebindning i år (styr hur snabbt räntan slår igenom). */
  brfBindingYears: number;
  /** Årlig kostnadsökning för övriga driftkostnader (inflation). */
  inflation: number;
  years: number;
  events: BrfEvent[];
}

export interface RateModel {
  /** Långsiktig nivå som bolåneräntan dras mot. */
  longRunRate: number;
  /** Hur snabbt räntan dras mot långsiktig nivå (andel per år). */
  meanReversion: number;
  /** Årlig standardavvikelse i procentenheter (0.008 = 0,8 pe). */
  volatility: number;
  floor: number;
  paths: number;
  seed: number;
}

export const DEFAULT_RATE_MODEL: RateModel = {
  longRunRate: 0.035,
  meanReversion: 0.3,
  volatility: 0.008,
  floor: 0.01,
  paths: 2000,
  seed: 42,
};

export interface YearPoint {
  year: number;
  p10: number;
  p50: number;
  p90: number;
  /** Medianvärden per komponent (kr/mån). */
  ownInterest: number;
  amortization: number;
  feeInterest: number;
  feeOther: number;
  operating: number;
  ownRate: number;
  brfRate: number;
}

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gaussian(rand: () => number) {
  const u = Math.max(rand(), 1e-12);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand());
}

const quantile = (sorted: number[], q: number) => {
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
};

interface PathYear {
  total: number;
  ownInterest: number;
  amortization: number;
  feeInterest: number;
  feeOther: number;
  operating: number;
  ownRate: number;
  brfRate: number;
}

/** Kostnad ett enskilt år givet räntor och föreningens skuld. */
function yearCost(
  input: ProjectionInput,
  t: number,
  loan: number,
  ownRate: number,
  brfRate: number,
  brfDebtPerSqm: number,
  feeOther0: number,
  feeAdjustments: number,
): PathYear {
  const yearlyInterest = loan * ownRate;
  const ownInterest = (yearlyInterest - interestDeduction(yearlyInterest)) / 12;
  const amortization = (loan * amortizationRate(loan / input.price)) / 12;
  const growth = Math.pow(1 + input.inflation, t);
  const feeInterest = (input.area * brfDebtPerSqm * brfRate) / 12;
  const feeOther = feeOther0 * growth + feeAdjustments;
  const operating = input.operatingMonthly * growth;
  return {
    total: ownInterest + amortization + feeInterest + feeOther + operating,
    ownInterest,
    amortization,
    feeInterest,
    feeOther,
    operating,
    ownRate,
    brfRate,
  };
}

export function simulate(input: ProjectionInput, model: RateModel = DEFAULT_RATE_MODEL): YearPoint[] {
  const rand = mulberry32(model.seed);
  const startLoan = Math.max(0, Math.min(input.price - input.cash, input.price * RULES_2026.maxLtv));
  // Den del av avgiften som inte är ränta (drift, underhåll, sparande).
  const feeOther0 = Math.max(0, input.monthlyFee - (input.area * input.brfDebtPerSqm * input.brfRate) / 12);
  const repricing = 1 / Math.max(1, input.brfBindingYears);

  const perYear: PathYear[][] = Array.from({ length: input.years + 1 }, () => []);

  for (let p = 0; p < model.paths; p++) {
    let ownRate = input.ownRate;
    let brfRate = input.brfRate;
    let loan = startLoan;
    let brfDebt = input.brfDebtPerSqm;
    let feeAdj = 0;
    for (let t = 0; t <= input.years; t++) {
      if (t > 0) {
        ownRate = Math.max(
          model.floor,
          ownRate + model.meanReversion * (model.longRunRate - ownRate) + model.volatility * gaussian(rand),
        );
        // Föreningens lån räntejusteras successivt mot marknadsräntan.
        brfRate = brfRate + repricing * (ownRate - brfRate);
        for (const e of input.events) {
          if (e.year === t) {
            brfDebt += e.addedDebtPerSqm ?? 0;
            feeAdj += e.feeChangeMonthly ?? 0;
          }
        }
      }
      const y = yearCost(input, t, loan, ownRate, brfRate, brfDebt, feeOther0, feeAdj);
      perYear[t].push(y);
      loan = Math.max(0, loan - y.amortization * 12);
    }
  }

  return perYear.map((ys, year) => {
    const pick = (k: keyof PathYear) => quantile(ys.map((y) => y[k]).sort((a, b) => a - b), 0.5);
    const totals = ys.map((y) => y.total).sort((a, b) => a - b);
    return {
      year,
      p10: quantile(totals, 0.1),
      p50: quantile(totals, 0.5),
      p90: quantile(totals, 0.9),
      ownInterest: pick('ownInterest'),
      amortization: pick('amortization'),
      feeInterest: pick('feeInterest'),
      feeOther: pick('feeOther'),
      operating: pick('operating'),
      ownRate: pick('ownRate'),
      brfRate: pick('brfRate'),
    };
  });
}

export interface RateShock {
  /** Extra kostnad per månad på eget lån (efter ränteavdrag). */
  ownLoan: number;
  /** Extra avgift per månad när föreningens lån räntejusterats fullt ut (inget ränteavdrag). */
  viaFee: number;
  /** Andel av föreningens effekt som slår igenom första året. */
  viaFeeFirstYear: number;
}

/** Vad kostar +1 procentenhet ränta – på ditt lån och via föreningen? */
export function rateShock(input: ProjectionInput, shock = 0.01): RateShock {
  const loan = Math.max(0, Math.min(input.price - input.cash, input.price * RULES_2026.maxLtv));
  const before = loan * input.ownRate;
  const after = loan * (input.ownRate + shock);
  const ownLoan = (after - interestDeduction(after) - (before - interestDeduction(before))) / 12;
  const viaFee = (input.area * input.brfDebtPerSqm * shock) / 12;
  return { ownLoan, viaFee, viaFeeFirstYear: viaFee / Math.max(1, input.brfBindingYears) };
}
