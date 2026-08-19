import { Intro } from './components/Intro';
import { Progress } from './components/Progress';
import { GsCursor } from './components/GsCursor';
import { Nav } from './components/Nav';
import { Hero } from './components/Hero';
import { StayBeautifully } from './components/StayBeautifully';
import { Suites } from './components/Suites';
import { Experience } from './components/Experience';
import { Gallery } from './components/Gallery';
import { Cinematic } from './components/Cinematic';
import { Location } from './components/Location';
import { Booking } from './components/Booking';
import { Finale } from './components/Finale';
import { Footer } from './components/Footer';
import { WaFloat } from './components/WaFloat';

export default function App() {
  return (
    <>
      <a className="skip-link" href="#suites">Aller aux suites</a>
      <Intro />
      <Progress />
      <GsCursor />
      <Nav />
      <main>
        <Hero />
        <StayBeautifully />
        <Suites />
        <Experience />
        <Gallery />
        <Cinematic />
        <Location />
        <Booking />
        <Finale />
      </main>
      <Footer />
      <WaFloat />
    </>
  );
}
