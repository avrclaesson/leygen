import { describe, expect, it } from 'vitest';
import { rateShock, simulate, type ProjectionInput } from './projection';
import { valuate, type ValuationInput } from './valuation';

const input: ProjectionInput = {
  price: 3_000_000,
  cash: 450_000,
  area: 60,
  ownRate: 0.03,
  monthlyFee: 3_500,
  operatingMonthly: 800,
  brfDebtPerSqm: 12_000,
  brfRate: 0.025,
  brfBindingYears: 3,
  inflation: 0.02,
  years: 10,
  events: [],
};

describe('projection', () => {
  it('starts at today’s cost with no spread', () => {
    const [y0] = simulate(input);
    expect(y0.p10).toBeCloseTo(y0.p90);
    expect(y0.feeInterest).toBeCloseTo((60 * 12_000 * 0.025) / 12);
    expect(y0.feeInterest + y0.feeOther).toBeCloseTo(3_500);
  });

  it('widens the band over time and is deterministic', () => {
    const a = simulate(input);
    const b = simulate(input);
    expect(a[10].p90 - a[10].p10).toBeGreaterThan(a[1].p90 - a[1].p10);
    expect(a[10].p50).toBe(b[10].p50);
  });

  it('adds BRF debt events to the fee', () => {
    const base = simulate(input);
    const withPipes = simulate({ ...input, events: [{ year: 3, label: 'Stambyte', addedDebtPerSqm: 15_000 }] });
    expect(withPipes[2].p50).toBeCloseTo(base[2].p50);
    expect(withPipes[3].feeInterest).toBeGreaterThan(base[3].feeInterest + 1_000);
  });

  it('rate shock hits both own loan and fee', () => {
    const s = rateShock(input);
    // 76 500 → 102 000 kr ränta/år; avdraget sjunker till 21 % över 100 000 kr.
    expect(s.ownLoan).toBeCloseTo((102_000 - 30_420 - (76_500 - 22_950)) / 12);
    expect(s.viaFee).toBeCloseTo((60 * 12_000 * 0.01) / 12);
    expect(s.viaFeeFirstYear).toBeCloseTo(s.viaFee / 3);
  });
});

const v: ValuationInput = {
  areaPricePerSqm: 60_000, area: 60, askingPrice: 3_600_000, discountRate: 0.05,
  feePerSqmYear: 700, areaFeePerSqmYear: 700, debtPerSqm: 6_000, areaDebtPerSqm: 6_000, brfRate: 0.03,
  directElectricHeating: false, ownHeatingCostYear: 0,
  pipeRenovationPlanned: false, pipeRenovationYears: 0, pipeRenovationCostPerSqm: 0, pipeRenovationOwnValueShare: 0, pipeRenovationAlreadyInDebt: false,
  leasehold: false, groundRentYear: 0, groundRentIncrease: 0, groundRentYearsUntil: 0, brfResidentialArea: 3_000,
  rentalUnits: 0, rentalSalePrice: 0, rentalYearlyRent: 0, rentalFutureFeeYear: 0, rentalConversionProbability: 0, rentalYearsUntil: 0,
  groundFloor: false, groundFloorPct: -0.05, noBalcony: false, noBalconyPct: -0.03, noElevatorHighFloor: false, noElevatorPct: -0.05, renovationNeed: 0,
};

describe('valuation', () => {
  it('equals area price for an average apartment', () => {
    const r = valuate(v);
    expect(r.estimate).toBe(3_600_000);
    expect(r.adjustments).toHaveLength(0);
  });

  it('subtracts extra BRF debt krona for krona', () => {
    const r = valuate({ ...v, debtPerSqm: 10_000, feePerSqmYear: 700 + 4_000 * 0.03 });
    expect(r.adjustments.find((a) => a.key === 'debt')!.amount).toBe(-240_000);
    // Högre avgift som bara beror på räntan ska inte dras två gånger.
    expect(r.adjustments.find((a) => a.key === 'fee')).toBeUndefined();
  });

  it('capitalizes direct electric heating', () => {
    // Avgiften är 130 kr/kvm lägre eftersom värmen inte ingår; egen elkostnad 12 000 kr/år.
    const r = valuate({ ...v, directElectricHeating: true, feePerSqmYear: 570, ownHeatingCostYear: 12_000 });
    const total = r.adjustments.reduce((s, a) => s + a.amount, 0);
    expect(total).toBeCloseTo(-(12_000 - 130 * 60) / 0.05);
  });

  it('values sellable rentals and discounts leasehold', () => {
    const r = valuate({
      ...v,
      rentalUnits: 2, rentalSalePrice: 2_000_000, rentalYearlyRent: 80_000, rentalFutureFeeYear: 40_000,
      rentalConversionProbability: 0.5, rentalYearsUntil: 0,
      leasehold: true, groundRentYear: 300_000, groundRentIncrease: 1, groundRentYearsUntil: 0,
    });
    const share = 60 / 3_000;
    expect(r.adjustments.find((a) => a.key === 'rentals')!.amount).toBeCloseTo((2_000_000 - 40_000 / 0.05) * 2 * 0.5 * share);
    expect(r.adjustments.find((a) => a.key === 'leasehold')!.amount).toBeCloseTo(-(300_000 * share) / 0.05);
  });
});
