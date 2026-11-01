import { useState } from 'react';
import Kalkyl from './pages/Kalkyl';
import NyAnalys from './pages/NyAnalys';
import KopSalj from './pages/KopSalj';
import Brf from './pages/Brf';
import Framtid from './pages/Framtid';
import Varde from './pages/Varde';
import Slutpris from './pages/Slutpris';

const TABS = [
  { id: 'analys', label: 'Ny analys', component: NyAnalys },
  { id: 'kalkyl', label: 'Månadskostnad & KALP', component: Kalkyl },
  { id: 'kopsalj', label: 'Vad har jag råd med?', component: KopSalj },
  { id: 'brf', label: 'Granska BRF', component: Brf },
  { id: 'varde', label: 'Värdering', component: Varde },
  { id: 'framtid', label: 'Kostnad över tid', component: Framtid },
  { id: 'slutpris', label: 'Rapportera slutpris', component: Slutpris },
] as const;

export default function App() {
  const [tab, setTab] = useState<(typeof TABS)[number]['id']>('analys');
  const Active = TABS.find((t) => t.id === tab)!.component;
  return (
    <>
      <header className="header no-print">
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
