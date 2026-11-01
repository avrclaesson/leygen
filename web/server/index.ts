/**
 * HTTP-server:
 *  POST   /api/brf/extract          (body: application/pdf) → extraherade nyckeltal (cachas per fil)
 *  GET    /api/brf/by-org/:orgNr    → senast inlästa årsredovisning för föreningen
 *  POST   /api/sales                (JSON) → rapportera ett slutpris, svarar med id + raderingsnyckel
 *  DELETE /api/sales/:id            (header x-delete-token) → radera sin rapport
 *  GET    /api/sales/summary        → median kr/kvm per ort (orter med minst 3 försäljningar)
 *  I produktion serveras även gränssnittet från dist/.
 *
 * Miljövariabler: ANTHROPIC_API_KEY, PORT, DATABASE_PATH, MAX_EXTRACTIONS_PER_HOUR, BRF_MODEL, BRF_ESCALATION_MODEL.
 */
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import Anthropic from '@anthropic-ai/sdk';
import { ExtractionError, extractBrf } from './extractBrf.ts';
import { openSqliteStore, SaleInputSchema, type StoredExtraction } from './store.ts';
import { ExtractedBrfSchema } from '../src/lib/brfExtractionSchema.ts';

const PORT = Number(process.env.PORT ?? 8787);
// API-gränsen är 32 MB per anrop; base64 gör filen ~33 % större.
const MAX_PDF_BYTES = 22 * 1024 * 1024;
const MAX_JSON_BYTES = 64 * 1024;
const DIST = join(import.meta.dirname, '..', 'dist');
const DATABASE_PATH = process.env.DATABASE_PATH ?? join(import.meta.dirname, '..', 'data', 'leygen.db');

const client = new Anthropic();
const store = openSqliteStore(DATABASE_PATH);

class HttpError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

// Enkel spärr mot missbruk när servern delas publikt (t.ex. via Tailscale Funnel).
// Svar från cachen räknas inte.
const MAX_PER_HOUR = Number(process.env.MAX_EXTRACTIONS_PER_HOUR ?? 20);
const recent: number[] = [];
function allowExtraction(): boolean {
  const hourAgo = Date.now() - 3_600_000;
  while (recent.length && recent[0] < hourAgo) recent.shift();
  if (recent.length >= MAX_PER_HOUR) return false;
  recent.push(Date.now());
  return true;
}

function json(res: ServerResponse, status: number, body?: unknown) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(body === undefined ? undefined : JSON.stringify(body));
}

async function readBody(req: IncomingMessage, limit: number): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw new HttpError(413, 'Förfrågan är för stor.');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  if (!req.headers['content-type']?.startsWith('application/json')) throw new HttpError(415, 'Skicka JSON.');
  try {
    return JSON.parse((await readBody(req, MAX_JSON_BYTES)).toString('utf8'));
  } catch (err) {
    if (err instanceof HttpError) throw err;
    throw new HttpError(400, 'Ogiltig JSON.');
  }
}

/** Cachade svar som inte matchar nuvarande schema (t.ex. efter en schemaändring) räknas som saknade. */
const isCurrent = (e: StoredExtraction | null): e is StoredExtraction => !!e && ExtractedBrfSchema.safeParse(e.data).success;

async function handleExtract(req: IncomingMessage, res: ServerResponse) {
  if (!req.headers['content-type']?.startsWith('application/pdf')) throw new HttpError(415, 'Skicka filen som application/pdf.');
  const pdf = await readBody(req, MAX_PDF_BYTES);
  if (pdf.subarray(0, 5).toString() !== '%PDF-') throw new HttpError(400, 'Filen verkar inte vara en PDF.');

  const sha256 = createHash('sha256').update(pdf).digest('hex');
  const cached = store.getExtractionByHash(sha256);
  if (isCurrent(cached)) return json(res, 200, { ...(cached.data as object), cached: true });

  if (!allowExtraction()) throw new HttpError(429, 'Gränsen för antal inläsningar per timme är nådd. Försök igen senare.');
  const result = await extractBrf(pdf, client);
  store.saveExtraction(sha256, { orgNumber: result.orgNumber, fiscalYear: result.fiscalYear, model: result.model, data: result });
  json(res, 200, { ...result, cached: false });
}

function handleByOrg(res: ServerResponse, orgNumber: string) {
  const found = store.getLatestExtractionByOrg(decodeURIComponent(orgNumber));
  if (!isCurrent(found)) throw new HttpError(404, 'Ingen årsredovisning inläst för den föreningen än.');
  json(res, 200, { ...(found.data as object), cached: true });
}

async function handleAddSale(req: IncomingMessage, res: ServerResponse) {
  const parsed = SaleInputSchema.safeParse(await readJson(req));
  if (!parsed.success) {
    throw new HttpError(400, `Kontrollera uppgifterna: ${parsed.error.issues.map((i) => i.path.join('.')).join(', ')}`);
  }
  json(res, 201, store.addSale(parsed.data));
}

function handleDeleteSale(req: IncomingMessage, res: ServerResponse, id: string) {
  const token = req.headers['x-delete-token'];
  if (typeof token !== 'string' || !store.deleteSale(id, token)) throw new HttpError(404, 'Hittade ingen rapport med den nyckeln.');
  json(res, 204);
}

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
};

async function serveStatic(req: IncomingMessage, res: ServerResponse) {
  const path = normalize(decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '');
  const file = join(DIST, path === '/' ? 'index.html' : path);
  try {
    const body = await readFile(file.startsWith(DIST) ? file : join(DIST, 'index.html'));
    res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' });
    res.end(body);
  } catch {
    try {
      res.writeHead(200, { 'content-type': MIME['.html'] });
      res.end(await readFile(join(DIST, 'index.html')));
    } catch {
      json(res, 404, { error: 'Not found' });
    }
  }
}

async function route(req: IncomingMessage, res: ServerResponse) {
  const { pathname } = new URL(req.url ?? '/', 'http://x');
  const m = req.method;
  let match: RegExpMatchArray | null;
  if (m === 'POST' && pathname === '/api/brf/extract') return handleExtract(req, res);
  if (m === 'GET' && (match = pathname.match(/^\/api\/brf\/by-org\/([^/]+)$/))) return handleByOrg(res, match[1]);
  if (m === 'POST' && pathname === '/api/sales') return handleAddSale(req, res);
  if (m === 'DELETE' && (match = pathname.match(/^\/api\/sales\/([\w-]+)$/))) return handleDeleteSale(req, res, match[1]);
  if (m === 'GET' && pathname === '/api/sales/summary') return json(res, 200, store.salesSummary());
  if (pathname.startsWith('/api/')) throw new HttpError(404, 'Okänd endpoint.');
  if (m === 'GET') return serveStatic(req, res);
  throw new HttpError(405, 'Method not allowed');
}

createServer((req, res) => {
  route(req, res).catch((err: unknown) => {
    if (err instanceof HttpError) return json(res, err.status, { error: err.message });
    if (err instanceof ExtractionError) return json(res, err.status, { error: err.message });
    if (err instanceof Anthropic.RateLimitError) return json(res, 429, { error: 'För många förfrågningar, försök igen om en stund.' });
    if (err instanceof Anthropic.BadRequestError) return json(res, 400, { error: `Dokumentet kunde inte läsas: ${err.message}` });
    if (err instanceof Anthropic.AuthenticationError) return json(res, 500, { error: 'Servern saknar giltig ANTHROPIC_API_KEY.' });
    if (err instanceof Anthropic.APIError) return json(res, 502, { error: 'Fel hos AI-tjänsten, försök igen.' });
    if (err instanceof Anthropic.AnthropicError) {
      console.error(err.message);
      return json(res, 500, { error: 'Servern kan inte nå Claude – är ANTHROPIC_API_KEY satt?' });
    }
    console.error(err);
    json(res, 500, { error: 'Oväntat fel.' });
  });
}).listen(PORT, () => {
  console.log(`Leygen-server på http://localhost:${PORT} (databas: ${DATABASE_PATH})`);
  if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) {
    console.warn('Varning: ANTHROPIC_API_KEY saknas – inläsning av årsredovisningar fungerar inte.');
  }
});
