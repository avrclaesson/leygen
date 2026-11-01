import { describe, expect, it } from 'vitest';
import { amortizationRate, interestDeduction, livingCost } from './rules';
import { kalp, loanFor, maxPrice, monthlyCost, saleProceeds, sensitivity, type Household, type Purchase } from './mortgage';
import { analyzeBrf, effectivePrice } from './brf';

const household: Household = {
  netIncomeMonthly: 60_000,
  grossIncomeYearly: 1_000_000,
  adults: 2,
  children: 1,
  cars: 0,
  otherDebtMonthly: 0,
  otherDebtTotal: 0,
};

const purchase: Purchase = {
  type: 'bostadsratt',
  price: 4_000_000,
  cash: 600_000,
  monthlyFee: 4_000,
  operatingMonthly: 800,
  interestRate: 0.03,
};

describe('rules', () => {
  it('amortization follows LTV steps', () => {
    expect(amortizationRate(0.85)).toBe(0.02);
    expect(amortizationRate(0.7)).toBe(0.01);
    expect(amortizationRate(0.6)).toBe(0.01);
    expect(amortizationRate(0.5)).toBe(0);
  });

  it('interest deduction is 30 % up to 100k, 21 % above', () => {
    expect(interestDeduction(50_000)).toBe(15_000);
    expect(interestDeduction(200_000)).toBeCloseTo(30_000 + 21_000);
  });

  it('living cost sums schablon', () => {
    expect(livingCost(2, 1, 0)).toBe(13_000 + 9_000 + 5_000);
  });
});

describe('mortgage', () => {
  it('caps loan at 90 % LTV', () => {
    expect(loanFor(4_000_000, 100_000)).toBe(3_600_000);
    expect(loanFor(4_000_000, 600_000)).toBe(3_400_000);
  });

  it('computes monthly cost', () => {
    const c = monthlyCost(purchase);
    expect(c.loan).toBe(3_400_000);
    expect(c.amortizationRate).toBe(0.02);
    expect(c.interest).toBeCloseTo((3_400_000 * 0.03) / 12);
    // 102 000 kr ränta/år → avdrag 30 000 + 420 = 30 420
    expect(c.interestAfterDeduction).toBeCloseTo((102_000 - 30_420) / 12);
    expect(c.amortization).toBeCloseTo((3_400_000 * 0.02) / 12);
    expect(c.total).toBeCloseTo(c.interestAfterDeduction + c.amortization + 4_800);
  });

  it('computes KALP with stress rate', () => {
    const r = kalp(household, purchase);
    const expected = 60_000 - (3_400_000 * 0.07) / 12 - (3_400_000 * 0.02) / 12 - 4_800 - 27_000;
    expect(r.kalp).toBeCloseTo(expected);
    expect(r.debtToIncome).toBeCloseTo(3.4);
  });

  it('max price is consistent with KALP', () => {
    const r = maxPrice(household, { ...purchase });
    expect(r.kalp.approved).toBe(true);
    expect(kalp(household, { ...purchase, price: r.maxPrice + 10_000 }).approved).toBe(false);
  });

  it('max price limited by cash when cash is low', () => {
    const r = maxPrice(household, { ...purchase, cash: 200_000 });
    expect(r.limitedBy).toBe('kontantinsats');
    expect(r.maxPrice).toBeLessThanOrEqual(2_000_000);
  });

  it('sensitivity grows with rate and fee', () => {
    const t = sensitivity(purchase);
    expect(t.cells[1][0]).toBeGreaterThan(t.cells[0][0]);
    expect(t.cells[0][1]).toBeGreaterThan(t.cells[0][0]);
  });

  it('computes sale proceeds and tax', () => {
    const r = saleProceeds({
      salePrice: 5_000_000,
      purchasePrice: 4_000_000,
      improvements: 100_000,
      brokerFee: 75_000,
      otherCosts: 25_000,
      remainingLoan: 3_000_000,
    });
    expect(r.gain).toBe(800_000);
    expect(r.tax).toBeCloseTo(176_000);
    expect(r.netProceeds).toBeCloseTo(5_000_000 - 100_000 - 3_000_000 - 176_000);
  });
});

describe('brf', () => {
  const base = {
    residentialArea: 5_000,
    otherArea: 500,
    interestBearingDebt: 22_000_000,
    yearlyFees: 3_500_000,
    totalRevenue: 3_900_000,
    netResult: -200_000,
    depreciation: 900_000,
    plannedMaintenance: 300_000,
    energyCosts: 1_000_000,
    cash: 2_000_000,
    leasehold: false,
    genuineHousingCoop: true,
    buildYear: 1965,
    lastPipeRenovation: 2005,
  };

  it('computes key metrics', () => {
    const a = analyzeBrf(base, 2026);
    const m = Object.fromEntries(a.metrics.map((x) => [x.key, x]));
    expect(m.debtPerSqm.value).toBeCloseTo(4_000);
    expect(m.debtPerSqm.rating).toBe('good');
    expect(m.savingsPerSqm.value).toBeCloseTo(1_000_000 / 5_500);
    expect(m.savingsPerSqm.rating).toBe('ok');
    expect(m.interestSensitivity.value).toBeCloseTo((220_000 / 3_500_000) * 100);
    expect(a.warnings).toHaveLength(0);
    expect(a.score).toBeGreaterThan(50);
  });

  it('warns about leasehold and old pipes', () => {
    const a = analyzeBrf({ ...base, leasehold: true, lastPipeRenovation: undefined }, 2026);
    expect(a.warnings.length).toBe(2);
  });

  it('effective price adds share of debt', () => {
    expect(effectivePrice(3_000_000, 60, 5_000).effectivePrice).toBe(3_300_000);
  });
});
