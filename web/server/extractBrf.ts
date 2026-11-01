import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { ExtractedBrfSchema, type ExtractedBrf } from '../src/lib/brfExtractionSchema.ts';
import { checkConsistency, type ConsistencyIssue } from '../src/lib/brfExtraction.ts';

/** Snabb och billig modell för första försöket. */
const PRIMARY_MODEL = process.env.BRF_MODEL ?? 'claude-haiku-5-5';
/** Används om första försöket avböjs, inte går att tolka eller inte klarar rimlighetskontrollen. Tom sträng = av. */
const ESCALATION_MODEL = process.env.BRF_ESCALATION_MODEL ?? 'claude-opus-5-5';

export const SYSTEM_PROMPT = `Du extraherar uppgifter ur årsredovisningar för svenska bostadsrättsföreningar (BRF). Resultatet används av en privatperson som funderar på att köpa en lägenhet i föreningen, och siffrorna matas direkt in i en kalkyl. Exakthet är viktigare än fullständighet.

# Allmänna regler
1. Använd alltid det SENASTE räkenskapsåret. Tabeller har ofta två kolumner (i år och föregående år) – välj kolumnen för innevarande år.
2. Alla belopp ska anges i hela kronor. Står det "tkr", "Tkr" eller "KSEK" i tabellhuvudet: multiplicera med 1 000. Kontrollera enheten för VARJE tabell för sig.
3. Gissa aldrig. Saknas uppgiften: null. Har du räknat fram eller tolkat ett värde (t.ex. summerat flera poster): ange värdet och lägg fältnamnet i uncertainFields.
4. Negativa resultat anges med minustecken.

# Var du hittar uppgifterna
- associationName, orgNumber, fiscalYear: försättsbladet.
- residentialArea, otherArea, apartmentCount, buildYear: förvaltningsberättelsen, avsnittet om fastigheten/byggnaden. residentialArea = yta upplåten med bostadsrätt. otherArea = lokaler + lägenheter upplåtna med hyresrätt (0 om sådana uttryckligen saknas, null om det inte framgår).
- leasehold: true om fastigheten innehas med tomträtt (ordet "tomträtt" eller "tomträttsavgäld"), false om föreningen äger marken.
- genuineHousingCoop: true om det står att föreningen är ett privatbostadsföretag/äkta bostadsrättsförening, false om "oäkta". null om det inte framgår.
- lastPipeRenovation: år för genomfört stambyte enligt förvaltningsberättelsen eller underhållsplanen. Planerade stambyten räknas INTE här – lägg dem i findings.
- plannedPipeRenovationYear, plannedPipeRenovationCost: kommande stambyte enligt underhållsplanen eller förvaltningsberättelsen (år och total kostnad). null om inget stambyte planeras eller det inte framgår.
- groundRent: tomträttsavgäld per år (resultaträkningen/noten om driftkostnader). groundRentRenegotiationYear: när avgälden omregleras nästa gång.
- rentalApartmentCount: antal lägenheter upplåtna med hyresrätt.
- yearlyFees: posten "Årsavgifter" (eller "Årsavgifter bostäder") i resultaträkningen eller noten om nettoomsättning. Ta INTE med hyresintäkter, lokalhyror eller andra intäkter.
- totalRevenue: "Summa rörelseintäkter" (eller "Nettoomsättning" + "Övriga rörelseintäkter").
- netResult: "Årets resultat".
- depreciation: "Avskrivningar av materiella anläggningstillgångar" i resultaträkningen.
- plannedMaintenance: "Planerat underhåll" / "Periodiskt underhåll" bland driftkostnaderna (ofta i en not). Inte löpande underhåll eller reparationer.
- energyCosts: summan av uppvärmning, el och vatten (ofta egna rader i noten om driftkostnader). Lägg till uncertainFields om du summerat.
- cash: "Kassa och bank" plus kortfristiga placeringar i balansräkningen.
- interestBearingDebt: "Skulder till kreditinstitut", långfristiga PLUS kortfristiga. Lånen står ofta i en not med varje lån, ränta och villkorsändringsdag. Ta inte med leverantörsskulder eller andra skulder.
- averageInterestRate: genomsnittsränta om den anges; annars räkna ett lånebeloppsvägt snitt från lånenoten och lägg fältet i uncertainFields. Som decimaltal (3,25 % → 0.0325).
- debtMaturingWithin12Months: summan av lån med villkorsändringsdag/förfallodag inom 12 månader från bokslutsdagen (oftast = kortfristig del av skulder till kreditinstitut).
- reportedKeyFigures: kopiera föreningens egna nyckeltal ur flerårsöversikten för senaste året, oförändrade. Räkna inte fram dem själv.

# findings
Lista det en köpare behöver veta, särskilt sådant som kan leda till högre avgift eller extra kostnad: planerade stambyten/fasad/tak och deras kostnad, underhållsplanens status, lån som ska omförhandlas, beslutade avgiftshöjningar, förluster flera år i rad, tvister, revisorns anmärkningar, vattenskador, vakanta lokaler, att föreningen äger lägenheter, tomträtt, oäkta förening. Skriv en mening per iakttagelse, på svenska, med sidnummer. severity: "critical" för sådant som sannolikt höjer avgiften kraftigt, "warning" för risker, "info" för övrigt. Hitta inte på iakttagelser – tom lista är OK.`;

export class ExtractionError extends Error {
  readonly status: number;
  constructor(message: string, status = 502) {
    super(message);
    this.status = status;
  }
}

export interface ExtractionResult extends ExtractedBrf {
  model: string;
  consistencyIssues: ConsistencyIssue[];
}

async function runExtraction(client: Anthropic, model: string, pdf: Buffer): Promise<ExtractedBrf> {
  const isHaiku = model.startsWith('claude-haiku');
  const stream = client.beta.messages.stream({
    model,
    max_tokens: 32_000,
    // Haiku saknar server-side fallback – där eskalerar vi själva i extractBrf().
    ...(isHaiku ? {} : { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const }),
    output_config: { effort: 'high', format: betaZodOutputFormat(ExtractedBrfSchema) },
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: pdf.toString('base64') } },
          { type: 'text', text: 'Här är föreningens årsredovisning. Extrahera uppgifterna enligt instruktionerna och schemat.' },
        ],
      },
    ],
  });

  const message = await stream.finalMessage();
  if (message.stop_reason === 'refusal') throw new ExtractionError('Modellen avböjde att läsa dokumentet.');
  if (message.stop_reason === 'max_tokens') throw new ExtractionError('Svaret blev för långt och klipptes av.');

  const text = message.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('');
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new ExtractionError('Modellen returnerade ogiltig JSON.');
  }
  const parsed = ExtractedBrfSchema.safeParse(json);
  if (!parsed.success) throw new ExtractionError('Kunde inte tolka svaret från modellen.');
  return parsed.data;
}

/**
 * Extraherar med den billiga modellen först. Om den misslyckas eller resultatet
 * inte klarar rimlighetskontrollen körs samma dokument med eskaleringsmodellen.
 */
export async function extractBrf(pdf: Buffer, client = new Anthropic()): Promise<ExtractionResult> {
  let firstError: unknown;
  try {
    const data = await runExtraction(client, PRIMARY_MODEL, pdf);
    const issues = checkConsistency(data);
    if (issues.length === 0 || !ESCALATION_MODEL) {
      return { ...data, model: PRIMARY_MODEL, consistencyIssues: issues };
    }
    console.info(`[extract] ${PRIMARY_MODEL}: ${issues.length} avvikelser – eskalerar till ${ESCALATION_MODEL}`);
  } catch (err) {
    if (!(err instanceof ExtractionError) || !ESCALATION_MODEL) throw err;
    firstError = err;
    console.info(`[extract] ${PRIMARY_MODEL} misslyckades (${err.message}) – eskalerar till ${ESCALATION_MODEL}`);
  }

  try {
    const data = await runExtraction(client, ESCALATION_MODEL, pdf);
    return { ...data, model: ESCALATION_MODEL, consistencyIssues: checkConsistency(data) };
  } catch (err) {
    throw firstError ?? err;
  }
}
