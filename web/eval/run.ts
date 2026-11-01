/**
 * Jämför modeller på riktiga årsredovisningar.
 *
 * Lägg PDF:er i eval/reports/ tillsammans med en facitfil med samma namn:
 *   eval/reports/brf-solsidan-2025.pdf
 *   eval/reports/brf-solsidan-2025.expected.json   ← handkontrollerade värden
 *
 * Facitfilen innehåller de fält du vill kontrollera, t.ex.
 *   { "residentialArea": 4210, "interestBearingDebt": 28150000, "leasehold": false }
 *
 * Kör: ANTHROPIC_API_KEY=... npm run eval -- claude-haiku-5-5 claude-opus-5-5
 */
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import Anthropic from '@anthropic-ai/sdk';

const dir = join(import.meta.dirname, 'reports');
const models = process.argv.slice(2).length ? process.argv.slice(2) : ['claude-haiku-5-5', 'claude-opus-5-5'];
const client = new Anthropic();

function matches(expected: unknown, actual: unknown): boolean {
  if (typeof expected === 'number' && typeof actual === 'number') {
    return expected === 0 ? actual === 0 : Math.abs(actual - expected) / Math.abs(expected) <= 0.01;
  }
  return expected === actual;
}

const files = (await readdir(dir)).filter((f) => f.endsWith('.pdf'));
if (files.length === 0) {
  console.log(`Inga PDF:er i ${dir}. Se instruktionerna överst i eval/run.ts.`);
  process.exit(0);
}

for (const model of models) {
  // Kör en modell i taget utan eskalering, så att vi mäter modellen själv.
  process.env.BRF_MODEL = model;
  process.env.BRF_ESCALATION_MODEL = '';
  const { extractBrf } = await import(`../server/extractBrf.ts?model=${model}`);
  let correct = 0;
  let total = 0;
  const started = Date.now();
  for (const file of files) {
    const expected = JSON.parse(await readFile(join(dir, file.replace(/\.pdf$/, '.expected.json')), 'utf8'));
    try {
      const result = await extractBrf(await readFile(join(dir, file)), client);
      for (const [key, value] of Object.entries(expected)) {
        total++;
        if (matches(value, result[key])) correct++;
        else console.log(`  ✗ ${model} ${file} ${key}: väntat ${JSON.stringify(value)}, fick ${JSON.stringify(result[key])}`);
      }
      if (result.consistencyIssues.length) console.log(`  ⚠ ${model} ${file}: ${result.consistencyIssues.length} avvikelser i rimlighetskontrollen`);
    } catch (err) {
      total += Object.keys(expected).length;
      console.log(`  ✗ ${model} ${file}: ${err instanceof Error ? err.message : err}`);
    }
  }
  const secs = ((Date.now() - started) / 1000 / files.length).toFixed(0);
  console.log(`${model}: ${correct}/${total} fält rätt (${((100 * correct) / Math.max(total, 1)).toFixed(1)} %), ~${secs} s per dokument`);
}
