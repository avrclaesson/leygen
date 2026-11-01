import { RULES_2026, amortizationRate, interestDeduction, livingCost, type Rules } from './rules';

export type PropertyType = 'bostadsratt' | 'villa';

export interface Household {
  /** Summa nettoinkomst (efter skatt) per månad för hushållet. */
  netIncomeMonthly: number;
  /** Summa bruttoinkomst per år (för skuldkvot). */
  grossIncomeYearly: number;
  adults: number;
  children: number;
  cars: number;
  /** Övriga lån/krediter: månadskostnad. */
  otherDebtMonthly: number;
  /** Övriga lån: totalt belopp (räknas in i skuldkvot). */
  otherDebtTotal: number;
}

export interface Purchase {
  type: PropertyType;
  price: number;
  /** Eget kapital som används (kontantinsats + ev. buffert för kostnader). */
  cash: number;
  /** Månadsavgift till BRF (0 för villa). */
  monthlyFee: number;
  /** Drift: el, värme, vatten, försäkring m.m. per månad. */
  operatingMonthly: number;
  /** Faktisk ränta på bolånet. */
  interestRate: number;
  /** Befintliga pantbrev (villa) – minskar pantbrevskostnaden. */
  existingMortgageDeeds?: number;
}

export interface MonthlyCost {
  loan: number;
  ltv: number;
  amortizationRate: number;
  interest: number;
  interestAfterDeduction: number;
  amortization: number;
  fee: number;
  operating: number;
  /** Total utgift per månad inkl. amortering (efter ränteavdrag). */
  total: number;
  /** Kostnad exkl. amortering (amortering är ett sparande). */
  totalExclAmortization: number;
}

export function loanFor(price: number, cash: number, rules: Rules = RULES_2026): number {
  return Math.max(0, Math.min(price - cash, price * rules.maxLtv));
}

/** Engångskostnader vid köp (lagfart/pantbrev för villa, schablon för BRF). */
export function transactionCosts(p: Pick<Purchase, 'type' | 'price' | 'cash' | 'existingMortgageDeeds'>, rules: Rules = RULES_2026): number {
  if (p.type === 'bostadsratt') {
    // Pantsättningsavgift till föreningen (≈1 % av prisbasbeloppet).
    return 600;
  }
  const loan = loanFor(p.price, p.cash, rules);
  const newDeeds = Math.max(0, loan - (p.existingMortgageDeeds ?? 0));
  const titleDeed = p.price * rules.titleDeed.rate + rules.titleDeed.fee;
  const mortgageDeed = newDeeds > 0 ? newDeeds * rules.mortgageDeed.rate + rules.mortgageDeed.fee : 0;
  return Math.round(titleDeed + mortgageDeed);
}

export function monthlyCost(p: Purchase, rules: Rules = RULES_2026): MonthlyCost {
  const loan = loanFor(p.price, p.cash, rules);
  const ltv = p.price > 0 ? loan / p.price : 0;
  const amortRate = amortizationRate(ltv, rules);
  const yearlyInterest = loan * p.interestRate;
  const interest = yearlyInterest / 12;
  const interestAfterDeduction = (yearlyInterest - interestDeduction(yearlyInterest, rules)) / 12;
  const amortization = (loan * amortRate) / 12;
  const totalExclAmortization = interestAfterDeduction + p.monthlyFee + p.operatingMonthly;
  return {
    loan,
    ltv,
    amortizationRate: amortRate,
    interest,
    interestAfterDeduction,
    amortization,
    fee: p.monthlyFee,
    operating: p.operatingMonthly,
    total: totalExclAmortization + amortization,
    totalExclAmortization,
  };
}

export interface KalpOptions {
  stressRate: number;
  /** Om ränteavdrag ska räknas med i KALP (bankerna gör olika). */
  includeDeduction: boolean;
  maxDebtToIncome: number;
}

export const DEFAULT_KALP: KalpOptions = {
  stressRate: RULES_2026.stressRate,
  includeDeduction: false,
  maxDebtToIncome: RULES_2026.maxDebtToIncome,
};

export interface KalpResult {
  income: number;
  stressedInterest: number;
  amortization: number;
  housing: number;
  living: number;
  otherDebt: number;
  /** Kvar att leva på per månad. */
  kalp: number;
  debtToIncome: number;
  cashRequired: number;
  approvedByKalp: boolean;
  approvedByLtv: boolean;
  approvedByDti: boolean;
  approved: boolean;
}

export function kalp(h: Household, p: Purchase, opts: KalpOptions = DEFAULT_KALP, rules: Rules = RULES_2026): KalpResult {
  const loan = loanFor(p.price, p.cash, rules);
  const ltv = p.price > 0 ? loan / p.price : 0;
  const yearlyStress = loan * opts.stressRate;
  const stressedInterest =
    (opts.includeDeduction ? yearlyStress - interestDeduction(yearlyStress, rules) : yearlyStress) / 12;
  const amortization = (loan * amortizationRate(ltv, rules)) / 12;
  const housing = p.monthlyFee + p.operatingMonthly;
  const living = livingCost(h.adults, h.children, h.cars, rules);
  const value =
    h.netIncomeMonthly - stressedInterest - amortization - housing - living - h.otherDebtMonthly;
  const debtToIncome = h.grossIncomeYearly > 0 ? (loan + h.otherDebtTotal) / h.grossIncomeYearly : Infinity;
  const cashRequired = p.price * (1 - rules.maxLtv) + transactionCosts(p, rules);
  const approvedByKalp = value >= 0;
  const approvedByLtv = p.cash >= cashRequired;
  const approvedByDti = debtToIncome <= opts.maxDebtToIncome;
  return {
    income: h.netIncomeMonthly,
    stressedInterest,
    amortization,
    housing,
    living,
    otherDebt: h.otherDebtMonthly,
    kalp: value,
    debtToIncome,
    cashRequired,
    approvedByKalp,
    approvedByLtv,
    approvedByDti,
    approved: approvedByKalp && approvedByLtv && approvedByDti,
  };
}

export type LimitingFactor = 'kontantinsats' | 'kalp' | 'skuldkvot';

export interface MaxPriceResult {
  maxPrice: number;
  limitedBy: LimitingFactor;
  loan: number;
  kalp: KalpResult;
}

/**
 * Högsta pris hushållet kan köpa för, givet kontantinsats och KALP.
 * Binärsökning eftersom amorteringstakten ändras stegvis med belåningsgraden.
 */
export function maxPrice(
  h: Household,
  base: Omit<Purchase, 'price'>,
  opts: KalpOptions = DEFAULT_KALP,
  rules: Rules = RULES_2026,
): MaxPriceResult {
  const check = (price: number) => kalp(h, { ...base, price }, opts, rules);
  let lo = 0;
  let hi = 100_000_000;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (check(mid).approved) lo = mid;
    else hi = mid;
  }
  const price = Math.floor(lo / 1000) * 1000;
  const justAbove = check(price + 1000);
  const limitedBy: LimitingFactor = !justAbove.approvedByLtv
    ? 'kontantinsats'
    : !justAbove.approvedByDti
      ? 'skuldkvot'
      : 'kalp';
  return { maxPrice: price, limitedBy, loan: loanFor(price, base.cash, rules), kalp: check(price) };
}

export interface SensitivityTable {
  rates: number[];
  feeChanges: number[];
  /** cells[i][j] = månadskostnad vid rates[i] och feeChanges[j]. */
  cells: number[][];
}

/** Månadskostnad (inkl. amortering, efter ränteavdrag) för olika räntor och avgiftshöjningar. */
export function sensitivity(
  p: Purchase,
  rates = [0.02, 0.03, 0.04, 0.05, 0.06, 0.07],
  feeChanges = [0, 0.1, 0.2, 0.3],
  rules: Rules = RULES_2026,
): SensitivityTable {
  const cells = rates.map((r) =>
    feeChanges.map((f) => monthlyCost({ ...p, interestRate: r, monthlyFee: p.monthlyFee * (1 + f) }, rules).total),
  );
  return { rates, feeChanges, cells };
}

export interface Sale {
  salePrice: number;
  purchasePrice: number;
  /** Förbättringsutgifter (renoveringar) som får dras av. */
  improvements: number;
  /** Mäklararvode i kr. */
  brokerFee: number;
  /** Övriga försäljningskostnader (styling, foto m.m.). */
  otherCosts: number;
  /** Kvarvarande bolån som löses vid försäljning. */
  remainingLoan: number;
  /** Kapitaltillskott vid köp (endast BRF) – avdragsgillt. */
  capitalContribution?: number;
}

export interface SaleResult {
  gain: number;
  tax: number;
  /** Pengar kvar efter lösen av lån och skatt. */
  netProceeds: number;
}

export function saleProceeds(s: Sale, rules: Rules = RULES_2026): SaleResult {
  const gain =
    s.salePrice -
    s.purchasePrice -
    s.improvements -
    s.brokerFee -
    s.otherCosts -
    (s.capitalContribution ?? 0);
  const tax = Math.max(0, gain) * rules.capitalGainsTax;
  const netProceeds = s.salePrice - s.brokerFee - s.otherCosts - s.remainingLoan - tax;
  return { gain, tax, netProceeds };
}
