/**
 * Liten HTTP-server:
 *  - POST /api/brf/extract  (body: application/pdf) → extraherade nyckeltal som JSON
 *  - I produktion serveras även det byggda gränssnittet från dist/.
 *
 * Kräver ANTHROPIC_API_KEY i miljön.
 */
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import Anthropic from '@anthropic-ai/sdk';
import { ExtractionError, extractBrf } from './extractBrf.ts';

const PORT = Number(process.env.PORT ?? 8787);
// API-gränsen är 32 MB per anrop; base64 gör filen ~33 % större.
const MAX_PDF_BYTES = 22 * 1024 * 1024;
const DIST = join(import.meta.dirname, '..', 'dist');
const client = new Anthropic();

// Enkel spärr mot missbruk när servern delas publikt (t.ex. via Tailscale Funnel).
const MAX_PER_HOUR = Number(process.env.MAX_EXTRACTIONS_PER_HOUR ?? 20);
const recent: number[] = [];
function allowExtraction(): boolean {
  const hourAgo = Date.now() - 3_600_000;
  while (recent.length && recent[0] < hourAgo) recent.shift();
  if (recent.length >= MAX_PER_HOUR) return false;
  recent.push(Date.now());
  return true;
}

function json(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

async function readBody(req: IncomingMessage, limit: number): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw new ExtractionError('Filen är för stor (max 22 MB).', 413);
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function handleExtract(req: IncomingMessage, res: ServerResponse) {
  if (!req.headers['content-type']?.startsWith('application/pdf')) {
    return json(res, 415, { error: 'Skicka filen som application/pdf.' });
  }
  if (!allowExtraction()) {
    return json(res, 429, { error: 'Gränsen för antal inläsningar per timme är nådd. Försök igen senare.' });
  }
  try {
    const pdf = await readBody(req, MAX_PDF_BYTES);
    if (pdf.subarray(0, 5).toString() !== '%PDF-') {
      return json(res, 400, { error: 'Filen verkar inte vara en PDF.' });
    }
    const data = await extractBrf(pdf, client);
    json(res, 200, data);
  } catch (err) {
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
  }
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

createServer((req, res) => {
  if (req.method === 'POST' && req.url === '/api/brf/extract') return void handleExtract(req, res);
  if (req.method === 'GET') return void serveStatic(req, res);
  json(res, 405, { error: 'Method not allowed' });
}).listen(PORT, () => {
  console.log(`Leygen-server på http://localhost:${PORT}`);
  if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) {
    console.warn('Varning: ANTHROPIC_API_KEY saknas – inläsning av årsredovisningar fungerar inte.');
  }
});
