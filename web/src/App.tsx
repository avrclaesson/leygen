import { useEffect, useState } from 'react';
import Kalkyl from './pages/Kalkyl';
import NyAnalys from './pages/NyAnalys';
import KopSalj from './pages/KopSalj';
import Brf from './pages/Brf';
import Framtid from './pages/Framtid';
import Varde from './pages/Varde';
import Slutpris from './pages/Slutpris';

const TABS = [
  { id: 'analys', label: 'Ny analys', title: 'Analysera en bostad', intro: 'Fyll i annonsen och föreningens siffror. Du får värde, månadskostnad och risker samlat i en rapport.', component: NyAnalys },
  { id: 'kalkyl', label: 'Månadskostnad', title: 'Månadskostnad och KALP', intro: 'Vad kostar bostaden varje månad, och går den igenom bankens kalkyl?', component: Kalkyl },
  { id: 'budget', label: 'Budget', title: 'Vad har jag råd med?', intro: 'Räkna ut det högsta priset utifrån din inkomst, ditt sparande och en eventuell försäljning.', component: KopSalj },
  { id: 'forening', label: 'Förening', title: 'Granska föreningen', intro: 'Sätt betyg på föreningens ekonomi utifrån årsredovisningen.', component: Brf },
  { id: 'varde', label: 'Värdering', title: 'Vad är lägenheten värd?', intro: 'Utgå från priserna i området och räkna in det som skiljer just den här bostaden.', component: Varde },
  { id: 'over-tid', label: 'Över tid', title: 'Kostnad över tid', intro: 'Se hur månadskostnaden kan utvecklas när räntan rör sig och föreningen gör större åtgärder.', component: Framtid },
  { id: 'slutpris', label: 'Slutpris', title: 'Rapportera slutpris', intro: 'Bidra med vad du köpte eller sålde för, så att värderingarna kan bli bättre.', component: Slutpris },
] as const;

type TabId = (typeof TABS)[number]['id'];

const tabFromHash = (): TabId => TABS.find((t) => `#/${t.id}` === location.hash)?.id ?? 'analys';

export default function App() {
  const [tab, setTab] = useState<TabId>(tabFromHash);
  // Besökta sidor hålls monterade så att det man fyllt i finns kvar när man byter sida.
  const [visited, setVisited] = useState<Set<TabId>>(() => new Set([tabFromHash()]));

  useEffect(() => {
    const onHashChange = () => {
      const next = tabFromHash();
      setTab(next);
      setVisited((v) => new Set(v).add(next));
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  return (
    <>
      <header className="topbar no-print">
        <div className="topbar-inner">
          <a className="brand" href="#/analys">Leygen</a>
          <nav aria-label="Verktyg">
            {TABS.map((t) => (
              <a key={t.id} href={`#/${t.id}`} aria-current={t.id === tab ? 'page' : undefined}>
                {t.label}
              </a>
            ))}
          </nav>
        </div>
      </header>
      <main>
        {TABS.filter((t) => visited.has(t.id)).map((t) => (
          <div key={t.id} hidden={t.id !== tab}>
            <div className="page-head no-print">
              <h1>{t.title}</h1>
              <p>{t.intro}</p>
            </div>
            <t.component />
          </div>
        ))}
      </main>
      <footer className="footer no-print">
        Beräkningarna är förenklade uppskattningar baserade på regler från april 2026 (bolånetak 90 %, amorteringskrav 1–2 %).
        Inte finansiell rådgivning.
      </footer>
    </>
  );
}
