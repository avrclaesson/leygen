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
