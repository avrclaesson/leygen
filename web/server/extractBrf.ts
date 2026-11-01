import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { ExtractedBrfSchema, type ExtractedBrf } from '../src/lib/brfExtractionSchema.ts';

const MODEL = 'claude-opus-5-5';

const SYSTEM_PROMPT = `Du är en noggrann analytiker som läser årsredovisningar för svenska bostadsrättsföreningar (BRF) åt en privatperson som funderar på att köpa en lägenhet i föreningen.

Extrahera uppgifterna i schemat från dokumentet. Riktlinjer:
- Använd värden för det senaste räkenskapsåret.
- Räkna om belopp i tkr/Tkr till hela kronor.
- Hämta ytor från förvaltningsberättelsen (fastighetsuppgifter). Boyta = yta upplåten med bostadsrätt.
- Räntebärande skulder: summa skulder till kreditinstitut (lång- och kortfristiga), se noten om fastighetslån.
- Gissa aldrig. Om en uppgift inte finns i dokumentet, sätt null. Om du har tolkat eller räknat fram ett värde, lägg fältnamnet i uncertainFields.
- I findings: lyft fram det en köpare behöver veta, framför allt sådant som kan leda till avgiftshöjningar eller extra kostnader. Skriv kort och konkret på svenska. Ange sidnummer när det går.`;

export class ExtractionError extends Error {
  readonly status: number;
  constructor(message: string, status = 502) {
    super(message);
    this.status = status;
  }
}

export async function extractBrf(pdf: Buffer, client = new Anthropic()): Promise<ExtractedBrf> {
  const stream = client.beta.messages.stream({
    model: MODEL,
    max_tokens: 64_000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: 'high', format: betaZodOutputFormat(ExtractedBrfSchema) },
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'document',
            source: { type: 'base64', media_type: 'application/pdf', data: pdf.toString('base64') },
          },
          { type: 'text', text: 'Här är föreningens årsredovisning. Extrahera uppgifterna enligt schemat.' },
        ],
      },
    ],
  });

  const message = await stream.finalMessage();

  if (message.stop_reason === 'refusal') {
    throw new ExtractionError('Modellen avböjde att läsa dokumentet.');
  }
  if (message.stop_reason === 'max_tokens') {
    throw new ExtractionError('Svaret blev för långt och klipptes av.');
  }
  const text = message.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('');
  const parsed = ExtractedBrfSchema.safeParse(JSON.parse(text));
  if (!parsed.success) {
    throw new ExtractionError('Kunde inte tolka svaret från modellen.');
  }
  return parsed.data;
}
