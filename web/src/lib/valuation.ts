/**
 * Värdering relativt området: utgå från ett jämförelsepris per kvm för en
 * "normal" lägenhet i området och justera för det som skiljer.
 *
 * Kostnadsskillnader som återkommer varje år kapitaliseras: en kostnad på
 * X kr/år är värd X / d kr idag (d = diskonteringsränta). Med d = 5 % blir
 * 100 kr/mån i högre avgift ≈ 24 000 kr lägre värde – samma storleksordning
 * som mäklarnas tumregel "avgift × 12 × 20".
 */

export interface ValuationInput {
  /** Jämförelsepris kr/kvm för liknande lägenheter i området (från t.ex. Booli/Hemnet). */
  areaPricePerSqm: number;
  area: number;
  /** Utgångspris eller pris du överväger, för jämförelse. */
  askingPrice: number;
  /** Diskonteringsränta för att kapitalisera löpande kostnader. */
  discountRate: number;

  // Förening – denna lägenhet vs. typisk förening i området
  feePerSqmYear: number;
  areaFeePerSqmYear: number;
  debtPerSqm: number;
  areaDebtPerSqm: number;
  brfRate: number;

  // Uppvärmning
  directElectricHeating: boolean;
  /** Egen kostnad för uppvärmning per år (el). */
  ownHeatingCostYear: number;

  // Stambyte
  pipeRenovationPlanned: boolean;
  pipeRenovationYears: number;
  pipeRenovationCostPerSqm: number;
  /** Andel av kostnaden du själv värderar som standardhöjning (nytt badrum m.m.). */
  pipeRenovationOwnValueShare: number;
  /** Är stambytet redan lånefinansierat (ingår i föreningens skuld)? */
  pipeRenovationAlreadyInDebt: boolean;

  // Tomträtt
  leasehold: boolean;
  /** Föreningens tomträttsavgäld per år idag. */
  groundRentYear: number;
  /** Förväntad höjning vid nästa omförhandling (0.5 = +50 %). */
  groundRentIncrease: number;
  groundRentYearsUntil: number;
  /** Föreningens totala bostadsrättsyta (för din andel). */
  brfResidentialArea: number;

  // Hyresrätter i föreningen
  rentalUnits: number;
  rentalSalePrice: number;
  rentalYearlyRent: number;
  /** Avgift som en omvandlad lägenhet skulle betala per år. */
  rentalFutureFeeYear: number;
  rentalConversionProbability: number;
  rentalYearsUntil: number;

  // Lägenhetens egenskaper (procentuella tumregler)
  groundFloor: boolean;
  groundFloorPct: number;
  noBalcony: boolean;
  noBalconyPct: number;
  noElevatorHighFloor: boolean;
  noElevatorPct: number;
  /** Renoveringsbehov i kr (kök, bad, golv). */
  renovationNeed: number;
}

export interface Adjustment {
  key: string;
  label: string;
  amount: number;
  explanation: string;
}

export interface Valuation {
  base: number;
  adjustments: Adjustment[];
  estimate: number;
  /** Skillnad mot utgångspris (positivt = priset är högre än uppskattat värde). */
  overprice: number;
}

const pv = (amount: number, years: number, d: number) => amount / Math.pow(1 + d, Math.max(0, years));

export function valuate(v: ValuationInput): Valuation {
  const base = v.areaPricePerSqm * v.area;
  const d = v.discountRate;
  const adj: Adjustment[] = [];
  const add = (key: string, label: string, amount: number, explanation: string) => {
    if (Math.abs(amount) >= 1) adj.push({ key, label, amount, explanation });
  };

  // Föreningens skuld: din andel är i praktiken ett lån du tar över.
  add(
    'debt',
    'Föreningens skuld',
    -(v.debtPerSqm - v.areaDebtPerSqm) * v.area,
    'Skillnaden i föreningsskuld mot områdets snitt × din boyta. Skulden är i praktiken en del av priset.',
  );

  // Avgift exkl. räntedelen (räntedelen är redan hanterad via skulden ovan).
  const ownFeeOther = v.feePerSqmYear - v.debtPerSqm * v.brfRate;
  const areaFeeOther = v.areaFeePerSqmYear - v.areaDebtPerSqm * v.brfRate;
  add(
    'fee',
    'Avgift (exkl. ränta)',
    -((ownFeeOther - areaFeeOther) * v.area) / d,
    'Skillnad i avgift som inte beror på föreningens lån, kapitaliserad. Vid direktverkande el ingår inte värmen i avgiften – därför ser avgiften låg ut, vilket raden nedan äter upp.',
  );

  if (v.directElectricHeating) {
    add(
      'heating',
      'Direktverkande el',
      -v.ownHeatingCostYear / d,
      'Din egen uppvärmningskostnad, kapitaliserad. Netto mot avgiftsraden ovan blir effekten skillnaden mot en lägenhet där värmen ingår i avgiften.',
    );
  }

  if (v.pipeRenovationPlanned && !v.pipeRenovationAlreadyInDebt) {
    const cost = v.pipeRenovationCostPerSqm * v.area;
    add(
      'pipes',
      `Stambyte om ${v.pipeRenovationYears} år`,
      -pv(cost * (1 - v.pipeRenovationOwnValueShare), v.pipeRenovationYears, d),
      'Din andel av kostnaden, som föreningen troligen lånar till och som betalas via avgiften. Avdrag för värdet av nytt badrum.',
    );
  }

  if (v.leasehold && v.brfResidentialArea > 0) {
    const share = v.area / v.brfResidentialArea;
    const increaseYear = v.groundRentYear * v.groundRentIncrease * share;
    add(
      'leasehold',
      'Tomträtt – höjd avgäld',
      -pv(increaseYear / d, v.groundRentYearsUntil, d),
      'Din andel av förväntad höjning av tomträttsavgälden från nästa omförhandling, kapitaliserad.',
    );
  }

  if (v.rentalUnits > 0 && v.brfResidentialArea > 0) {
    const netPerUnit = v.rentalSalePrice - (v.rentalYearlyRent - v.rentalFutureFeeYear) / d;
    const share = v.area / v.brfResidentialArea;
    add(
      'rentals',
      `${v.rentalUnits} hyresrätt${v.rentalUnits > 1 ? 'er' : ''} som kan säljas`,
      pv(netPerUnit * v.rentalUnits * v.rentalConversionProbability * share, v.rentalYearsUntil, d),
      'Föreningen får försäljningslikvid men tappar hyran (och får avgift i stället). Din andel × sannolikheten att det blir av.',
    );
  }

  if (v.groundFloor) add('groundFloor', 'Bottenvåning', base * v.groundFloorPct, 'Tumregel, inte uppmätt.');
  if (v.noBalcony) add('balcony', 'Saknar balkong', base * v.noBalconyPct, 'Tumregel, inte uppmätt.');
  if (v.noElevatorHighFloor) add('elevator', 'Ingen hiss (högt upp)', base * v.noElevatorPct, 'Tumregel, inte uppmätt.');
  if (v.renovationNeed > 0) add('renovation', 'Renoveringsbehov', -v.renovationNeed, 'Beräknad kostnad för att nå områdets standard.');

  const estimate = base + adj.reduce((s, a) => s + a.amount, 0);
  return { base, adjustments: adj, estimate, overprice: v.askingPrice - estimate };
}

export interface MarketAssumptions {
  /** Prisförändring per 1 000 kr högre månadskostnad (Wilhelmsson 2025: −2–3 %). */
  perThousandMonthly: number;
  /** Tomträttsrabatt (Boberg m.fl. 2025: −3,6 % innerstad, −6,8 % förort). */
  leaseholdPct: number;
}

export const MARKET_CENTRAL: MarketAssumptions = { perThousandMonthly: -0.025, leaseholdPct: -0.036 };
export const MARKET_SUBURB: MarketAssumptions = { perThousandMonthly: -0.025, leaseholdPct: -0.068 };

/**
 * "Vad marknaden brukar betala": samma lägenhet, men med de effekter som studier
 * faktiskt mätt på slutpriser. Köpare tittar främst på avgiften och prisar in den
 * svagare än den ekonomiska kalkylen, och de bortser oftast från framtida händelser.
 */
export function valuateMarket(v: ValuationInput, m: MarketAssumptions): Valuation {
  const base = v.areaPricePerSqm * v.area;
  const adj: Adjustment[] = [];
  const add = (key: string, label: string, amount: number, explanation: string) => {
    if (Math.abs(amount) >= 1) adj.push({ key, label, amount, explanation });
  };
  const perKr = (m.perThousandMonthly / 1000) * base;

  const feeDiffMonthly = ((v.feePerSqmYear - v.areaFeePerSqmYear) * v.area) / 12;
  add(
    'fee',
    'Avgift jämfört med området',
    feeDiffMonthly * perKr,
    `Köpare prisar in avgiften – inklusive föreningens räntor – med ca ${Math.abs(m.perThousandMonthly * 100).toLocaleString('sv-SE')} % per 1 000 kr/mån (Wilhelmsson, KTH 2025). Föreningens skuld i sig syns bara via avgiften.`,
  );

  if (v.directElectricHeating) {
    add(
      'heating',
      'Direktverkande el',
      (v.ownHeatingCostYear / 12) * perKr,
      'Ingen studie mäter detta direkt. Antagande: elkostnaden prisas in som en avgift.',
    );
  }

  if (v.pipeRenovationPlanned && !v.pipeRenovationAlreadyInDebt) {
    const expectedFeeIncrease = (v.pipeRenovationCostPerSqm * v.area * v.brfRate) / 12;
    add(
      'pipes',
      `Stambyte om ${v.pipeRenovationYears} år`,
      expectedFeeIncrease * perKr * (v.pipeRenovationYears <= 2 ? 1 : 0.5),
      'Ingen studie mäter detta direkt. Antagande: köpare prisar in den väntade avgiftshöjningen, men bara till hälften om stambytet ligger mer än två år bort.',
    );
  }

  if (v.leasehold) {
    add('leasehold', 'Tomträtt', base * m.leaseholdPct, 'Uppmätt rabatt för tomträtt i Stockholm (Boberg, Donner & Metsalo, KTH 2025).');
  }

  if (v.groundFloor) add('groundFloor', 'Bottenvåning', base * v.groundFloorPct, 'Tumregel, inte uppmätt.');
  if (v.noBalcony) add('balcony', 'Saknar balkong', base * v.noBalconyPct, 'Booli 2024: balkong ger ca +1,9 %.');
  if (v.noElevatorHighFloor) add('elevator', 'Ingen hiss (högt upp)', base * v.noElevatorPct, 'Tumregel, inte uppmätt.');
  if (v.renovationNeed > 0) add('renovation', 'Renoveringsbehov', -v.renovationNeed, 'Beräknad kostnad för att nå områdets standard.');

  const estimate = base + adj.reduce((s, a) => s + a.amount, 0);
  return { base, adjustments: adj, estimate, overprice: v.askingPrice - estimate };
}
