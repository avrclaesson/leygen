/**
 * Datalager. Allt databasspecifikt ligger här bakom gränssnittet `Store`,
 * så att SQLite senare kan bytas mot t.ex. Postgres/Supabase utan att
 * resten av servern ändras. Tabellerna är vanlig SQL.
 */
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomBytes, randomUUID } from 'node:crypto';
import * as z from 'zod/v4';

export interface StoredExtraction {
  orgNumber: string | null;
  fiscalYear: string | null;
  model: string;
  createdAt: string;
  data: unknown;
}

export const SaleInputSchema = z.object({
  address: z.string().trim().min(2).max(200),
  city: z.string().trim().min(2).max(100),
  saleDate: z.iso.date(),
  price: z.number().int().min(100_000).max(200_000_000),
  area: z.number().min(5).max(1_000),
  rooms: z.number().min(1).max(20).nullable(),
  floor: z.number().int().min(-2).max(60).nullable(),
  monthlyFee: z.number().min(0).max(100_000).nullable(),
  brfOrgNumber: z.string().regex(/^\d{6}-?\d{4}$/).nullable(),
  hasBalcony: z.boolean().nullable(),
  hasElevator: z.boolean().nullable(),
  /** Användaren måste uttryckligen samtycka till att uppgifterna sparas. */
  consent: z.literal(true),
});
export type SaleInput = z.infer<typeof SaleInputSchema>;

export interface CitySummary {
  city: string;
  sales: number;
  medianPricePerSqm: number;
}

export interface Store {
  getExtractionByHash(sha256: string): StoredExtraction | null;
  getLatestExtractionByOrg(orgNumber: string): StoredExtraction | null;
  saveExtraction(sha256: string, e: Omit<StoredExtraction, 'createdAt'>): void;
  addSale(sale: SaleInput): { id: string; deleteToken: string };
  deleteSale(id: string, deleteToken: string): boolean;
  /** Aggregat per ort. Orter med färre än `minSales` döljs för att inte röja enskilda köp. */
  salesSummary(minSales?: number): CitySummary[];
}

/** Normaliserar org.nr till formatet NNNNNN-NNNN. */
export function normalizeOrgNumber(orgNumber: string): string | null {
  const digits = orgNumber.replace(/\D/g, '');
  return digits.length === 10 ? `${digits.slice(0, 6)}-${digits.slice(6)}` : null;
}

const MIGRATIONS = [
  `CREATE TABLE extractions (
     sha256      TEXT PRIMARY KEY,
     org_number  TEXT,
     fiscal_year TEXT,
     model       TEXT NOT NULL,
     data        TEXT NOT NULL,
     created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
   );
   CREATE INDEX extractions_org ON extractions (org_number, fiscal_year);`,
  `CREATE TABLE sales (
     id             TEXT PRIMARY KEY,
     delete_token   TEXT NOT NULL,
     address        TEXT NOT NULL,
     city           TEXT NOT NULL,
     sale_date      TEXT NOT NULL,
     price          INTEGER NOT NULL,
     area           REAL NOT NULL,
     rooms          REAL,
     floor          INTEGER,
     monthly_fee    REAL,
     brf_org_number TEXT,
     has_balcony    INTEGER,
     has_elevator   INTEGER,
     consent_at     TEXT NOT NULL,
     created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
   );
   CREATE INDEX sales_city ON sales (city);`,
];

const bool = (b: boolean | null) => (b === null ? null : b ? 1 : 0);

export function openSqliteStore(path: string): Store {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  db.exec('CREATE TABLE IF NOT EXISTS schema_version (version INTEGER NOT NULL)');
  const current = (db.prepare('SELECT MAX(version) AS v FROM schema_version').get() as { v: number | null }).v ?? 0;
  for (let i = current; i < MIGRATIONS.length; i++) {
    db.exec('BEGIN');
    try {
      db.exec(MIGRATIONS[i]);
      db.prepare('INSERT INTO schema_version (version) VALUES (?)').run(i + 1);
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  }

  type Row = { org_number: string | null; fiscal_year: string | null; model: string; data: string; created_at: string };
  const toExtraction = (r: Row | undefined): StoredExtraction | null =>
    r ? { orgNumber: r.org_number, fiscalYear: r.fiscal_year, model: r.model, createdAt: r.created_at, data: JSON.parse(r.data) } : null;

  const byHash = db.prepare('SELECT * FROM extractions WHERE sha256 = ?');
  const byOrg = db.prepare('SELECT * FROM extractions WHERE org_number = ? ORDER BY fiscal_year DESC, created_at DESC LIMIT 1');
  const upsert = db.prepare(
    `INSERT INTO extractions (sha256, org_number, fiscal_year, model, data) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT (sha256) DO UPDATE SET org_number = excluded.org_number, fiscal_year = excluded.fiscal_year,
       model = excluded.model, data = excluded.data`,
  );
  const insertSale = db.prepare(
    `INSERT INTO sales (id, delete_token, address, city, sale_date, price, area, rooms, floor, monthly_fee,
       brf_org_number, has_balcony, has_elevator, consent_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`,
  );
  const removeSale = db.prepare('DELETE FROM sales WHERE id = ? AND delete_token = ?');
  const salesByCity = db.prepare('SELECT city, price, area FROM sales ORDER BY city');

  return {
    getExtractionByHash: (sha256) => toExtraction(byHash.get(sha256) as Row | undefined),
    getLatestExtractionByOrg: (orgNumber) => {
      const normalized = normalizeOrgNumber(orgNumber);
      return normalized ? toExtraction(byOrg.get(normalized) as Row | undefined) : null;
    },
    saveExtraction: (sha256, e) => {
      const org = e.orgNumber ? normalizeOrgNumber(e.orgNumber) : null;
      upsert.run(sha256, org, e.fiscalYear, e.model, JSON.stringify(e.data));
    },
    addSale: (s) => {
      const id = randomUUID();
      const deleteToken = randomBytes(16).toString('hex');
      insertSale.run(
        id, deleteToken, s.address, s.city.trim().toLowerCase(), s.saleDate, s.price, s.area, s.rooms, s.floor,
        s.monthlyFee, s.brfOrgNumber ? normalizeOrgNumber(s.brfOrgNumber) : null, bool(s.hasBalcony), bool(s.hasElevator),
      );
      return { id, deleteToken };
    },
    deleteSale: (id, token) => Number(removeSale.run(id, token).changes) > 0,
    salesSummary: (minSales = 3) => {
      const groups = new Map<string, number[]>();
      for (const r of salesByCity.all() as { city: string; price: number; area: number }[]) {
        const list = groups.get(r.city) ?? [];
        list.push(r.price / r.area);
        groups.set(r.city, list);
      }
      return [...groups]
        .filter(([, v]) => v.length >= minSales)
        .map(([city, v]) => {
          const sorted = v.sort((a, b) => a - b);
          const mid = Math.floor(sorted.length / 2);
          const median = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
          return { city, sales: v.length, medianPricePerSqm: Math.round(median) };
        });
    },
  };
}
