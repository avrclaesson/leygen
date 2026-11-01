/**
 * Analys av en bostadsrättsförenings ekonomi utifrån årsredovisningen.
 *
 * Nyckeltalen följer de som Boverket kräver i ekonomiska planer och som
 * BFN kräver i årsredovisningar sedan 2023 (skuldsättning/kvm, sparande/kvm,
 * räntekänslighet, energikostnad/kvm, årsavgift/kvm m.fl.).
 * Gränsvärdena för grönt/gult/rött är tumregler, inte officiella gränser.
 */

export interface BrfInput {
  /** Boyta upplåten med bostadsrätt (kvm). */
  residentialArea: number;
  /** Lokalyta + hyreslägenheter (kvm). */
  otherArea: number;
  /** Räntebärande skulder (kr). */
  interestBearingDebt: number;
  /** Totala årsavgifter från medlemmarna (kr/år). */
  yearlyFees: number;
  /** Totala rörelseintäkter (kr/år). */
  totalRevenue: number;
  /** Årets resultat (kr). */
  netResult: number;
  /** Avskrivningar (kr/år). */
  depreciation: number;
  /** Kostnad för planerat underhåll som kostnadsförts under året (kr). */
  plannedMaintenance: number;
  /** Energikostnader: värme, el, vatten (kr/år). */
  energyCosts: number;
  /** Likvida medel (kr). */
  cash: number;
  /** Föreningen äger inte marken (tomträtt) – risk för höjd avgäld. */
  leasehold: boolean;
  /** Är föreningen en "äkta" bostadsrättsförening (skattemässigt)? */
  genuineHousingCoop: boolean;
  /** Byggår. */
  buildYear?: number;
  /** År för senaste stambyte (om känt). */
  lastPipeRenovation?: number;
}

export type Rating = 'good' | 'ok' | 'bad';

export interface Metric {
  key: string;
  label: string;
  value: number;
  unit: string;
  rating: Rating;
  explanation: string;
}

export interface BrfAnalysis {
  metrics: Metric[];
  warnings: string[];
  /** 0–100, enkel viktad poäng. */
  score: number;
}

const rate = (value: number, goodBelow: number, badAbove: number): Rating =>
  value <= goodBelow ? 'good' : value > badAbove ? 'bad' : 'ok';
const rateHigh = (value: number, goodAbove: number, badBelow: number): Rating =>
  value >= goodAbove ? 'good' : value < badBelow ? 'bad' : 'ok';

export function analyzeBrf(b: BrfInput, currentYear = new Date().getFullYear()): BrfAnalysis {
  const totalArea = b.residentialArea + b.otherArea;
  const debtPerSqm = totalArea > 0 ? b.interestBearingDebt / totalArea : 0;
  const debtPerResidentialSqm = b.residentialArea > 0 ? b.interestBearingDebt / b.residentialArea : 0;
  // Sparande = resultat + avskrivningar + kostnadsfört planerat underhåll (enligt BFN:s definition).
  const savings = b.netResult + b.depreciation + b.plannedMaintenance;
  const savingsPerSqm = totalArea > 0 ? savings / totalArea : 0;
  const feePerSqm = b.residentialArea > 0 ? b.yearlyFees / b.residentialArea : 0;
  // Räntekänslighet: hur många % avgifterna måste höjas om räntan stiger 1 procentenhet.
  const interestSensitivity = b.yearlyFees > 0 ? (b.interestBearingDebt * 0.01) / b.yearlyFees : 0;
  const energyPerSqm = totalArea > 0 ? b.energyCosts / totalArea : 0;
  const feeShare = b.totalRevenue > 0 ? b.yearlyFees / b.totalRevenue : 1;
  const cashPerSqm = totalArea > 0 ? b.cash / totalArea : 0;

  const metrics: Metric[] = [
    {
      key: 'debtPerSqm',
      label: 'Skuldsättning per kvm (total yta)',
      value: debtPerSqm,
      unit: 'kr/kvm',
      rating: rate(debtPerSqm, 5_000, 12_000),
      explanation:
        'Föreningens lån delat på all yta. Under 5 000 kr är lågt, över 12 000 kr gör föreningen känslig för räntehöjningar. Nyproduktion ligger ofta högre.',
    },
    {
      key: 'debtPerResidentialSqm',
      label: 'Skuldsättning per kvm bostadsrättsyta',
      value: debtPerResidentialSqm,
      unit: 'kr/kvm',
      rating: rate(debtPerResidentialSqm, 6_000, 14_000),
      explanation: 'Skulden som i praktiken bärs av medlemmarna. Lägg på denna andel × din boyta på priset för att se "verkligt pris".',
    },
    {
      key: 'savingsPerSqm',
      label: 'Sparande per kvm',
      value: savingsPerSqm,
      unit: 'kr/kvm',
      rating: rateHigh(savingsPerSqm, 250, 120),
      explanation:
        'Hur mycket föreningen sparar till framtida underhåll. Under ca 120 kr/kvm riskerar avgiftshöjningar eller nya lån; 200–300 kr/kvm är sunt.',
    },
    {
      key: 'interestSensitivity',
      label: 'Räntekänslighet',
      value: interestSensitivity * 100,
      unit: '%',
      rating: rate(interestSensitivity * 100, 5, 10),
      explanation: 'Hur mycket avgiften behöver höjas om föreningens ränta stiger med 1 procentenhet.',
    },
    {
      key: 'feePerSqm',
      label: 'Årsavgift per kvm',
      value: feePerSqm,
      unit: 'kr/kvm',
      rating: rate(feePerSqm, 700, 1_000),
      explanation: 'Låg avgift är bara bra om sparandet också är tillräckligt – annars är den för låg.',
    },
    {
      key: 'energyPerSqm',
      label: 'Energikostnad per kvm',
      value: energyPerSqm,
      unit: 'kr/kvm',
      rating: rate(energyPerSqm, 200, 300),
      explanation: 'Värme, el och vatten. Höga värden kan tyda på dålig energiprestanda.',
    },
    {
      key: 'feeShare',
      label: 'Årsavgifternas andel av intäkterna',
      value: feeShare * 100,
      unit: '%',
      rating: rate(feeShare * 100, 90, 98),
      explanation:
        'Intäkter från lokaler/hyresrätter sänker medlemmarnas avgifter men innebär risk vid vakanser. Mycket hög andel lokalintäkter kan hota statusen som äkta BRF.',
    },
    {
      key: 'cashPerSqm',
      label: 'Likvida medel per kvm',
      value: cashPerSqm,
      unit: 'kr/kvm',
      rating: rateHigh(cashPerSqm, 300, 100),
      explanation: 'Buffert för oförutsedda kostnader.',
    },
  ];

  const warnings: string[] = [];
  if (b.netResult < 0 && savings < 0) {
    warnings.push('Negativt resultat även före avskrivningar – föreningen går med verkligt underskott.');
  }
  if (b.leasehold) {
    warnings.push('Tomträtt: föreningen äger inte marken. Avgälden kan höjas kraftigt vid omförhandling (vart 10–20 år).');
  }
  if (!b.genuineHousingCoop) {
    warnings.push('Oäkta bostadsrättsförening: annan beskattning för både föreningen och dig som ägare.');
  }
  if (b.buildYear && b.buildYear < 1985) {
    const since = b.lastPipeRenovation ?? b.buildYear;
    if (currentYear - since > 45) {
      warnings.push(
        `Inget känt stambyte på ${currentYear - since} år – stambyte kostar ofta 15 000–25 000 kr/kvm. Kontrollera underhållsplanen.`,
      );
    }
  }
  if (b.buildYear && currentYear - b.buildYear < 5 && debtPerSqm > 12_000) {
    warnings.push('Ny förening med hög skuld: kontrollera när räntebindningar och amorteringsfria år löper ut.');
  }

  const points: Record<Rating, number> = { good: 1, ok: 0.5, bad: 0 };
  const weights: Record<string, number> = {
    debtPerSqm: 3,
    debtPerResidentialSqm: 0,
    savingsPerSqm: 3,
    interestSensitivity: 2,
    feePerSqm: 1,
    energyPerSqm: 1,
    feeShare: 1,
    cashPerSqm: 1,
  };
  const totalWeight = Object.values(weights).reduce((a, w) => a + w, 0);
  const raw = metrics.reduce((sum, m) => sum + points[m.rating] * (weights[m.key] ?? 0), 0);
  const penalty = warnings.length * 5;
  const score = Math.max(0, Math.round((raw / totalWeight) * 100 - penalty));

  return { metrics, warnings, score };
}

/** Lägenhetens andel av föreningens skuld, och priset inklusive den. */
export function effectivePrice(price: number, apartmentArea: number, debtPerResidentialSqm: number) {
  const shareOfDebt = apartmentArea * debtPerResidentialSqm;
  return { shareOfDebt, effectivePrice: price + shareOfDebt, effectivePricePerSqm: (price + shareOfDebt) / apartmentArea };
}
