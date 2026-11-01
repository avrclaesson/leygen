import { useState } from 'react';
import Kalkyl from './pages/Kalkyl';
import KopSalj from './pages/KopSalj';
import Brf from './pages/Brf';

const TABS = [
  { id: 'kalkyl', label: 'Månadskostnad & KALP', component: Kalkyl },
  { id: 'kopsalj', label: 'Vad har jag råd med?', component: KopSalj },
  { id: 'brf', label: 'Granska BRF', component: Brf },
] as const;

export default function App() {
  const [tab, setTab] = useState<(typeof TABS)[number]['id']>('kalkyl');
  const Active = TABS.find((t) => t.id === tab)!.component;
  return (
    <>
      <header className="header">
        <h1>Leygen</h1>
        <p>Räkna, jämför och granska innan du köper bostad.</p>
        <nav>
          {TABS.map((t) => (
            <button key={t.id} className={t.id === tab ? 'active' : ''} onClick={() => setTab(t.id)}>
              {t.label}
            </button>
          ))}
        </nav>
      </header>
      <main>
        <Active />
      </main>
      <footer className="footer">
        Beräkningarna är förenklade uppskattningar baserade på regler från april 2026 (bolånetak 90 %, amorteringskrav 1–2 %).
        Inte finansiell rådgivning.
      </footer>
    </>
  );
}
