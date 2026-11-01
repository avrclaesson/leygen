/**
 * Regelverk och schabloner för bolån i Sverige (gäller från 1 april 2026).
 *
 * Alla värden är standardvärden som användaren kan ändra i gränssnittet.
 * Verifiera mot Finansinspektionen, Konsumentverket och respektive bank
 * innan beslut fattas.
 */
export const RULES_2026 = {
  /** Bolånetak: max belåningsgrad vid köp (lagen 2026:226). */
  maxLtv: 0.9,
  /** Amorteringskrav baserat på belåningsgrad. Skärpt krav (skuldkvot > 4,5) slopat 2026-04-01. */
  amortization: [
    { ltvAbove: 0.7, rate: 0.02 },
    { ltvAbove: 0.5, rate: 0.01 },
  ],
  /** Kalkylränta (stressränta) som banker typiskt använder i KALP. */
  stressRate: 0.07,
  /** Många banker lånar inte ut mer än ca 5,5 ggr bruttoårsinkomsten. */
  maxDebtToIncome: 5.5,
  /** Ränteavdrag: 30 % upp till 100 000 kr räntekostnad/år, 21 % därutöver. */
  interestDeduction: { rate: 0.3, threshold: 100_000, rateAbove: 0.21 },
  /** Skatt på vinst vid försäljning av privatbostad: 22/30 av vinsten × 30 % = 22 %. */
  capitalGainsTax: 0.22,
  /** Schablon för levnadskostnader per månad (ungefärliga nivåer 2026, ej Konsumentverkets officiella tabell). */
  livingCosts: {
    firstAdult: 13_000,
    additionalAdult: 9_000,
    child: 5_000,
    car: 4_000,
  },
  /** Lagfart (endast äganderätt): 1,5 % av köpeskillingen + expeditionsavgift. */
  titleDeed: { rate: 0.015, fee: 825 },
  /** Pantbrev (endast äganderätt): 2 % av nya pantbrevsbelopp + expeditionsavgift. */
  mortgageDeed: { rate: 0.02, fee: 375 },
} as const;

export type Rules = typeof RULES_2026;

/** Amorteringstakt (andel per år) givet belåningsgrad. */
export function amortizationRate(ltv: number, rules: Rules = RULES_2026): number {
  for (const step of rules.amortization) {
    if (ltv > step.ltvAbove) return step.rate;
  }
  return 0;
}

/** Skattereduktion för räntekostnader per år. */
export function interestDeduction(yearlyInterest: number, rules: Rules = RULES_2026): number {
  const { rate, threshold, rateAbove } = rules.interestDeduction;
  const interest = Math.max(0, yearlyInterest);
  if (interest <= threshold) return interest * rate;
  return threshold * rate + (interest - threshold) * rateAbove;
}

export function livingCost(
  adults: number,
  children: number,
  cars: number,
  rules: Rules = RULES_2026,
): number {
  const lc = rules.livingCosts;
  const adultCost = adults <= 0 ? 0 : lc.firstAdult + (adults - 1) * lc.additionalAdult;
  return adultCost + children * lc.child + cars * lc.car;
}
