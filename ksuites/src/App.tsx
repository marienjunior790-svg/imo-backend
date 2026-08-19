import { useCallback, useState } from 'react';
import { Cursor } from './components/Cursor';
import { Progress } from './components/Progress';
import { Intro } from './components/Intro';
import { Nav } from './components/Nav';
import { Hero } from './components/Hero';
import { Suites } from './components/Suites';
import { SuiteDetail } from './components/SuiteDetail';
import { Experience } from './components/Experience';
import { Services } from './components/Services';
import { Location } from './components/Location';
import { About } from './components/About';
import { WhatsAppBand } from './components/WhatsAppBand';
import { Footer } from './components/Footer';
import { Booking } from './components/Booking';
import type { Suite } from './data/content';

export default function App() {
  const [booking, setBooking] = useState(false);
  const [bookingSuite, setBookingSuite] = useState<string | undefined>();
  const [suite, setSuite] = useState<Suite | null>(null);

  const openBooking = useCallback((suiteId?: string) => {
    setSuite(null);
    setBookingSuite(suiteId);
    setBooking(true);
  }, []);

  const discover = () => {
    document.getElementById('suites')?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <>
      <a className="skip-link" href="#suites">
        Aller aux suites
      </a>
      <Progress />
      <Cursor />
      <Intro />
      <Nav onReserve={() => openBooking()} />
      <main>
        <Hero onDiscover={discover} onReserve={() => openBooking()} />
        <Suites onExplore={setSuite} />
        <Experience />
        <Services />
        <Location />
        <About />
        <WhatsAppBand />
      </main>
      <Footer onReserve={() => openBooking()} />
      {suite ? (
        <SuiteDetail
          suite={suite}
          onClose={() => setSuite(null)}
          onReserve={(id) => openBooking(id)}
        />
      ) : null}
      {booking ? (
        <Booking initialSuiteId={bookingSuite} onClose={() => setBooking(false)} />
      ) : null}
    </>
  );
}
