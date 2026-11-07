# Leygen – hjälp med bostadsaffärer i Sverige

Leygen hjälper köpare (och säljare) av bostadsrätter att räkna på vad de har råd med, granska föreningens ekonomi och
värdera lägenheten – inklusive det som är svårt att prisa in, som föreningens skuld, direktverkande el, stambyte och
tomträtt.

**Demo:** https://avrclaesson.github.io/leygen/ – statisk version utan AI-inläsning och databas. Under *Ny analys*
finns "Visa ett exempel" med en påhittad årsredovisning.

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

Kräver Node 22.18+ (servern kör TypeScript direkt och använder inbyggda `node:sqlite`, som skriver ut en
experimentell varning vid start).

## Funktioner

| Flik | Innehåll |
|---|---|
| **Ny analys** (startsidan) | Annonsuppgifter + årsredovisning → samlad rapport som kan sparas som PDF. Se nedan. |
| **Månadskostnad** | Månadskostnad med verklig ränta (ränteavdrag, amortering, avgift, drift), bankens KALP med kalkylränta och schabloner, kontroll av kontantinsats och skuldkvot, känslighetstabell ränta × avgiftshöjning. |
| **Budget** | Försäljning av nuvarande bostad (vinstskatt 22 %, uppskov, mäklararvode, lösen av lån) → tillgänglig insats → högsta köpeskilling och vad som begränsar (insats, KALP eller skuldkvot). |
| **Förening** | Nyckeltal från årsredovisningen med trafikljus (skuld/kvm, sparande/kvm, räntekänslighet, avgift/kvm, energi/kvm, avgiftsandel, likviditet), varningar (tomträtt, oäkta förening, stambyte) och "verkligt pris" inklusive lägenhetens andel av föreningens lån. |
| **Värdering** | Områdespris justerat i kronor för föreningens skuld, avgift, direktverkande el, stambyte, tomträtt, hyresrätter, bottenvåning/balkong/hiss. |
| **Över tid** | Månadskostnaden 10 år framåt (2 000 simulerade räntebanor, median och 10–90-percentil), "räntan slår dubbelt" och kända händelser i föreningen. |
| **Slutpris** | Användare bidrar med slutpriser (samtycke och raderingsnyckel) – underlag för en framtida värderingsmodell. |

### Ny analys

Fyll i uppgifterna från annonsen, ladda upp årsredovisningen (eller sök föreningen på org.nr) och få en rapport med:

- **Två värden:** *ekonomiskt värde* – föreningens skuld och alla löpande kostnader omräknade till kronor idag – och
  *vad marknaden brukar betala* – kalibrerat mot vad studier uppmätt på slutpriser. Skillnaden är det marknaden inte
  tar betalt för: en risk för köparen, ofta en fördel vid försäljning.
- **Månadskostnad** idag och om 5 år, **bankens KALP** och **föreningens betyg**.
- **Kostnad över tid** med stambyte och ny tomträttsavgäld inlagda automatiskt från årsredovisningen.
- **Motståndskraft vid nedgång:** tre scenarier (mild, som 2022–23, djup kris som 90-talet). Värdeförändringen delas
  upp i marknaden (regionens prisfall från toppen 2022) och föreningen (skuld över områdets nivå ⇒ större
  avgiftshöjning när räntan stiger ⇒ större prisfall) – de två delarna med bäst underlag. Prissegment (billigare
  kvm-pris antas svänga mer) har svagt underlag och är avstängt som standard. Visar även belåningsgrad och ökad
  månadskostnad i varje scenario.

### Inläsning av årsredovisning (AI)

Servern skickar PDF:en till Claude med structured outputs och får tillbaka:

- alla fält i BRF-analysen (ytor, skulder, avgifter, resultat, avskrivningar, underhåll, energi, kassa, tomträtt,
  byggår, senaste stambyte),
- planerat stambyte (år och kostnad), tomträttsavgäld och nästa omreglering, antal hyresrätter,
- genomsnittlig ränta och lån som villkorsändras inom 12 månader (⇒ uppskattad bindningstid),
- föreningens egna nyckeltal, beslutade avgiftsändringar och iakttagelser för köpare med sidhänvisning,
- vilka värden som är osäkra.

**Modellval:** Claude Sonnet 5.5 körs först (`BRF_MODEL`). I tester av förra generationen var Sonnet tydligt bättre
än Haiku på dokument och tabeller, och kostnaden (grovt 1–2 kr per årsredovisning) betalas bara en gång per förening
tack vare cachen. En rimlighetskontroll jämför beräknad skuld/kvm och
avgift/kvm med föreningens egna nyckeltal och letar efter orimliga belopp (t.ex. tkr som inte räknats om). Avböjer
Sonnet, svarar ogiltigt eller klarar inte kontrollen körs dokumentet om med Claude Opus 5.5
(`BRF_ESCALATION_MODEL`, tom sträng stänger av). Kvarstående avvikelser visas för användaren.

**Mät kvaliteten:** lägg årsredovisningar och handkontrollerade facit-filer i `web/eval/reports/` och kör
`npm run eval -- claude-haiku-5-5 claude-sonnet-5-5` (se `web/eval/run.ts`) – visar om den billigare Haiku 5.5 räcker
(`BRF_MODEL=claude-haiku-5-5`). PDF:erna committas inte.

## Kod

| Sökväg | Innehåll |
|---|---|
| `web/src/lib/rules.ts` | Regler 2026: bolånetak, amorteringskrav, ränteavdrag, schabloner |
| `web/src/lib/mortgage.ts` | Månadskostnad, KALP, maxpris, känslighet, försäljning |
| `web/src/lib/brf.ts` | BRF-nyckeltal, betyg och varningar |
| `web/src/lib/valuation.ts` | Ekonomisk värdering och marknadsvärdering |
| `web/src/lib/projection.ts` | Simulering av kostnad över tid |
| `web/src/lib/resilience.ts` | Scenarier för nedgång |
| `web/src/lib/marketData.ts` | Marknadsdata per kommun med källa och datum – uppdateras för hand |
| `web/src/lib/analysis.ts` | Kopplar annons + årsredovisning till beräkningarna |
| `web/src/lib/brfExtractionSchema.ts` | Schema för AI-inläsningen |
| `web/server/extractBrf.ts` | Instruktioner till Claude, modellval och eskalering |
| `web/server/store.ts` | Databaslager (SQLite) |
| `web/server/index.ts` | HTTP-server och API |

All beräkningslogik är rena funktioner med tester (`npm test`). `CLAUDE.md` beskriver projektet för Claude-sessioner.

### Databas och API

SQLite via `node:sqlite` – ingen separat databastjänst. Filen hamnar i `web/data/leygen.db` (ändra med
`DATABASE_PATH`); backup = kopiera filen. Databaskoden ligger bakom gränssnittet `Store` med vanliga SQL-migreringar,
så att den kan flyttas till Postgres/Supabase när det behövs inloggning och betalning.

- **Inlästa årsredovisningar** cachas per fil och per org.nr: samma PDF läses aldrig in två gånger, och en redan inläst
  förening kan hämtas via org.nr gratis och direkt. Cachade svar som inte matchar aktuellt schema läses in på nytt.
- **Slutpriser** sparas bara med samtycke. Statistik visas bara för orter med minst tre försäljningar.

| Endpoint | Beskrivning |
|---|---|
| `POST /api/brf/extract` | PDF → nyckeltal (cachat) |
| `GET /api/brf/by-org/:orgNr` | Senast inlästa årsredovisning för föreningen |
| `POST /api/sales` | Rapportera slutpris |
| `DELETE /api/sales/:id` | Radera rapport (header `x-delete-token`) |
| `GET /api/sales/summary` | Median kr/kvm per ort |

| Miljövariabel | Standard | Beskrivning |
|---|---|---|
| `ANTHROPIC_API_KEY` | – | Krävs för AI-inläsning |
| `PORT` | `8787` | Serverns port |
| `DATABASE_PATH` | `web/data/leygen.db` | Databasfil |
| `MAX_EXTRACTIONS_PER_HOUR` | `20` | Spärr mot missbruk (cachade svar räknas inte) |
| `BRF_MODEL` / `BRF_ESCALATION_MODEL` | `claude-sonnet-5-5` / `claude-opus-5-5` | Modeller för inläsning |

## Publicering

**GitHub Pages (demo):** `.github/workflows/pages.yml` bygger med `VITE_DEMO=true` och publicerar vid varje push till
`main`. Pages ska ha källan *GitHub Actions* (Settings → Pages). I demon är AI-inläsning och slutprisrapportering
avstängda.

**Hela appen via Tailscale Funnel (från din dator):**
```bash
cd web && npm install && npm run build
ANTHROPIC_API_KEY=sk-ant-... npm start      # http://localhost:8787
tailscale funnel 8787                        # publik https-länk: https://<dator>.<tailnet>.ts.net
```
Använd `tailscale serve 8787` om bara ditt tailnet ska komma åt den. Datorn måste vara igång.

## Antaganden och källor

### Regler (från 1 april 2026)

- Bolånetak 90 % (minst 10 % kontantinsats).
- Amorteringskrav: 2 % vid belåningsgrad > 70 %, 1 % vid 50–70 %. Det skärpta kravet för skuldkvot > 4,5 är slopat.
- Kalkylränta 7 % och max skuldkvot 5,5 (justerbara).
- Ränteavdrag 30 % upp till 100 000 kr/år, 21 % därutöver. Vinstskatt 22 %.
- Levnadskostnader: ungefärliga schabloner (13 000 kr första vuxen, +9 000 kr per ytterligare vuxen, 5 000 kr/barn,
  4 000 kr/bil). **Bör ersättas med Konsumentverkets officiella tabell.**

Verifiera mot Finansinspektionen och Konsumentverket innan lansering.

### Värdering och motståndskraft

| Antagande | Källa |
|---|---|
| +1 000 kr/mån i avgift ⇒ 2–3 % lägre pris (vi använder 2,5 %) | [Wilhelmsson, KTH 2025](https://ideas.repec.org/p/hhs/kthrec/2025_013.html) |
| Tomträtt −3,6 % centralt, −6,8 % i förort | [Boberg, Donner & Metsalo, KTH 2025](https://ideas.repec.org/p/hhs/kthrec/2025_010.html) |
| Balkong +1,9 % | [Booli 2024](https://www.booli.se/kunskap/sa-mycket-okar-vardet-om-din-lagenhet-har-balkong) |
| Prisfall från toppen 2022: Stockholm −12 %, Malmö −13 %, Uppsala −15 %, Göteborg −17 %, riket −14 % | Svensk Mäklarstatistik via [Placera 2026-10-28](https://www.placera.se/nyheter/bostadsratterna-forbi-pristoppen-2022-villorna-har-en-bit-kvar-2026-10-28) |
| 90-talskrisen: villapriserna −21 %, ca 7 år till återhämtning | [Nordea](https://www.nordea.com/sv/nyhet/storm-pa-bostadsmarknaden-i-sverige) |
| Billigare prissegment svänger mer (avstängt som standard) | Amerikanska data ([Springer 2015](https://link.springer.com/article/10.1007/s11146-015-9523-2)). Svagt i Sverige: Malmö är billigt men föll lika lite som Stockholm 2022, och kvm-pris blandar ihop läge med storlek. |
| Kommunens snittpris (för prissegment) | Svensk Mäklarstatistik: Stor-Stockholm 69 556 kr/kvm (okt 2025), Stor-Malmö 35 787 (mar 2026), riket 47 995 (maj 2026). Göteborg och Uppsala saknas. |
| Ekonomisk värdering kapitaliserar löpande kostnader med 5 % (100 kr/mån ≈ 24 000 kr) | Antagande |
| Bottenvåning −5 %, ingen hiss högt upp −5 % | Tumregler, inte uppmätta |
| Stambyte, direktverkande el | Inga studier hittade – kostnadsbaserade antaganden |

## Data – vad som finns och inte

- **Booli/Hemnet:** inget öppet API. Booli Pro och datalicenser kräver offert. Skrapning används inte (databasskydd i
  49 § upphovsrättslagen och användarvillkor).
- **Slutpriser för bostadsrätter** registreras inte offentligt. Ett nationellt bostadsrättsregister väntas ca 2030,
  men det är oklart om priser ingår. Därför samlar appen in slutpriser från användare.
- **SCB:s fastighetsprisregister** (Lantmäteriets lagfarter) har köpeskillingar för villor och radhus – beställs via SCB.
- **Öppna källor att koppla in:** Skatteverkets skattetabeller (nettolön), SCB och Riksbanken (prisindex, räntor),
  Boverkets energideklarationer, Konsumentverkets schabloner, Bolagsverkets API (föreningsuppgifter).

Läsning om att granska en BRF: [Boverket – nyckeltal](https://www.boverket.se/sv/ekonomiska-planer/ekonomisk-plan/nyckeltal/),
[Boio – BRF-ekonomi](https://boio.se/guide/brf-ekonomi), [Boio – årsredovisningen](https://boio.se/guide/brf-arsredovisning).

## Nästa steg

**Snart**
- Nettolön från bruttolön med Skatteverkets skattetabeller.
- Driftsätta servern (t.ex. Fly.io/Railway/Render i EU) så att AI-inläsning och databas fungerar för alla.
- Integritetspolicy innan slutpriser samlas in från andra.
- Flera års årsredovisningar: trend i skuld och sparande.

**Sedan**
- Värderingsmodell (XGBoost) när det finns tillräckligt med slutpriser – från användare, mäklarsamarbete eller Booli.
- Mäta stambytets priseffekt med egna data (ingen studie finns).
- Inloggning, köp av analyser och flytt av databasen till Supabase.
- Budtak inför visning, köpa före sälja/brygglån, jämföra bostäder sida vid sida, checklista inför köp.
- Hyra vs. köpa, räntebindning, delat ägande, bevakning av en förening.
