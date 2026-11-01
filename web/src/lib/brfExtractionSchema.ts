/**
 * Schema för data som extraheras ur en BRF:s årsredovisning (PDF) av Claude.
 * Används av servern för structured outputs och validering. Klienten importerar bara typen.
 */
import * as z from 'zod/v4';

const kr = (description: string) => z.number().nullable().describe(`${description} Belopp i hela kronor (omräknat från tkr om så anges). null om uppgiften saknas.`);

export const ExtractedBrfSchema = z.object({
  associationName: z.string().nullable().describe('Föreningens namn.'),
  orgNumber: z.string().nullable().describe('Organisationsnummer, format NNNNNN-NNNN.'),
  fiscalYear: z.string().nullable().describe('Räkenskapsåret som årsredovisningen avser, t.ex. "2025" eller "2024-07-01 – 2025-06-30".'),

  residentialArea: z.number().nullable().describe('Total boyta upplåten med bostadsrätt i kvm.'),
  otherArea: z.number().nullable().describe('Summa lokalyta + yta upplåten med hyresrätt i kvm (0 om föreningen saknar sådan).'),
  apartmentCount: z.number().nullable().describe('Antal bostadsrättslägenheter.'),

  interestBearingDebt: kr('Räntebärande skulder (fastighetslån), kort- och långfristiga, vid årets slut.'),
  yearlyFees: kr('Årsavgifter från medlemmarna (exkl. hyror från lokaler/hyresrätter).'),
  totalRevenue: kr('Summa rörelseintäkter / nettoomsättning.'),
  netResult: kr('Årets resultat (negativt vid förlust).'),
  depreciation: kr('Årets avskrivningar på byggnader och inventarier.'),
  plannedMaintenance: kr('Kostnadsfört planerat underhåll under året (0 om det aktiveras eller saknas).'),
  energyCosts: kr('Summa energikostnader: värme, el, vatten.'),
  cash: kr('Likvida medel (kassa och bank, inkl. placeringar som är lätt tillgängliga) vid årets slut.'),

  averageInterestRate: z.number().nullable().describe('Genomsnittlig ränta på föreningens lån som decimaltal (3,2 % = 0.032).'),
  debtMaturingWithin12Months: kr('Lån som förfaller eller ska villkorsändras inom 12 månader.'),

  leasehold: z.boolean().nullable().describe('true om föreningen innehar fastigheten med tomträtt.'),
  genuineHousingCoop: z.boolean().nullable().describe('true om föreningen är ett privatbostadsföretag (äkta BRF), false om oäkta.'),
  buildYear: z.number().nullable().describe('Byggnadsår (första året om flera).'),
  lastPipeRenovation: z.number().nullable().describe('År då stambyte senast genomfördes, om det framgår.'),

  reportedKeyFigures: z
    .object({
      debtPerSqm: z.number().nullable().describe('Skuldsättning per kvm som föreningen själv redovisar.'),
      savingsPerSqm: z.number().nullable().describe('Sparande per kvm som föreningen själv redovisar.'),
      feePerSqm: z.number().nullable().describe('Årsavgift per kvm upplåten med bostadsrätt enligt redovisningen.'),
      interestSensitivityPercent: z.number().nullable().describe('Räntekänslighet i procent enligt redovisningen.'),
    })
    .describe('Nyckeltal exakt som de står i flerårsöversikten för senaste året, för kontroll.'),

  plannedFeeChange: z.string().nullable().describe('Beslutade eller aviserade avgiftsändringar, kort sammanfattat.'),
  findings: z
    .array(
      z.object({
        severity: z.enum(['info', 'warning', 'critical']),
        text: z.string().describe('Kort beskrivning på svenska, med sidhänvisning om möjligt.'),
      }),
    )
    .describe(
      'Viktiga iakttagelser för en köpare: kommande stora renoveringar/stambyte, underhållsplanens status, ränteförfall, avgiftshöjningar, tvister, revisorns anmärkningar, föreningens ägande av lägenheter/lokaler, vakanser, försäkringsskador, oäkta förening, tomträtt m.m.',
    ),
  uncertainFields: z.array(z.string()).describe('Namn på fält vars värde är osäkert eller tolkat.'),
});

export type ExtractedBrf = z.infer<typeof ExtractedBrfSchema>;

