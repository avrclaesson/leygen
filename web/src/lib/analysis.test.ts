import { describe, expect, it } from 'vitest';
import { DEFAULT_ASSOCIATION, associationFromExtraction, brfInputFromExtraction, projectionInput, valuationInput, type Listing } from './analysis';
import { DEMO_EXTRACTION } from './demoExtraction';

const listing: Listing = {
  address: 'Testgatan 1', price: 3_400_000, area: 60, monthlyFee: 3_300, floor: 0, hasBalcony: false, hasElevator: false,
  directElectricHeating: true, ownHeatingCostYear: 12_000, otherOperatingMonthly: 600, areaPricePerSqm: 58_000,
  location: 'suburb', cash: 500_000, interestRate: 0.03,
};

describe('analysis', () => {
  it('derives association data from an annual report', () => {
    const a = associationFromExtraction(DEMO_EXTRACTION, DEFAULT_ASSOCIATION, 2026);
    expect(a.debtPerSqm).toBe(Math.round(26_400_000 / 2_400));
    expect(a.brfRate).toBe(0.0285);
    expect(a.brfBindingYears).toBe(3); // 9 av 26,4 Mkr förfaller inom ett år
    expect(a.leasehold).toBe(true);
    // Planerat stambyte 2030 för 36 Mkr enligt årsredovisningen
    expect(a.pipeRenovationPlanned).toBe(true);
    expect(a.pipeRenovationYears).toBe(4);
    expect(a.pipeRenovationCostPerSqm).toBe(15_000);
    expect(a.groundRentYear).toBe(280_000);
    expect(a.groundRentYearsUntil).toBe(5);
    expect(a.rentalUnits).toBe(2);
  });

  it('falls back to a rule of thumb for old buildings without a known plan', () => {
    const a = associationFromExtraction({ ...DEMO_EXTRACTION, plannedPipeRenovationYear: null }, DEFAULT_ASSOCIATION, 2026);
    expect(a.pipeRenovationPlanned).toBe(true); // byggt 1961, inget känt stambyte
    expect(a.pipeRenovationYears).toBe(1);
  });

  it('builds BRF analysis input', () => {
    const b = brfInputFromExtraction(DEMO_EXTRACTION)!;
    expect(b.residentialArea).toBe(2_400);
    expect(brfInputFromExtraction({ ...DEMO_EXTRACTION, yearlyFees: null })).toBeNull();
  });

  it('maps listing traits into valuation and projection', () => {
    const a = { ...DEFAULT_ASSOCIATION, pipeRenovationPlanned: true, leasehold: true, groundRentYear: 300_000 };
    const v = valuationInput(listing, a);
    expect(v.groundFloor).toBe(true);
    expect(v.noBalcony).toBe(true);
    expect(v.noElevatorHighFloor).toBe(false);
    expect(v.feePerSqmYear).toBe(660);
    const p = projectionInput(listing, a);
    expect(p.operatingMonthly).toBe(1_600);
    expect(p.events.map((e) => e.label)).toEqual(['Stambyte', 'Ny tomträttsavgäld']);
  });
});
