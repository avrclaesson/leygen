/** Mappning av extraherad årsredovisningsdata till BRF-analysens inmatning. */
import type { BrfInput } from './brf.ts';
import type { ExtractedBrf } from './brfExtractionSchema.ts';

export type { ExtractedBrf };

const NUMERIC_KEYS = [
  'residentialArea',
  'otherArea',
  'interestBearingDebt',
  'yearlyFees',
  'totalRevenue',
  'netResult',
  'depreciation',
  'plannedMaintenance',
  'energyCosts',
  'cash',
] as const satisfies readonly (keyof BrfInput & keyof ExtractedBrf)[];

/**
 * Slår ihop extraherade värden med befintlig inmatning. Fält som inte hittades
 * behåller sitt tidigare värde. Returnerar även vilka fält som fylldes i.
 */
export function mergeExtracted(current: BrfInput, e: ExtractedBrf): { input: BrfInput; filled: (keyof BrfInput)[] } {
  const next: BrfInput = { ...current };
  const filled: (keyof BrfInput)[] = [];
  for (const key of NUMERIC_KEYS) {
    const v = e[key];
    if (typeof v === 'number' && Number.isFinite(v)) {
      next[key] = v;
      filled.push(key);
    }
  }
  if (e.leasehold !== null) {
    next.leasehold = e.leasehold;
    filled.push('leasehold');
  }
  if (e.genuineHousingCoop !== null) {
    next.genuineHousingCoop = e.genuineHousingCoop;
    filled.push('genuineHousingCoop');
  }
  // Byggår och stambyte är specifika för föreningen – töm dem om de inte hittades,
  // så att inga värden från en tidigare förening ligger kvar.
  next.buildYear = e.buildYear ?? undefined;
  next.lastPipeRenovation = e.lastPipeRenovation ?? undefined;
  if (e.buildYear !== null) filled.push('buildYear');
  if (e.lastPipeRenovation !== null) filled.push('lastPipeRenovation');
  return { input: next, filled };
}

/** Svenska etiketter för fält, för visning av osäkra värden. */
export const FIELD_LABELS: Record<string, string> = {
  associationName: 'föreningens namn',
  orgNumber: 'organisationsnummer',
  fiscalYear: 'räkenskapsår',
  residentialArea: 'boyta',
  otherArea: 'lokalyta/hyresrätter',
  apartmentCount: 'antal lägenheter',
  interestBearingDebt: 'räntebärande skulder',
  yearlyFees: 'årsavgifter',
  totalRevenue: 'rörelseintäkter',
  netResult: 'årets resultat',
  depreciation: 'avskrivningar',
  plannedMaintenance: 'planerat underhåll',
  energyCosts: 'energikostnader',
  cash: 'likvida medel',
  averageInterestRate: 'genomsnittlig ränta',
  debtMaturingWithin12Months: 'lån som förfaller inom 12 mån',
  leasehold: 'tomträtt',
  genuineHousingCoop: 'äkta förening',
  buildYear: 'byggår',
  lastPipeRenovation: 'senaste stambyte',
};
