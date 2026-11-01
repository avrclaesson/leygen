/**
 * Samlad analys: en bostad (från annonsen) + föreningens årsredovisning →
 * indata till BRF-analys, värdering, månadskostnad och KALP.
 */
import type { BrfInput } from './brf.ts';
import type { ExtractedBrf } from './brfExtractionSchema.ts';
import type { Household, Purchase } from './mortgage.ts';
import type { ProjectionInput } from './projection.ts';
import type { ValuationInput } from './valuation.ts';

export interface Listing {
  address: string;
  price: number;
  area: number;
  monthlyFee: number;
  floor: number;
  hasBalcony: boolean;
  hasElevator: boolean;
  directElectricHeating: boolean;
  /** Egen uppvärmningskostnad per år (vid direktverkande el). */
  ownHeatingCostYear: number;
  /** Övrig egen drift per månad: hushållsel, försäkring, bredband. */
  otherOperatingMonthly: number;
  /** Jämförelsepris för liknande lägenheter i området. */
  areaPricePerSqm: number;
  location: 'central' | 'suburb';
  cash: number;
  interestRate: number;
}

/** Föreningsuppgifter och risker. Förifylls från årsredovisningen, kan ändras av användaren. */
export interface Association {
  debtPerSqm: number;
  brfRate: number;
  brfBindingYears: number;
  brfResidentialArea: number;
  leasehold: boolean;
  groundRentYear: number;
  groundRentIncrease: number;
  groundRentYearsUntil: number;
  pipeRenovationPlanned: boolean;
  pipeRenovationYears: number;
  pipeRenovationCostPerSqm: number;
  rentalUnits: number;
  rentalSalePrice: number;
  rentalYearlyRent: number;
  /** Typiska nivåer i området, för jämförelse. */
  areaFeePerSqmYear: number;
  areaDebtPerSqm: number;
}

export const DEFAULT_ASSOCIATION: Association = {
  debtPerSqm: 6_000,
  brfRate: 0.03,
  brfBindingYears: 3,
  brfResidentialArea: 3_000,
  leasehold: false,
  groundRentYear: 0,
  groundRentIncrease: 0.5,
  groundRentYearsUntil: 5,
  pipeRenovationPlanned: false,
  pipeRenovationYears: 5,
  pipeRenovationCostPerSqm: 15_000,
  rentalUnits: 0,
  rentalSalePrice: 0,
  rentalYearlyRent: 0,
  areaFeePerSqmYear: 750,
  areaDebtPerSqm: 6_000,
};

/** Förifyller föreningsuppgifter från en inläst årsredovisning. Okända fält behåller tidigare värden. */
export function associationFromExtraction(e: ExtractedBrf, base: Association, currentYear: number): Association {
  const a: Association = { ...base };
  if (e.interestBearingDebt !== null && e.residentialArea) {
    a.debtPerSqm = Math.round(e.interestBearingDebt / e.residentialArea);
  }
  if (e.residentialArea) a.brfResidentialArea = e.residentialArea;
  if (e.averageInterestRate !== null) a.brfRate = e.averageInterestRate;
  if (e.interestBearingDebt && e.debtMaturingWithin12Months !== null) {
    // Andel som räntejusteras inom ett år ≈ 1 / genomsnittlig bindningstid.
    const share = e.debtMaturingWithin12Months / e.interestBearingDebt;
    a.brfBindingYears = share > 0 ? Math.min(5, Math.max(1, Math.round(1 / share))) : 5;
  }
  if (e.leasehold !== null) a.leasehold = e.leasehold;
  if (e.groundRent !== null && e.groundRent > 0) a.groundRentYear = e.groundRent;
  if (e.groundRentRenegotiationYear !== null) a.groundRentYearsUntil = Math.max(1, e.groundRentRenegotiationYear - currentYear);
  if (e.rentalApartmentCount !== null) a.rentalUnits = e.rentalApartmentCount;

  if (e.plannedPipeRenovationYear !== null) {
    // Planerat stambyte enligt årsredovisningen går före tumregeln.
    a.pipeRenovationPlanned = true;
    a.pipeRenovationYears = Math.max(1, e.plannedPipeRenovationYear - currentYear);
    if (e.plannedPipeRenovationCost && e.residentialArea) {
      a.pipeRenovationCostPerSqm = Math.round(e.plannedPipeRenovationCost / e.residentialArea);
    }
  } else if (e.buildYear !== null && e.buildYear < 1990) {
    const since = currentYear - (e.lastPipeRenovation ?? e.buildYear);
    // Stammar håller ca 50 år; föreslå stambyte om det inte är gjort på länge.
    a.pipeRenovationPlanned = since >= 40;
    a.pipeRenovationYears = Math.max(1, 50 - since);
  }
  return a;
}

export function brfInputFromExtraction(e: ExtractedBrf): BrfInput | null {
  if (!e.residentialArea || e.interestBearingDebt === null || e.yearlyFees === null) return null;
  return {
    residentialArea: e.residentialArea,
    otherArea: e.otherArea ?? 0,
    interestBearingDebt: e.interestBearingDebt,
    yearlyFees: e.yearlyFees,
    totalRevenue: e.totalRevenue ?? e.yearlyFees,
    netResult: e.netResult ?? 0,
    depreciation: e.depreciation ?? 0,
    plannedMaintenance: e.plannedMaintenance ?? 0,
    energyCosts: e.energyCosts ?? 0,
    cash: e.cash ?? 0,
    leasehold: e.leasehold ?? false,
    genuineHousingCoop: e.genuineHousingCoop ?? true,
    buildYear: e.buildYear ?? undefined,
    lastPipeRenovation: e.lastPipeRenovation ?? undefined,
  };
}

export function valuationInput(l: Listing, a: Association): ValuationInput {
  return {
    areaPricePerSqm: l.areaPricePerSqm,
    area: l.area,
    askingPrice: l.price,
    discountRate: 0.05,
    feePerSqmYear: l.area > 0 ? (l.monthlyFee * 12) / l.area : 0,
    areaFeePerSqmYear: a.areaFeePerSqmYear,
    debtPerSqm: a.debtPerSqm,
    areaDebtPerSqm: a.areaDebtPerSqm,
    brfRate: a.brfRate,
    directElectricHeating: l.directElectricHeating,
    ownHeatingCostYear: l.directElectricHeating ? l.ownHeatingCostYear : 0,
    pipeRenovationPlanned: a.pipeRenovationPlanned,
    pipeRenovationYears: a.pipeRenovationYears,
    pipeRenovationCostPerSqm: a.pipeRenovationCostPerSqm,
    pipeRenovationOwnValueShare: 0.3,
    pipeRenovationAlreadyInDebt: false,
    leasehold: a.leasehold,
    groundRentYear: a.groundRentYear,
    groundRentIncrease: a.groundRentIncrease,
    groundRentYearsUntil: a.groundRentYearsUntil,
    brfResidentialArea: a.brfResidentialArea,
    rentalUnits: a.rentalUnits,
    rentalSalePrice: a.rentalSalePrice,
    rentalYearlyRent: a.rentalYearlyRent,
    rentalFutureFeeYear: a.rentalYearlyRent * 0.5,
    rentalConversionProbability: 0.5,
    rentalYearsUntil: 3,
    groundFloor: l.floor <= 0,
    groundFloorPct: -0.05,
    noBalcony: !l.hasBalcony,
    noBalconyPct: -0.02,
    noElevatorHighFloor: !l.hasElevator && l.floor >= 3,
    noElevatorPct: -0.05,
    renovationNeed: 0,
  };
}

export function operatingMonthly(l: Listing): number {
  return l.otherOperatingMonthly + (l.directElectricHeating ? l.ownHeatingCostYear / 12 : 0);
}

export function purchaseInput(l: Listing): Purchase {
  return {
    type: 'bostadsratt',
    price: l.price,
    cash: l.cash,
    monthlyFee: l.monthlyFee,
    operatingMonthly: operatingMonthly(l),
    interestRate: l.interestRate,
  };
}

export function projectionInput(l: Listing, a: Association): ProjectionInput {
  const events: ProjectionInput['events'] = [];
  if (a.pipeRenovationPlanned) {
    events.push({ year: a.pipeRenovationYears, label: 'Stambyte', addedDebtPerSqm: a.pipeRenovationCostPerSqm });
  }
  if (a.leasehold && a.groundRentYear > 0 && a.brfResidentialArea > 0) {
    events.push({
      year: Math.max(1, a.groundRentYearsUntil),
      label: 'Ny tomträttsavgäld',
      feeChangeMonthly: (a.groundRentYear * a.groundRentIncrease * (l.area / a.brfResidentialArea)) / 12,
    });
  }
  return {
    price: l.price,
    cash: l.cash,
    area: l.area,
    ownRate: l.interestRate,
    monthlyFee: l.monthlyFee,
    operatingMonthly: operatingMonthly(l),
    brfDebtPerSqm: a.debtPerSqm,
    brfRate: a.brfRate,
    brfBindingYears: a.brfBindingYears,
    inflation: 0.02,
    years: 10,
    events,
  };
}

export type { Household };
