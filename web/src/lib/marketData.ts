/**
 * Marknadsdata per kommun/region, med källa och datum för varje siffra.
 *
 * Uppdatera för hand när Svensk Mäklarstatistik publicerar nya siffror (månadsvis).
 * Gränssnittet visar källa och datum och varnar när en siffra är äldre än STALE_AFTER_MONTHS.
 */

export interface DataPoint {
  value: number;
  /** Vem som publicerat siffran. */
  source: string;
  /** Länk till där siffran kommer ifrån, om den finns. */
  url?: string;
  /** Månad som siffran avser, YYYY-MM. */
  asOf: string;
  /** Förbehåll, t.ex. att siffran gäller en större region än kommunen. */
  note?: string;
}

export interface MarketRegion {
  id: string;
  label: string;
  /** Prisfall för bostadsrätter från toppen 2022 till botten (negativt). */
  drop2022: DataPoint;
  /** Snittpris kr/kvm för bostadsrätter. null = saknas, användaren får fylla i själv. */
  avgPricePerSqm: DataPoint | null;
}

export const STALE_AFTER_MONTHS = 6;

const DROP_SOURCE = {
  source: 'Svensk Mäklarstatistik via Placera',
  url: 'https://www.placera.se/nyheter/bostadsratterna-forbi-pristoppen-2022-villorna-har-en-bit-kvar-2026-10-28',
  asOf: '2026-10',
  note: 'Största kommunen i länet, topp 2022 till botten.',
};

export const MARKET_REGIONS: MarketRegion[] = [
  {
    id: 'stockholm',
    label: 'Stockholm',
    drop2022: { value: -0.12, ...DROP_SOURCE },
    avgPricePerSqm: {
      value: 69_556,
      source: 'Svensk Mäklarstatistik',
      url: 'https://borsvarlden.com/artiklar/blandad-utveckling-for-bostadspriserna-i-oktober-svensk-maklarstatistik',
      asOf: '2025-10',
      note: 'Gäller Stor-Stockholm. Centrala Stockholm låg på 113 479 kr/kvm.',
    },
  },
  {
    id: 'malmo',
    label: 'Malmö',
    drop2022: { value: -0.13, ...DROP_SOURCE },
    avgPricePerSqm: { value: 35_787, source: 'Svensk Mäklarstatistik', asOf: '2026-03', note: 'Gäller Stor-Malmö.' },
  },
  {
    id: 'uppsala',
    label: 'Uppsala',
    drop2022: { value: -0.15, ...DROP_SOURCE },
    avgPricePerSqm: null,
  },
  {
    id: 'goteborg',
    label: 'Göteborg',
    drop2022: { value: -0.17, ...DROP_SOURCE },
    avgPricePerSqm: null,
  },
  {
    id: 'riket',
    label: 'Övriga Sverige (riket)',
    drop2022: { value: -0.14, ...DROP_SOURCE },
    avgPricePerSqm: {
      value: 47_995,
      source: 'Svensk Mäklarstatistik',
      url: 'https://mb.cision.com/Main/1330/4357298/4132658.pdf',
      asOf: '2026-05',
    },
  },
];

/** Antal hela månader mellan siffrans månad och `now`. */
export function ageInMonths(asOf: string, now: Date): number {
  const [y, m] = asOf.split('-').map(Number);
  return (now.getFullYear() - y) * 12 + (now.getMonth() + 1 - m);
}

export const isStale = (d: DataPoint, now: Date) => ageInMonths(d.asOf, now) > STALE_AFTER_MONTHS;

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'maj', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];

/** "okt 2025" */
export function formatAsOf(asOf: string): string {
  const [y, m] = asOf.split('-').map(Number);
  return `${MONTHS[m - 1]} ${y}`;
}
