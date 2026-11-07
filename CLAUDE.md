# Leygen

Leygen är ett verktyg för **köpare (och säljare) av bostadsrätter i Sverige**: räkna på vad man har råd med, granska
föreningens ekonomi och värdera lägenheten. Det är **inte** en annons- eller uthyrningsplattform.

## Funktioner

- **Ny analys** (startsidan): annonsuppgifter + föreningens årsredovisning → samlad rapport med ekonomiskt värde och
  marknadsvärde, månadskostnad idag och över tid, KALP, föreningens betyg och motståndskraft vid nedgång.
- **Månadskostnad**, **Budget** (köp/sälj), **Förening**, **Värdering**, **Över tid**.
- **AI-inläsning av årsredovisningar** (PDF → nyckeltal) med Claude Sonnet 5.5 och eskalering till Opus 5.5.
- **Slutpris**: användare bidrar med slutpriser (samtycke + raderingsnyckel) för en framtida värderingsmodell.

## Struktur

- `web/` – Vite + React + TypeScript. Allt gränssnitt och all text är på svenska.
- `web/src/lib/` – ren beräkningslogik med tester (regler 2026, KALP, BRF-nyckeltal, värdering, simulering, motståndskraft).
  Lägg ny logik här, inte i komponenterna.
- `web/server/` – Node-server (kör TypeScript direkt, Node 22.18+): AI-inläsning och SQLite-databas (`node:sqlite`)
  bakom gränssnittet `Store` i `store.ts`, så att den kan flyttas till Postgres/Supabase senare.
- `.github/workflows/pages.yml` – publicerar en statisk demo (utan AI-inläsning, `VITE_DEMO=true`) på GitHub Pages
  vid push till `main`. Pages ska ha källan **GitHub Actions**.

## Kommandon (i `web/`)

```bash
npm test           # enhetstester (vitest)
npm run build      # typkontroll + bygge
npm run server     # API-server på :8787 (kräver ANTHROPIC_API_KEY för inläsning)
npm run dev        # gränssnitt på :5173, proxar /api till servern
npm run eval       # jämför modeller på årsredovisningar i eval/reports/
```

## Principer

- Siffror och tumregler ska ha en källa eller tydligt märkas som antagande i gränssnittet.
- Regler (bolånetak, amorteringskrav, ränteavdrag) ligger i `web/src/lib/rules.ts`.
- Inga skrapade data från Booli/Hemnet.
- Marknadsdata (prisfall, snittpriser per kommun) ligger i `web/src/lib/marketData.ts` med källa och datum för varje
  siffra. Hårdkoda inte sådana siffror någon annanstans.
