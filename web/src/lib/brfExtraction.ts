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

export interface ConsistencyIssue {
  field: string;
  message: string;
}

/**
 * Rimlighetskontroll av extraherade värden: jämför våra beräknade nyckeltal med
 * de nyckeltal föreningen själv redovisar, och letar efter orimliga storlekar
 * (t.ex. tkr som inte räknats om till kr).
 */
export function checkConsistency(e: ExtractedBrf, tolerance = 0.15): ConsistencyIssue[] {
  const issues: ConsistencyIssue[] = [];
  const total = (e.residentialArea ?? 0) + (e.otherArea ?? 0);
  const differs = (computed: number, reported: number) =>
    reported !== 0 && Math.abs(computed - reported) / Math.abs(reported) > tolerance;
  const fmt = (n: number) => Math.round(n).toLocaleString('sv-SE');

  if (e.interestBearingDebt !== null && e.reportedKeyFigures.debtPerSqm !== null && total > 0) {
    // Föreningar redovisar skuld per kvm antingen mot total yta eller mot boyta – godta båda.
    const perTotal = e.interestBearingDebt / total;
    const perResidential = e.residentialArea ? e.interestBearingDebt / e.residentialArea : perTotal;
    const reported = e.reportedKeyFigures.debtPerSqm;
    if (differs(perTotal, reported) && differs(perResidential, reported)) {
      issues.push({
        field: 'interestBearingDebt',
        message: `Skuld/kvm blir ${fmt(perTotal)} kr men föreningen redovisar ${fmt(reported)} kr – kontrollera skulder och ytor.`,
      });
    }
  }
  if (e.yearlyFees !== null && e.reportedKeyFigures.feePerSqm !== null && e.residentialArea) {
    const computed = e.yearlyFees / e.residentialArea;
    if (differs(computed, e.reportedKeyFigures.feePerSqm)) {
      issues.push({
        field: 'yearlyFees',
        message: `Årsavgift/kvm blir ${fmt(computed)} kr men föreningen redovisar ${fmt(e.reportedKeyFigures.feePerSqm)} kr.`,
      });
    }
  }
  if (e.yearlyFees !== null && e.totalRevenue !== null && e.yearlyFees > e.totalRevenue * 1.01) {
    issues.push({ field: 'yearlyFees', message: 'Årsavgifterna är större än de totala intäkterna.' });
  }
  if (e.residentialArea !== null && e.yearlyFees !== null && e.residentialArea > 0) {
    const perSqm = e.yearlyFees / e.residentialArea;
    if (perSqm < 100 || perSqm > 5_000) {
      issues.push({ field: 'yearlyFees', message: `Årsavgift/kvm (${fmt(perSqm)} kr) är orimlig – tkr kan ha blandats ihop med kr.` });
    }
  }
  if (e.averageInterestRate !== null && (e.averageInterestRate <= 0 || e.averageInterestRate > 0.15)) {
    issues.push({ field: 'averageInterestRate', message: 'Genomsnittsräntan ligger utanför rimligt intervall (0–15 %).' });
  }
  return issues;
}
