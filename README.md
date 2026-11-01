# Leygen – hjälp med bostadsaffärer i Sverige

En webbapp som hjälper dig att räkna på, jämföra och granska bostäder innan du köper.

## Kom igång

```bash
cd web
npm install
export ANTHROPIC_API_KEY=sk-ant-...   # krävs för inläsning av årsredovisningar
npm run server  # API-server på :8787 (i en terminal)
npm run dev     # gränssnittet på :5173, proxar /api till servern (i en annan)
npm test        # enhetstester
npm run build && npm start   # produktion: servern serverar även dist/
```

Servern kräver Node 22.18+ (kör TypeScript direkt).

## Dela en demo

**Alternativ A – GitHub Pages (statisk demo, utan AI-inläsning)**
1. Pages för privata repon kräver GitHub Pro/Team. Annars: gör repot publikt.
2. Settings → Pages → Source: **GitHub Actions**.
3. Merga till `main` (eller kör workflowen *Deploy demo to GitHub Pages* manuellt).
4. Demon hamnar på `https://<användare>.github.io/leygen/`. Under Granska BRF finns "Visa ett exempel" i stället för uppladdning.

**Alternativ B – Tailscale Funnel (hela appen, från din dator)**
```bash
cd web && npm install && npm run build
ANTHROPIC_API_KEY=sk-ant-... npm start      # http://localhost:8787
tailscale funnel 8787                        # publik https-länk: https://<dator>.<tailnet>.ts.net
```
- Funnel måste vara tillåtet i tailnetets inställningar (Tailscale frågar första gången).
- Ska bara personer i ditt tailnet komma åt den: använd `tailscale serve 8787` i stället.
- Servern tillåter max 20 inläsningar per timme (`MAX_EXTRACTIONS_PER_HOUR`) så att en publik länk inte kan dra iväg kostnader. Datorn måste vara igång.

## Ny analys (startsidan)

Ett flöde för en bostad: fyll i uppgifterna från annonsen, ladda upp årsredovisningen (eller sök föreningen på org.nr)
och få en samlad rapport som kan skrivas ut eller sparas som PDF:

- **Två värden:** *ekonomiskt värde* (föreningens skuld och löpande kostnader omräknade till kronor) och
  *vad marknaden brukar betala* (kalibrerat mot studier: −2,5 % per 1 000 kr/mån högre avgift enligt Wilhelmsson,
  KTH 2025; tomträtt −3,6 % centralt / −6,8 % förort enligt Boberg m.fl., KTH 2025; balkong +1,9 % enligt Booli 2024).
  Skillnaden är det marknaden inte tar betalt för.
- Månadskostnad idag och om 5 år, bankens KALP, föreningens betyg.
- Kostnad över tid med stambyte och ny tomträttsavgäld inlagda automatiskt från årsredovisningen.

Kopplingen mellan annons, årsredovisning och beräkningar finns i `web/src/lib/analysis.ts`.

## Funktioner (v0.1)

| Flik | Innehåll |
|---|---|
| **Månadskostnad & KALP** | Månadskostnad med verklig ränta (ränteavdrag, amortering, avgift, drift), bankens KALP-kalkyl med kalkylränta och schabloner, kontroll av kontantinsats och skuldkvot, känslighetstabell för ränta × avgiftshöjning. |
| **Vad har jag råd med?** | Försäljning av nuvarande bostad (vinstskatt 22 %, uppskov, mäklararvode, lösen av lån) → tillgänglig insats → högsta köpeskilling, med info om vad som begränsar (insats, KALP eller skuldkvot). |
| **Granska BRF** | Nyckeltal från årsredovisningen (skuld/kvm, sparande/kvm, räntekänslighet, avgift/kvm, energi/kvm, avgiftsandel, likviditet) med trafikljus, varningar (tomträtt, oäkta förening, stambyte) och "verkligt pris" inklusive lägenhetens andel av föreningens lån. |

### Läs in årsredovisning (AI)

Ladda upp föreningens årsredovisning som PDF under **Granska BRF**. Servern (`web/server/`) skickar dokumentet till Claude (`claude-opus-5-5`) med structured outputs och får tillbaka:

- alla fält i BRF-analysen (ytor, skulder, avgifter, resultat, avskrivningar, underhåll, energi, kassa, tomträtt, byggår, stambyte),
- genomsnittlig ränta och lån som ska omförhandlas inom 12 månader,
- föreningens egna nyckeltal (för kontroll mot våra beräkningar),
- beslutade avgiftsändringar och en lista med iakttagelser för köpare (stambyte, ränteförfall, tvister, revisorns anmärkningar m.m.),
- vilka värden som är osäkra/tolkade.

Fälten fylls i automatiskt och markeras i blått. Schemat finns i `web/src/lib/brfExtractionSchema.ts` och instruktionerna (var varje uppgift finns, tkr→kr, vilken kolumn) i `web/server/extractBrf.ts`.

**Modellval:** Claude Haiku 5.5 körs först (`BRF_MODEL`). Resultatet går igenom en rimlighetskontroll (`checkConsistency`): beräknad skuld/kvm och avgift/kvm jämförs med föreningens egna nyckeltal, och orimliga storlekar (t.ex. tkr som inte räknats om) flaggas. Om Haiku avböjer, svarar ogiltigt eller inte klarar kontrollen körs dokumentet om med Claude Opus 5.5 (`BRF_ESCALATION_MODEL`, sätt till tom sträng för att stänga av). Kvarstående avvikelser visas för användaren.

**Mät kvaliteten:** lägg årsredovisningar och handkontrollerade facit-filer i `web/eval/reports/` och kör `npm run eval -- claude-haiku-5-5 claude-opus-5-5`. Se `web/eval/run.ts`.

### Värdering (Värdering-fliken)

Utgår från områdets kvm-pris för en "normal" lägenhet och justerar i kronor för det som är svårt att prisa in:
föreningens skuld (krona för krona), avgift exkl. räntedel (kapitaliserad), direktverkande el, kommande stambyte,
höjd tomträttsavgäld, hyresrätter som kan säljas, samt bottenvåning/balkong/hiss (tumregler). Löpande kostnader
kapitaliseras med en diskonteringsränta (5 % ⇒ 100 kr/mån ≈ 24 000 kr). Logik: `web/src/lib/valuation.ts`.

### Kostnad över tid (Kostnad över tid-fliken)

Monte Carlo-simulering (2 000 räntebanor) av månadskostnaden 10 år framåt, visad som median och 10–90-percentil.
Räntan slår både på det egna lånet och – med fördröjning enligt föreningens bindningstid – på avgiften via
föreningens lån. Kända händelser (stambyte som ökar föreningens skuld, höjd tomträttsavgäld) läggs in per år.
Logik: `web/src/lib/projection.ts`.

### Databas

SQLite via Nodes inbyggda `node:sqlite` – ingen separat databastjänst. Filen hamnar i `web/data/leygen.db`
(ändra med `DATABASE_PATH`). Backup = kopiera filen. All databaskod ligger bakom gränssnittet `Store` i
`web/server/store.ts`, med vanliga SQL-migreringar, så att den kan flyttas till Postgres/Supabase senare.

- **Inlästa årsredovisningar** cachas per fil (SHA-256) och per org.nr. Samma PDF läses aldrig in två gånger, och
  andra användare kan hämta en redan inläst förening via org.nr under Granska BRF – gratis och direkt.
- **Slutpriser** kan rapporteras under fliken *Rapportera slutpris* (kräver samtycke). Användaren får en
  raderingsnyckel. Statistik visas bara för orter med minst tre försäljningar.

| Endpoint | Beskrivning |
|---|---|
| `POST /api/brf/extract` | PDF → nyckeltal (cachat) |
| `GET /api/brf/by-org/:orgNr` | Senast inlästa årsredovisning för föreningen |
| `POST /api/sales` | Rapportera slutpris |
| `DELETE /api/sales/:id` | Radera rapport (header `x-delete-token`) |
| `GET /api/sales/summary` | Median kr/kvm per ort |

All beräkningslogik ligger i `web/src/lib/` som rena funktioner och är testad (`npm test`).

### Regler som används (från 1 april 2026)

- Bolånetak 90 % (minst 10 % kontantinsats).
- Amorteringskrav: 2 % vid belåningsgrad > 70 %, 1 % vid 50–70 %. Det skärpta kravet för skuldkvot > 4,5 är slopat.
- Kalkylränta 7 % (justerbar), max skuldkvot 5,5 (justerbar).
- Ränteavdrag 30 % upp till 100 000 kr/år, 21 % därutöver.
- Levnadskostnader: ungefärliga schabloner (13 000 kr första vuxen, +9 000 kr per ytterligare vuxen, 5 000 kr/barn, 4 000 kr/bil). **Bör ersättas med Konsumentverkets officiella tabell.**

Alla konstanter finns i `web/src/lib/rules.ts`. Verifiera mot Finansinspektionen innan lansering.

## Research

### Finns det ett Booli-API?

Inte något öppet idag. Booli hade tidigare ett API för utvecklare (api.booli.se), men det finns inget publikt dokumenterat API nu. Alternativ:

- **Scrapers från tredje part** (t.ex. Apify). Inte sanktionerade av Booli och kan strida mot deras villkor – olämpligt att bygga en produkt på.
- **Booli Pro** – betald analystjänst för proffs; kontakta Booli om datasamarbete.
- **Hemnet** har inte heller något öppet API.

**Rekommendation:** Skippa annonssök i början. Låt användaren klistra in en annonslänk eller mata in pris/avgift/yta manuellt. Om produkten får fäste – kontakta Booli/Hemnet om partnerskap.

### Datakällor som går att använda

| Källa | Vad | Användning |
|---|---|---|
| Bolagsverket – "värdefulla datamängder" (gratis API) | Grunduppgifter om företag/föreningar | Slå upp BRF via org.nr. Årsredovisningar för BRF verkar *inte* ingå (bara aktiebolag) – verifiera. |
| TIC.io (betald) | BRF-endpoint med fastigheter och historiska bokslut | Automatisk BRF-analys utan manuell inmatning. |
| SCB (öppet API) | Prisindex, bostadsbestånd, inkomster per område | Prisutveckling och områdesstatistik. |
| Riksbanken (öppet API) | Styrränta, STIBOR | Ränteantaganden i känslighetsanalysen. |
| Boverket – energideklarationer | Energiklass per byggnad | Komplettera BRF-analysen. |
| Konsumentverket | Schabloner för levnadskostnader | Uppdatera KALP-schablonerna årligen. |
| Lantmäteriet | Fastighetsinfo, tomträtt | Kräver avtal för de flesta tjänster. |

### Läsning om att granska en BRF

- Boverket: [Nyckeltal ska redovisas i den ekonomiska planen](https://www.boverket.se/sv/ekonomiska-planer/ekonomisk-plan/nyckeltal/)
- Boio: [BRF-ekonomi med kalkylator](https://boio.se/guide/brf-ekonomi) och [Läsa årsredovisningen](https://boio.se/guide/brf-arsredovisning)
- BFN: [Remiss om informationsinnehåll i brf:s årsredovisning](https://www.bfn.se/wp-content/uploads/remiss-informationsinnehall-brfs-arsredovisning.pdf)

## Idéer på fler funktioner

**Hög prioritet**
1. ~~AI-läsning av årsredovisning~~ ✅ Nästa steg: jämför flera års redovisningar (trend i skuld/sparande), läs även ekonomisk plan och stadgar.
2. **Budtak** – sätt ett tak innan visningen: "vid X kr blir min månadskostnad Y och KALP Z".
3. **Köpa före sälja / brygglån** – dubbla boendekostnader och brygglånets kostnad om försäljningen drar ut.
4. **Jämför bostäder sida vid sida** – månadskostnad, verkligt pris/kvm, BRF-betyg.
5. **Checklista inför köp** – frågor till mäklare/styrelse (avgiftshöjningar, stambyte, föreningens lån, andrahandsuthyrning, tvister), besiktning, överlåtelseavtal.

**Medel**
6. **Hyra vs. köpa** – alternativkostnad för insatsen, värdeutveckling, transaktionskostnader.
7. **Räntebindning** – rörligt vs. bundet, historik från Riksbanken.
8. **Prisutveckling i området** – SCB.
9. **Skatt vid försäljning över tid** – uppskov, kapitalförlust (50 % avdragsgill).
10. **Delat ägande** – ägarandelar vid olika insats, samboavtal.

**Senare**
11. Bevakning av en BRF (ny årsredovisning, avgiftsändring).
12. Renovering: vad är förbättringsutgift, vad höjer värdet.
13. Inloggning och sparade scenarier.
